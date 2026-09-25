-- ============================================================
-- PERM01B-1 — MATCH PERMISSIONS
-- ============================================================
-- Delegates match approval/moderation to active MEMBER accounts
-- with can_approve_matches = true while preserving ADMIN authority.
--
-- Opponent confirmation/rejection and creator-owned MEMBER flows
-- intentionally remain governed by their existing eligibility rules.
-- ============================================================


-- ------------------------------------------------------------
-- APPROVE MATCH
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_match(
    p_match_id uuid,
    p_algorithm_version text DEFAULT 'V1.1'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid;
  v_role text;
  v_is_active boolean;
  v_can_approve_matches boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ';
  end if;

  select
    role,
    is_active,
    can_approve_matches
  into
    v_role,
    v_is_active,
    v_can_approve_matches
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Không tìm thấy hồ sơ người dùng';
  end if;

  if coalesce(v_is_active, false) = false then
    raise exception 'Tài khoản đã bị vô hiệu hóa';
  end if;

  if upper(coalesce(v_role, '')) <> 'ADMIN'
     and coalesce(v_can_approve_matches, false) = false then
    raise exception 'MATCH_APPROVAL_PERMISSION_REQUIRED';
  end if;

  return public._approve_match_internal(
    p_match_id,
    p_algorithm_version,
    v_user_id,
    null
  );
end;
$function$;


-- ------------------------------------------------------------
-- REJECT PENDING MATCH
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_pending_match(
    p_match_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid;
    v_role text;
    v_is_active boolean;
    v_can_approve_matches boolean;
    v_match public.matches%rowtype;
begin
    perform pg_advisory_xact_lock(726184501);

    if p_match_id is null then
        raise exception 'MATCH_ID_REQUIRED';
    end if;

    if p_reason is null
       or btrim(p_reason) = '' then
        raise exception 'REJECT_REASON_REQUIRED';
    end if;

    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select
        role,
        is_active,
        can_approve_matches
    into
        v_role,
        v_is_active,
        v_can_approve_matches
    from public.profiles
    where id = v_user_id;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if coalesce(v_is_active, false) = false then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_role, '')) <> 'ADMIN'
       and coalesce(v_can_approve_matches, false) = false then
        raise exception 'MATCH_APPROVAL_PERMISSION_REQUIRED';
    end if;

    select *
    into v_match
    from public.matches
    where id = p_match_id
    for update;

    if not found then
        raise exception 'MATCH_NOT_FOUND';
    end if;

    if v_match.status <> 'PENDING' then
        raise exception
            'MATCH_NOT_PENDING: %',
            v_match.status;
    end if;

    perform set_config(
        'app.match_workflow',
        'REJECT_MATCH',
        true
    );

    update public.matches
    set
        status = 'INVALID',
        invalid_reason = btrim(p_reason),
        updated_at = now()
    where id = p_match_id;

    perform set_config(
        'app.match_workflow',
        '',
        true
    );

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason,
        created_at
    )
    values (
        v_user_id,
        'REJECT_PENDING_MATCH',
        'matches',
        p_match_id,
        jsonb_build_object(
            'status', v_match.status,
            'invalid_reason', v_match.invalid_reason
        ),
        jsonb_build_object(
            'status', 'INVALID',
            'invalid_reason', btrim(p_reason),
            'engine', 'MATCH_REJECT_V1'
        ),
        btrim(p_reason),
        now()
    );

    return jsonb_build_object(
        'success', true,
        'match_id', p_match_id,
        'status_before', v_match.status,
        'status_after', 'INVALID',
        'reason', btrim(p_reason)
    );
end;
$function$;


-- ------------------------------------------------------------
-- CREATE REPLACEMENT MATCH
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_replacement_match(
    p_voided_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_role text;
    v_is_active boolean;
    v_can_approve_matches boolean;

    v_source public.matches%ROWTYPE;
    v_new_match_id uuid;
    v_player_count integer := 0;
BEGIN
    PERFORM pg_advisory_xact_lock(726184501);

    IF p_voided_match_id IS NULL THEN
        RAISE EXCEPTION 'voided_match_id không được NULL';
    END IF;

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION
            'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ';
    END IF;

    SELECT
        role,
        is_active,
        can_approve_matches
    INTO
        v_role,
        v_is_active,
        v_can_approve_matches
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy hồ sơ người dùng';
    END IF;

    IF coalesce(v_is_active, false) = false THEN
        RAISE EXCEPTION 'Tài khoản đã bị vô hiệu hóa';
    END IF;

    IF upper(coalesce(v_role, '')) <> 'ADMIN'
       AND coalesce(v_can_approve_matches, false) = false THEN
        RAISE EXCEPTION 'MATCH_APPROVAL_PERMISSION_REQUIRED';
    END IF;

    SELECT *
    INTO v_source
    FROM public.matches
    WHERE id = p_voided_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Không tìm thấy trận đấu nguồn: %',
            p_voided_match_id;
    END IF;

    IF v_source.status <> 'VOIDED' THEN
        RAISE EXCEPTION
            'Chỉ trận VOIDED mới được tạo replacement. Trạng thái hiện tại: %',
            v_source.status;
    END IF;

    IF v_source.match_type = 'SELF_REPORTED' THEN
        RAISE EXCEPTION 'SELF_REPORTED_HISTORICAL_ONLY';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.matches m
        WHERE m.replaces_match_id = p_voided_match_id
    ) THEN
        RAISE EXCEPTION
            'Trận VOIDED này đã có replacement';
    END IF;

    SELECT count(*)
    INTO v_player_count
    FROM public.match_players mp
    WHERE mp.match_id = p_voided_match_id;

    IF v_player_count <> 4 THEN
        RAISE EXCEPTION 'Trận nguồn không có đúng 4 VĐV';
    END IF;

    IF (
        SELECT count(*)
        FROM public.match_players mp
        WHERE mp.match_id = p_voided_match_id
          AND mp.team = 'A'
    ) <> 2 THEN
        RAISE EXCEPTION 'Trận nguồn không có đúng 2 VĐV đội A';
    END IF;

    IF (
        SELECT count(*)
        FROM public.match_players mp
        WHERE mp.match_id = p_voided_match_id
          AND mp.team = 'B'
    ) <> 2 THEN
        RAISE EXCEPTION 'Trận nguồn không có đúng 2 VĐV đội B';
    END IF;

    INSERT INTO public.matches (
        played_at,
        match_number,
        match_type,
        score_mode,
        team_a_score,
        team_b_score,
        status,
        invalid_reason,
        notes,
        tournament_id,
        league_id,
        created_by,
        created_at,
        updated_at,
        replaces_match_id
    )
    VALUES (
        v_source.played_at,
        v_source.match_number,
        v_source.match_type,
        v_source.score_mode,
        v_source.team_a_score,
        v_source.team_b_score,
        'PENDING',
        NULL,
        CASE
            WHEN v_source.notes IS NULL
                 OR btrim(v_source.notes) = ''
            THEN
                'Replacement của trận '
                || p_voided_match_id::text
            ELSE
                v_source.notes
                || E'\nReplacement của trận '
                || p_voided_match_id::text
        END,
        v_source.tournament_id,
        v_source.league_id,
        v_user_id,
        now(),
        now(),
        p_voided_match_id
    )
    RETURNING id INTO v_new_match_id;

    INSERT INTO public.match_players (
        match_id,
        player_id,
        team,
        partner_player_id,
        created_at
    )
    SELECT
        v_new_match_id,
        mp.player_id,
        mp.team,
        mp.partner_player_id,
        now()
    FROM public.match_players mp
    WHERE mp.match_id = p_voided_match_id
    ORDER BY mp.team, mp.player_id;

    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason,
        created_at
    )
    VALUES (
        v_user_id,
        'CREATE_REPLACEMENT_MATCH',
        'matches',
        v_new_match_id,
        jsonb_build_object(
            'source_match_id', p_voided_match_id,
            'source_status', v_source.status
        ),
        jsonb_build_object(
            'replacement_match_id', v_new_match_id,
            'replaces_match_id', p_voided_match_id,
            'match_type', v_source.match_type,
            'tournament_id', v_source.tournament_id,
            'league_id', v_source.league_id,
            'status', 'PENDING',
            'player_count', v_player_count,
            'engine', 'MATCH_REPLACEMENT_P1'
        ),
        'Tạo trận PENDING thay thế cho trận VOIDED',
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'source_match_id', p_voided_match_id,
        'replacement_match_id', v_new_match_id,
        'status', 'PENDING',
        'players_cloned', v_player_count,
        'tournament_id', v_source.tournament_id,
        'league_id', v_source.league_id
    );
END;
$function$;


-- ------------------------------------------------------------
-- VOID MATCH
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.void_match(
    p_match_id uuid,
    p_reason text,
    p_algorithm_version text DEFAULT 'V1.1'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid;
    v_role text;
    v_is_active boolean;
    v_can_approve_matches boolean;

    v_match public.matches%rowtype;
    v_rating_result jsonb;

    v_contribution_count integer := 0;
    v_contributions_adjusted integer := 0;

    v_original_cash_count integer := 0;
    v_refund_created_count integer := 0;
    v_existing_refund_count integer := 0;

    r_tx record;
    v_refund_transaction_id uuid;
begin
    perform pg_advisory_xact_lock(726184501);

    if p_match_id is null then
        raise exception 'match_id không được NULL';
    end if;

    if p_reason is null
       or btrim(p_reason) = '' then
        raise exception 'Lý do VOID không được để trống';
    end if;

    if p_algorithm_version is null
       or btrim(p_algorithm_version) = '' then
        raise exception 'algorithm_version không được để trống';
    end if;

    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ';
    end if;

    select
        role,
        is_active,
        can_approve_matches
    into
        v_role,
        v_is_active,
        v_can_approve_matches
    from public.profiles
    where id = v_user_id;

    if not found then
        raise exception 'Không tìm thấy hồ sơ người dùng';
    end if;

    if coalesce(v_is_active, false) = false then
        raise exception 'Tài khoản đã bị vô hiệu hóa';
    end if;

    if upper(coalesce(v_role, '')) <> 'ADMIN'
       and coalesce(v_can_approve_matches, false) = false then
        raise exception 'MATCH_APPROVAL_PERMISSION_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.rating_settings rs
        where rs.algorithm_version = p_algorithm_version
    ) then
        raise exception
            'Không tồn tại Rating algorithm version: %',
            p_algorithm_version;
    end if;

    select *
    into v_match
    from public.matches
    where id = p_match_id
    for update;

    if not found then
        raise exception
            'Không tìm thấy trận đấu: %',
            p_match_id;
    end if;

    if v_match.status <> 'APPROVED' then
        raise exception
            'Không thể VOID trận %. Trạng thái hiện tại: %. Chỉ APPROVED mới được VOID',
            p_match_id,
            v_match.status;
    end if;

    select count(*)
    into v_contribution_count
    from public.fund_contributions fc
    where fc.match_id = p_match_id;

    update public.fund_contributions
    set status = 'DIEU_CHINH'
    where match_id = p_match_id
      and status <> 'DIEU_CHINH';

    get diagnostics
        v_contributions_adjusted = row_count;

    for r_tx in
        select
            ft.id,
            ft.transaction_date,
            ft.transaction_type,
            ft.amount,
            ft.description,
            ft.player_id,
            ft.match_id,
            ft.payment_id
        from public.fund_transactions ft
        where ft.match_id = p_match_id
          and ft.transaction_type in (
              'THU_QUY_THUA_TRAN',
              'THU_QUY_HOA'
          )
        order by
            ft.transaction_date,
            ft.id
    loop
        v_original_cash_count :=
            v_original_cash_count + 1;

        if exists (
            select 1
            from public.fund_transactions rev
            where rev.reversal_of_transaction_id = r_tx.id
        ) then
            v_existing_refund_count :=
                v_existing_refund_count + 1;
        else
            insert into public.fund_transactions (
                transaction_date,
                transaction_type,
                amount,
                description,
                player_id,
                match_id,
                tournament_id,
                created_by,
                created_at,
                payment_id,
                reversal_of_transaction_id
            )
            values (
                now(),
                'HOAN_TIEN',
                r_tx.amount,
                'Hoàn tiền do VOID trận đấu',
                r_tx.player_id,
                r_tx.match_id,
                null,
                v_user_id,
                now(),
                null,
                r_tx.id
            )
            returning id
            into v_refund_transaction_id;

            v_refund_created_count :=
                v_refund_created_count + 1;
        end if;
    end loop;

    perform set_config(
        'app.match_workflow',
        'VOID_MATCH',
        true
    );

    update public.matches
    set
        status = 'VOIDED',
        invalid_reason = btrim(p_reason),
        updated_at = now()
    where id = p_match_id;

    perform set_config(
        'app.match_workflow',
        '',
        true
    );

    v_rating_result :=
        public._rebuild_ratings_internal(
            p_algorithm_version,
            v_user_id
        );

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason,
        created_at
    )
    values (
        v_user_id,
        'VOID_MATCH',
        'matches',
        p_match_id,
        jsonb_build_object(
            'status', v_match.status,
            'invalid_reason', v_match.invalid_reason
        ),
        jsonb_build_object(
            'status', 'VOIDED',
            'void_reason', btrim(p_reason),
            'algorithm_version', p_algorithm_version,
            'contribution_count', v_contribution_count,
            'contributions_adjusted', v_contributions_adjusted,
            'original_cash_transactions', v_original_cash_count,
            'refunds_created', v_refund_created_count,
            'existing_refunds', v_existing_refund_count,
            'rating_result', v_rating_result,
            'engine', 'MATCH_VOID_V1'
        ),
        btrim(p_reason),
        now()
    );

    return jsonb_build_object(
        'success', true,
        'match_id', p_match_id,
        'status_before', v_match.status,
        'status_after', 'VOIDED',
        'reason', btrim(p_reason),
        'algorithm_version', p_algorithm_version,
        'contributions_found', v_contribution_count,
        'contributions_adjusted', v_contributions_adjusted,
        'original_cash_transactions', v_original_cash_count,
        'refunds_created', v_refund_created_count,
        'existing_refunds', v_existing_refund_count,
        'rating', v_rating_result
    );
end;
$function$;


-- ------------------------------------------------------------
-- MATCH MANAGEMENT READ PATH
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_match_management_matches()
RETURNS SETOF public.matches
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor
          and p.is_active = true
          and (
              upper(coalesce(p.role, '')) = 'ADMIN'
              or coalesce(p.can_approve_matches, false) = true
          )
    ) then
        raise exception 'MATCH_APPROVAL_PERMISSION_REQUIRED';
    end if;

    return query
    select m.*
    from public.matches m
    order by m.played_at asc, m.id asc;
end;
$function$;


CREATE OR REPLACE FUNCTION public.get_match_management_players()
RETURNS SETOF public.match_players
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor
          and p.is_active = true
          and (
              upper(coalesce(p.role, '')) = 'ADMIN'
              or coalesce(p.can_approve_matches, false) = true
          )
    ) then
        raise exception 'MATCH_APPROVAL_PERMISSION_REQUIRED';
    end if;

    return query
    select mp.*
    from public.match_players mp
    order by mp.created_at asc, mp.id asc;
end;
$function$;


-- ------------------------------------------------------------
-- EXECUTE PRIVILEGES
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_match_management_matches()
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_match_management_matches()
FROM anon;

GRANT EXECUTE ON FUNCTION public.get_match_management_matches()
TO authenticated;


REVOKE ALL ON FUNCTION public.get_match_management_players()
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_match_management_players()
FROM anon;

GRANT EXECUTE ON FUNCTION public.get_match_management_players()
TO authenticated;


-- Preserve restricted access to explicit algorithm-version VOID.
REVOKE ALL ON FUNCTION public.void_match(uuid, text, text)
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.void_match(uuid, text, text)
FROM anon;

REVOKE ALL ON FUNCTION public.void_match(uuid, text, text)
FROM authenticated;