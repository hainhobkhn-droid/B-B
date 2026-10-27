-- IAM-MATCH-SELF-APPROVAL-P3: independent MEMBER privileged review.
-- ADMIN override and opponent confirmation/rejection paths remain unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.approve_match(p_match_id uuid, p_algorithm_version text DEFAULT 'V1.1'::text)
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
  v_player_id uuid;
  v_match public.matches%rowtype;
begin
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;
  perform pg_advisory_xact_lock(726184501);
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ';
  end if;

  select
    role,
    is_active,
    can_approve_matches,
    player_id
  into
    v_role,
    v_is_active,
    v_can_approve_matches,
    v_player_id
  from public.profiles
  where id = v_user_id
  for share;

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

  select * into v_match from public.matches
  where id = p_match_id for update;
  -- Preserve existing missing/NULL match errors in the approval engine.
  if found then
  -- MEMBER privileged review requires an independent creator and participant.
  -- Match lock and the existing workflow advisory lock serialize roster changes.
  if upper(coalesce(v_role, '')) <> 'ADMIN' then
    if v_match.created_by = v_user_id then
      raise exception 'MATCH_FOUR_EYES_CREATOR_DENIED' using errcode = '42501';
    end if;
    if v_player_id is not null and exists (
      select 1 from public.match_players mp
      where mp.match_id = p_match_id and mp.player_id = v_player_id
    ) then
      raise exception 'MATCH_FOUR_EYES_PARTICIPANT_DENIED' using errcode = '42501';
    end if;
  end if;

  end if;

  return public._approve_match_internal(
    p_match_id,
    p_algorithm_version,
    v_user_id,
    null
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reject_pending_match(p_match_id uuid, p_reason text)
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
    v_player_id uuid;
    v_match public.matches%rowtype;
begin
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;
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
        can_approve_matches,
      player_id
    into
        v_role,
        v_is_active,
        v_can_approve_matches,
      v_player_id
    from public.profiles
    where id = v_user_id
    for share;

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

  -- MEMBER privileged review requires an independent creator and participant.
  -- Match lock and the existing workflow advisory lock serialize roster changes.
  if upper(coalesce(v_role, '')) <> 'ADMIN' then
    if v_match.created_by = v_user_id then
      raise exception 'MATCH_FOUR_EYES_CREATOR_DENIED' using errcode = '42501';
    end if;
    if v_player_id is not null and exists (
      select 1 from public.match_players mp
      where mp.match_id = p_match_id and mp.player_id = v_player_id
    ) then
      raise exception 'MATCH_FOUR_EYES_PARTICIPANT_DENIED' using errcode = '42501';
    end if;
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
$function$
;
COMMIT;
