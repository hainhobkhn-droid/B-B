-- PERM01B-2 Tournament Permissions
-- Generated from current production function definitions.

CREATE OR REPLACE FUNCTION public.change_tournament_registration_status(p_registration_id uuid, p_new_status text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_uid uuid;
    v_profile public.profiles%rowtype;
    v_registration public.tournament_registrations%rowtype;
    v_old_registration public.tournament_registrations%rowtype;
    v_tournament public.tournaments%rowtype;
    v_new_status text;
    v_reason text;
    v_amount_paid numeric := 0;
begin
    v_uid := auth.uid();

    if v_uid is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_uid;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if coalesce(v_profile.is_active, false) = false then
        raise exception 'PROFILE_INACTIVE';
    end if;

    if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
       and coalesce(v_profile.can_manage_tournaments, false) = false then
        raise exception 'TOURNAMENT_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    if p_registration_id is null then
        raise exception 'REGISTRATION_ID_REQUIRED';
    end if;

    v_new_status :=
        upper(
            btrim(
                coalesce(
                    p_new_status,
                    ''
                )
            )
        );

    if v_new_status not in (
        'DANG_KY',
        'DA_XAC_NHAN',
        'HUY'
    ) then
        raise exception 'INVALID_REGISTRATION_STATUS';
    end if;

    v_reason :=
        btrim(
            coalesce(
                p_reason,
                ''
            )
        );

    if v_reason = '' then
        raise exception 'REASON_REQUIRED';
    end if;

    /*
     * Serialize status changes for this registration.
     * Future payment RPC should use the same registration row lock.
     */
    select *
    into v_registration
    from public.tournament_registrations
    where id = p_registration_id
    for update;

    if not found then
        raise exception 'REGISTRATION_NOT_FOUND';
    end if;

    v_old_registration :=
        v_registration;

    select *
    into v_tournament
    from public.tournaments
    where id = v_registration.tournament_id;

    if not found then
        raise exception 'TOURNAMENT_NOT_FOUND';
    end if;

    if upper(v_registration.status) = 'HUY' then
        raise exception 'REGISTRATION_ALREADY_CANCELLED';
    end if;

    if upper(v_registration.status) = v_new_status then
        raise exception 'REGISTRATION_STATUS_UNCHANGED';
    end if;

    /*
     * Allowed lifecycle:
     *
     * DANG_KY
     *   -> DA_XAC_NHAN
     *   -> HUY
     *
     * DA_XAC_NHAN
     *   -> HUY
     *
     * HUY
     *   -> terminal
     */
    if upper(v_registration.status) = 'DANG_KY' then
        if v_new_status not in (
            'DA_XAC_NHAN',
            'HUY'
        ) then
            raise exception 'INVALID_REGISTRATION_STATUS_TRANSITION';
        end if;

    elsif upper(v_registration.status) = 'DA_XAC_NHAN' then
        if v_new_status <> 'HUY' then
            raise exception 'INVALID_REGISTRATION_STATUS_TRANSITION';
        end if;

    else
        raise exception 'INVALID_CURRENT_REGISTRATION_STATUS';
    end if;

    /*
     * Registration management is closed once tournament
     * is already running or later.
     */
    if upper(v_tournament.status) not in (
        'DU_KIEN',
        'MO_DANG_KY'
    ) then
        raise exception 'TOURNAMENT_REGISTRATION_CLOSED';
    end if;

    /*
     * Never cancel a registration that already has cash recorded.
     * Refund workflow will be designed separately.
     */
    if v_new_status = 'HUY' then
        select coalesce(
            sum(tp.amount),
            0
        )
        into v_amount_paid
        from public.tournament_payments tp
        where tp.registration_id =
            v_registration.id;

        if v_amount_paid > 0 then
            raise exception 'REGISTRATION_HAS_PAYMENT';
        end if;
    end if;

    update public.tournament_registrations
    set status = v_new_status
    where id = v_registration.id
    returning *
    into v_registration;

    insert into public.audit_logs(
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_uid,
        'CHANGE_TOURNAMENT_REGISTRATION_STATUS',
        'tournament_registrations',
        v_registration.id,
        to_jsonb(v_old_registration),
        to_jsonb(v_registration),
        v_reason
    );

    return jsonb_build_object(
        'ok',
        true,
        'registration_id',
        v_registration.id,
        'tournament_id',
        v_registration.tournament_id,
        'old_status',
        v_old_registration.status,
        'new_status',
        v_registration.status,
        'amount_paid',
        v_amount_paid
    );
end;
$function$;


CREATE OR REPLACE FUNCTION public.change_tournament_status(p_tournament_id uuid, p_new_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
    v_profile public.profiles%rowtype;

    v_old public.tournaments%rowtype;
    v_new public.tournaments%rowtype;

    v_target_status text;
    v_reason text;

    v_pending_matches integer := 0;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_actor;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if v_profile.is_active is not true then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
       and coalesce(v_profile.can_manage_tournaments, false) = false then
        raise exception 'TOURNAMENT_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    if p_tournament_id is null then
        raise exception 'TOURNAMENT_ID_REQUIRED';
    end if;

    v_target_status :=
        upper(
            nullif(
                btrim(p_new_status),
                ''
            )
        );

    if v_target_status is null then
        raise exception 'TOURNAMENT_STATUS_REQUIRED';
    end if;

    if v_target_status not in (
        'DU_KIEN',
        'MO_DANG_KY',
        'DANG_DIEN_RA',
        'DA_KET_THUC',
        'DA_QUYET_TOAN',
        'HUY'
    ) then
        raise exception 'INVALID_TOURNAMENT_STATUS';
    end if;

    v_reason :=
        nullif(
            btrim(p_reason),
            ''
        );

    /*
      Lock tournament row:
      tránh hai ADMIN đổi lifecycle cùng lúc.
    */
    select *
    into v_old
    from public.tournaments
    where id = p_tournament_id
    for update;

    if not found then
        raise exception 'TOURNAMENT_NOT_FOUND';
    end if;

    if v_old.status = v_target_status then
        raise exception 'TOURNAMENT_STATUS_UNCHANGED';
    end if;

    /*
      Strict lifecycle state machine.
      Không nhảy cóc và không quay ngược trạng thái.
    */
    if v_old.status = 'DU_KIEN' then
        if v_target_status not in (
            'MO_DANG_KY',
            'HUY'
        ) then
            raise exception
                'INVALID_STATUS_TRANSITION: % -> %',
                v_old.status,
                v_target_status;
        end if;

    elsif v_old.status = 'MO_DANG_KY' then
        if v_target_status not in (
            'DANG_DIEN_RA',
            'HUY'
        ) then
            raise exception
                'INVALID_STATUS_TRANSITION: % -> %',
                v_old.status,
                v_target_status;
        end if;

    elsif v_old.status = 'DANG_DIEN_RA' then
        if v_target_status <> 'DA_KET_THUC' then
            raise exception
                'INVALID_STATUS_TRANSITION: % -> %',
                v_old.status,
                v_target_status;
        end if;

    elsif v_old.status = 'DA_KET_THUC' then
        if v_target_status <> 'DA_QUYET_TOAN' then
            raise exception
                'INVALID_STATUS_TRANSITION: % -> %',
                v_old.status,
                v_target_status;
        end if;

    elsif v_old.status in (
        'DA_QUYET_TOAN',
        'HUY'
    ) then
        raise exception
            'TOURNAMENT_STATUS_TERMINAL: %',
            v_old.status;

    else
        raise exception
            'UNKNOWN_CURRENT_TOURNAMENT_STATUS: %',
            v_old.status;
    end if;

    /*
      Không cho kết thúc/quyết toán khi vẫn còn
      trận PENDING thuộc giải.
    */
    if v_target_status in (
        'DA_KET_THUC',
        'DA_QUYET_TOAN'
    ) then
        select count(*)::integer
        into v_pending_matches
        from public.matches
        where tournament_id = p_tournament_id
          and status = 'PENDING';

        if v_pending_matches > 0 then
            raise exception
                'TOURNAMENT_HAS_PENDING_MATCHES: %',
                v_pending_matches;
        end if;
    end if;

    update public.tournaments
    set
        status = v_target_status,
        updated_at = now()
    where id = p_tournament_id
    returning *
    into v_new;

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_actor,
        'CHANGE_TOURNAMENT_STATUS',
        'tournaments',
        v_new.id,
        to_jsonb(v_old),
        to_jsonb(v_new),
        coalesce(
            v_reason,
            'Chuyển trạng thái giải: ' ||
            v_old.status ||
            ' -> ' ||
            v_new.status
        )
    );

    return jsonb_build_object(
        'success', true,
        'tournament_id', v_new.id,
        'name', v_new.name,
        'old_status', v_old.status,
        'new_status', v_new.status,
        'pending_matches', v_pending_matches,
        'updated_at', v_new.updated_at
    );
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_tournament(p_name text, p_code text DEFAULT NULL::text, p_start_date date DEFAULT CURRENT_DATE, p_end_date date DEFAULT NULL::date, p_location text DEFAULT NULL::text, p_event_category text DEFAULT NULL::text, p_format text DEFAULT NULL::text, p_registration_fee numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
    v_profile public.profiles%rowtype;
    v_tournament public.tournaments%rowtype;
    v_name text;
    v_code text;
    v_location text;
    v_event_category text;
    v_format text;
    v_notes text;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_actor;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if v_profile.is_active is not true then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
       and coalesce(v_profile.can_manage_tournaments, false) = false then
        raise exception 'TOURNAMENT_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    v_name :=
        nullif(
            btrim(p_name),
            ''
        );

    if v_name is null then
        raise exception 'TOURNAMENT_NAME_REQUIRED';
    end if;

    if p_start_date is null then
        raise exception 'START_DATE_REQUIRED';
    end if;

    if (
        p_end_date is not null
        and p_end_date < p_start_date
    ) then
        raise exception 'END_DATE_BEFORE_START_DATE';
    end if;

    if p_registration_fee is null then
        raise exception 'REGISTRATION_FEE_REQUIRED';
    end if;

    if p_registration_fee < 0 then
        raise exception 'REGISTRATION_FEE_MUST_BE_NONNEGATIVE';
    end if;

    v_code :=
        nullif(
            btrim(p_code),
            ''
        );

    v_location :=
        nullif(
            btrim(p_location),
            ''
        );

    v_event_category :=
        nullif(
            btrim(p_event_category),
            ''
        );

    v_format :=
        nullif(
            btrim(p_format),
            ''
        );

    v_notes :=
        nullif(
            btrim(p_notes),
            ''
        );

    insert into public.tournaments (
        name,
        code,
        start_date,
        end_date,
        location,
        event_category,
        format,
        registration_fee,
        status,
        notes,
        created_by
    )
    values (
        v_name,
        v_code,
        p_start_date,
        p_end_date,
        v_location,
        v_event_category,
        v_format,
        p_registration_fee,
        'DU_KIEN',
        v_notes,
        v_actor
    )
    returning *
    into v_tournament;

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_actor,
        'CREATE_TOURNAMENT',
        'tournaments',
        v_tournament.id,
        null,
        to_jsonb(v_tournament),
        'Tạo giải đấu'
    );

    return jsonb_build_object(
        'success', true,
        'tournament_id', v_tournament.id,
        'name', v_tournament.name,
        'code', v_tournament.code,
        'start_date', v_tournament.start_date,
        'end_date', v_tournament.end_date,
        'location', v_tournament.location,
        'event_category', v_tournament.event_category,
        'format', v_tournament.format,
        'registration_fee', v_tournament.registration_fee,
        'status', v_tournament.status,
        'notes', v_tournament.notes
    );
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_tournament_expense(p_tournament_id uuid, p_amount numeric, p_category text, p_description text, p_expense_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_profile public.profiles%rowtype;
  v_tournament public.tournaments%rowtype;
  v_expense public.tournament_expenses%rowtype;

  v_category text;
  v_description text;
begin
  -- ----------------------------------------------------------
  -- AUTH
  -- ----------------------------------------------------------
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_actor;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_profile.is_active, false) = false then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
     and coalesce(v_profile.can_manage_tournaments, false) = false then
    raise exception
      'TOURNAMENT_MANAGEMENT_PERMISSION_REQUIRED';
  end if;


  -- ----------------------------------------------------------
  -- INPUT
  -- ----------------------------------------------------------
  if p_tournament_id is null then
    raise exception 'TOURNAMENT_ID_REQUIRED';
  end if;

  if p_amount is null then
    raise exception 'EXPENSE_AMOUNT_REQUIRED';
  end if;

  if p_amount <= 0 then
    raise exception
      'EXPENSE_AMOUNT_MUST_BE_POSITIVE';
  end if;

  if p_expense_date is null then
    raise exception 'EXPENSE_DATE_REQUIRED';
  end if;

  v_category :=
    nullif(
      btrim(coalesce(p_category, '')),
      ''
    );

  if v_category is null then
    raise exception 'EXPENSE_CATEGORY_REQUIRED';
  end if;

  if char_length(v_category) > 100 then
    raise exception 'EXPENSE_CATEGORY_TOO_LONG';
  end if;

  v_description :=
    nullif(
      btrim(coalesce(p_description, '')),
      ''
    );

  if v_description is null then
    raise exception 'EXPENSE_DESCRIPTION_REQUIRED';
  end if;

  if char_length(v_description) > 1000 then
    raise exception 'EXPENSE_DESCRIPTION_TOO_LONG';
  end if;


  -- ----------------------------------------------------------
  -- TOURNAMENT
  -- ----------------------------------------------------------
  select *
  into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;

  if upper(v_tournament.status) = 'HUY' then
    raise exception 'TOURNAMENT_CANCELLED';
  end if;

  if upper(v_tournament.status) = 'DA_QUYET_TOAN' then
    raise exception 'TOURNAMENT_ALREADY_SETTLED';
  end if;


  -- ----------------------------------------------------------
  -- INSERT EXPENSE
  -- ----------------------------------------------------------
  insert into public.tournament_expenses (
    tournament_id,
    expense_date,
    category,
    description,
    amount,
    created_by
  )
  values (
    p_tournament_id,
    p_expense_date,
    v_category,
    v_description,
    p_amount,
    v_actor
  )
  returning *
  into v_expense;


  -- ----------------------------------------------------------
  -- AUDIT
  -- ----------------------------------------------------------
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
    v_actor,
    'CREATE_TOURNAMENT_EXPENSE',
    'tournament_expenses',
    v_expense.id,
    null,
    jsonb_build_object(
      'id', v_expense.id,
      'tournament_id', v_expense.tournament_id,
      'expense_date', v_expense.expense_date,
      'category', v_expense.category,
      'description', v_expense.description,
      'amount', v_expense.amount,
      'created_by', v_expense.created_by,
      'engine', 'TOURNAMENT_EXPENSE_V1'
    ),
    v_description,
    now()
  );


  -- ----------------------------------------------------------
  -- RESULT
  -- ----------------------------------------------------------
  return jsonb_build_object(
    'ok', true,
    'expense_id', v_expense.id,
    'tournament_id', v_expense.tournament_id,
    'expense_date', v_expense.expense_date,
    'category', v_expense.category,
    'description', v_expense.description,
    'amount', v_expense.amount,
    'created_by', v_expense.created_by
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_tournament_payment(p_registration_id uuid, p_amount numeric, p_paid_at timestamp with time zone DEFAULT now(), p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_uid uuid;

    v_profile public.profiles%rowtype;

    v_registration
        public.tournament_registrations%rowtype;

    v_tournament
        public.tournaments%rowtype;

    v_payment
        public.tournament_payments%rowtype;

    v_amount numeric;
    v_paid_before numeric := 0;
    v_paid_after numeric := 0;
    v_remaining_before numeric := 0;
    v_remaining_after numeric := 0;

    v_note text;
begin
    /* --------------------------------------------------------
       Authentication / authorization
       -------------------------------------------------------- */

    v_uid := auth.uid();

    if v_uid is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_uid;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if coalesce(
        v_profile.is_active,
        false
    ) = false then
        raise exception 'PROFILE_INACTIVE';
    end if;

    /*
     * V1J.2:
     * Thu phí dựa trên permission,
     * không phụ thuộc trực tiếp vào role ADMIN.
     */
    if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
       and coalesce(v_profile.can_collect_tournament_fee, false) = false then
        raise exception 'TREASURER_PERMISSION_REQUIRED';
    end if;


    /* --------------------------------------------------------
       Input validation
       -------------------------------------------------------- */

    if p_registration_id is null then
        raise exception 'REGISTRATION_ID_REQUIRED';
    end if;

    v_amount := p_amount;

    if v_amount is null then
        raise exception 'PAYMENT_AMOUNT_REQUIRED';
    end if;

    if v_amount <= 0 then
        raise exception 'PAYMENT_AMOUNT_MUST_BE_POSITIVE';
    end if;

    if p_paid_at is null then
        raise exception 'PAID_AT_REQUIRED';
    end if;

    v_note :=
        nullif(
            btrim(
                coalesce(
                    p_note,
                    ''
                )
            ),
            ''
        );


    /* --------------------------------------------------------
       Lock registration.
       Payment and registration-status writers lock this row.
       -------------------------------------------------------- */

    select *
    into v_registration
    from public.tournament_registrations
    where id = p_registration_id
    for update;

    if not found then
        raise exception 'REGISTRATION_NOT_FOUND';
    end if;


    /* --------------------------------------------------------
       Registration state
       -------------------------------------------------------- */

    if upper(v_registration.status) = 'HUY' then
        raise exception 'REGISTRATION_CANCELLED';
    end if;

    if upper(v_registration.status) not in (
        'DANG_KY',
        'DA_XAC_NHAN'
    ) then
        raise exception 'REGISTRATION_NOT_PAYABLE';
    end if;


    /* --------------------------------------------------------
       Tournament lifecycle
       -------------------------------------------------------- */

    select *
    into v_tournament
    from public.tournaments
    where id = v_registration.tournament_id;

    if not found then
        raise exception 'TOURNAMENT_NOT_FOUND';
    end if;

    if upper(v_tournament.status) = 'HUY' then
        raise exception 'TOURNAMENT_CANCELLED';
    end if;

    if upper(v_tournament.status) = 'DA_QUYET_TOAN' then
        raise exception 'TOURNAMENT_ALREADY_SETTLED';
    end if;


    /* --------------------------------------------------------
       Existing payments
       -------------------------------------------------------- */

    select coalesce(
        sum(tp.amount),
        0
    )
    into v_paid_before
    from public.tournament_payments tp
    where tp.registration_id = v_registration.id;

    v_remaining_before :=
        greatest(
            v_registration.fee_due -
            v_paid_before,
            0
        );


    /* --------------------------------------------------------
       Debt guards
       -------------------------------------------------------- */

    if v_registration.fee_due <= 0 then
        raise exception 'REGISTRATION_HAS_NO_FEE_DUE';
    end if;

    if v_remaining_before <= 0 then
        raise exception 'REGISTRATION_ALREADY_PAID_IN_FULL';
    end if;

    if v_amount > v_remaining_before then
        raise exception 'PAYMENT_EXCEEDS_REMAINING_BALANCE';
    end if;


    /* --------------------------------------------------------
       Append-only payment
       -------------------------------------------------------- */

    insert into public.tournament_payments(
        registration_id,
        player_id,
        amount,
        paid_at,
        confirmed_by,
        note
    )
    values (
        v_registration.id,
        v_registration.player_id,
        v_amount,
        p_paid_at,
        v_uid,
        v_note
    )
    returning *
    into v_payment;


    /* --------------------------------------------------------
       Final totals
       -------------------------------------------------------- */

    v_paid_after :=
        v_paid_before +
        v_payment.amount;

    v_remaining_after :=
        greatest(
            v_registration.fee_due -
            v_paid_after,
            0
        );


    /* --------------------------------------------------------
       Audit
       -------------------------------------------------------- */

    insert into public.audit_logs(
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_uid,
        'CREATE_TOURNAMENT_PAYMENT',
        'tournament_payments',
        v_payment.id,
        null,
        to_jsonb(v_payment),
        'Thu phí đăng ký giải'
    );


    /* --------------------------------------------------------
       Response
       -------------------------------------------------------- */

    return jsonb_build_object(
        'ok',
        true,

        'payment_id',
        v_payment.id,

        'registration_id',
        v_registration.id,

        'tournament_id',
        v_registration.tournament_id,

        'player_id',
        v_registration.player_id,

        'amount',
        v_payment.amount,

        'fee_due',
        v_registration.fee_due,

        'paid_before',
        v_paid_before,

        'paid_after',
        v_paid_after,

        'remaining_before',
        v_remaining_before,

        'remaining_after',
        v_remaining_after,

        'paid_in_full',
        (
            v_remaining_after = 0
        )
    );
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_tournament_registration(p_tournament_id uuid, p_player_id uuid, p_event_name text, p_partner_player_id uuid DEFAULT NULL::uuid, p_fee_due numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
    v_profile public.profiles%rowtype;
    v_tournament public.tournaments%rowtype;
    v_player public.players%rowtype;
    v_partner public.players%rowtype;
    v_registration public.tournament_registrations%rowtype;
    v_event_name text;
    v_fee_due numeric;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_actor;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if v_profile.is_active is not true then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
       and coalesce(v_profile.can_manage_tournaments, false) = false then
        raise exception 'TOURNAMENT_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    if p_tournament_id is null then
        raise exception 'TOURNAMENT_ID_REQUIRED';
    end if;

    if p_player_id is null then
        raise exception 'PLAYER_ID_REQUIRED';
    end if;

    v_event_name := nullif(btrim(p_event_name), '');

    if v_event_name is null then
        raise exception 'EVENT_NAME_REQUIRED';
    end if;

    if char_length(v_event_name) > 200 then
        raise exception 'EVENT_NAME_TOO_LONG';
    end if;

    select *
    into v_tournament
    from public.tournaments
    where id = p_tournament_id
    for share;

    if not found then
        raise exception 'TOURNAMENT_NOT_FOUND';
    end if;

    if v_tournament.status not in (
        'DU_KIEN',
        'MO_DANG_KY'
    ) then
        raise exception
            'TOURNAMENT_NOT_OPEN_FOR_REGISTRATION: %',
            v_tournament.status;
    end if;

    select *
    into v_player
    from public.players
    where id = p_player_id;

    if not found then
        raise exception 'PLAYER_NOT_FOUND';
    end if;

    if upper(coalesce(v_player.status, '')) <> 'ACTIVE' then
        raise exception 'PLAYER_INACTIVE';
    end if;

    if p_partner_player_id is not null then
        if p_partner_player_id = p_player_id then
            raise exception 'PARTNER_CANNOT_BE_SELF';
        end if;

        select *
        into v_partner
        from public.players
        where id = p_partner_player_id;

        if not found then
            raise exception 'PARTNER_NOT_FOUND';
        end if;

        if upper(coalesce(v_partner.status, '')) <> 'ACTIVE' then
            raise exception 'PARTNER_INACTIVE';
        end if;
    end if;

    v_fee_due :=
        coalesce(
            p_fee_due,
            v_tournament.registration_fee,
            0
        );

    if v_fee_due < 0 then
        raise exception 'FEE_DUE_MUST_BE_NONNEGATIVE';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(
            p_tournament_id::text || '|' ||
            lower(v_event_name),
            0
        )
    );

    if exists (
        select 1
        from public.tournament_registrations tr
        where tr.tournament_id = p_tournament_id
          and lower(btrim(tr.event_name)) =
              lower(v_event_name)
          and tr.status <> 'HUY'
          and (
              tr.player_id = p_player_id
              or tr.partner_player_id = p_player_id
          )
    ) then
        raise exception
            'PLAYER_ALREADY_REGISTERED_FOR_EVENT';
    end if;

    if p_partner_player_id is not null
       and exists (
            select 1
            from public.tournament_registrations tr
            where tr.tournament_id = p_tournament_id
              and lower(btrim(tr.event_name)) =
                  lower(v_event_name)
              and tr.status <> 'HUY'
              and (
                  tr.player_id = p_partner_player_id
                  or tr.partner_player_id =
                      p_partner_player_id
              )
       )
    then
        raise exception
            'PARTNER_ALREADY_REGISTERED_FOR_EVENT';
    end if;

    insert into public.tournament_registrations (
        tournament_id,
        player_id,
        event_name,
        partner_player_id,
        fee_due,
        status
    )
    values (
        p_tournament_id,
        p_player_id,
        v_event_name,
        p_partner_player_id,
        v_fee_due,
        'DANG_KY'
    )
    returning *
    into v_registration;

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_actor,
        'CREATE_TOURNAMENT_REGISTRATION',
        'tournament_registrations',
        v_registration.id,
        null,
        to_jsonb(v_registration),
        'Đăng ký VĐV tham gia giải'
    );

    return jsonb_build_object(
        'success', true,
        'registration_id', v_registration.id,
        'tournament_id', v_registration.tournament_id,
        'player_id', v_registration.player_id,
        'event_name', v_registration.event_name,
        'partner_player_id',
            v_registration.partner_player_id,
        'fee_due', v_registration.fee_due,
        'status', v_registration.status,
        'created_at', v_registration.created_at
    );
end;
$function$;


CREATE OR REPLACE FUNCTION public.get_tournament_finance_summary(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_profile public.profiles%rowtype;
  v_tournament public.tournaments%rowtype;

  v_registration_count integer := 0;
  v_paid_in_full_count integer := 0;
  v_outstanding_count integer := 0;

  v_fee_due_total numeric := 0;
  v_paid_total numeric := 0;
  v_remaining_total numeric := 0;

  v_expense_total numeric := 0;
  v_net_cash numeric := 0;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_actor;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_profile.is_active, false) = false then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if not (
    upper(coalesce(v_profile.role, '')) = 'ADMIN'
    or
    coalesce(v_profile.can_manage_tournaments, false)
    or
    coalesce(v_profile.can_collect_tournament_fee, false)
  ) then
    raise exception 'TOURNAMENT_FINANCE_PERMISSION_REQUIRED';
  end if;

  if p_tournament_id is null then
    raise exception 'TOURNAMENT_ID_REQUIRED';
  end if;

  select *
  into v_tournament
  from public.tournaments
  where id = p_tournament_id;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;

  with registration_finance as (
    select
      tr.id,
      tr.fee_due,

      coalesce(
        (
          select
            sum(
              tp.amount
              -
              coalesce(
                (
                  select sum(r.amount)
                  from public.tournament_payment_refunds r
                  where r.payment_id = tp.id
                ),
                0
              )
            )
          from public.tournament_payments tp
          where tp.registration_id = tr.id
        ),
        0
      ) as paid_amount

    from public.tournament_registrations tr
    where tr.tournament_id = p_tournament_id
      and tr.status in (
        'DANG_KY',
        'DA_XAC_NHAN'
      )
  )
  select
    count(*)::integer,

    count(*) filter (
      where fee_due > 0
        and paid_amount >= fee_due
    )::integer,

    count(*) filter (
      where fee_due > paid_amount
    )::integer,

    coalesce(sum(fee_due), 0),

    coalesce(sum(paid_amount), 0),

    coalesce(
      sum(
        greatest(
          fee_due - paid_amount,
          0
        )
      ),
      0
    )
  into
    v_registration_count,
    v_paid_in_full_count,
    v_outstanding_count,
    v_fee_due_total,
    v_paid_total,
    v_remaining_total
  from registration_finance;

  select
    coalesce(sum(te.amount), 0)
  into v_expense_total
  from public.tournament_expenses te
  where te.tournament_id = p_tournament_id
    and not exists (
      select 1
      from public.tournament_expense_reversals ter
      where ter.expense_id = te.id
    );

  v_net_cash :=
    v_paid_total - v_expense_total;

  return jsonb_build_object(
    'ok', true,
    'tournament_id', v_tournament.id,
    'tournament_code', v_tournament.code,
    'tournament_name', v_tournament.name,
    'tournament_status', v_tournament.status,
    'registration_count', v_registration_count,
    'paid_in_full_count', v_paid_in_full_count,
    'outstanding_count', v_outstanding_count,
    'fee_due_total', v_fee_due_total,
    'paid_total', v_paid_total,
    'remaining_total', v_remaining_total,
    'expense_total', v_expense_total,
    'net_cash', v_net_cash
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.refund_tournament_payment(p_payment_id uuid, p_amount numeric, p_reason text, p_refunded_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_profile public.profiles%rowtype;

  v_payment public.tournament_payments%rowtype;
  v_registration public.tournament_registrations%rowtype;
  v_tournament public.tournaments%rowtype;

  v_refund_id uuid;
  v_refund_amount numeric;
  v_refund_time timestamptz;

  v_reason text;

  v_refunded_before numeric := 0;
  v_refunded_after numeric := 0;
  v_refundable_before numeric := 0;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_actor;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_profile.is_active, false) = false then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
     and coalesce(v_profile.can_collect_tournament_fee, false) = false then
    raise exception 'TREASURER_PERMISSION_REQUIRED';
  end if;

  if p_payment_id is null then
    raise exception 'PAYMENT_ID_REQUIRED';
  end if;

  if p_amount is null then
    raise exception 'REFUND_AMOUNT_REQUIRED';
  end if;

  if p_amount <= 0 then
    raise exception 'REFUND_AMOUNT_MUST_BE_POSITIVE';
  end if;

  if p_refunded_at is null then
    raise exception 'REFUNDED_AT_REQUIRED';
  end if;

  v_reason :=
    nullif(
      btrim(coalesce(p_reason, '')),
      ''
    );

  if v_reason is null then
    raise exception 'REFUND_REASON_REQUIRED';
  end if;

  if char_length(v_reason) > 1000 then
    raise exception 'REFUND_REASON_TOO_LONG';
  end if;

  perform pg_advisory_xact_lock(726184504);

  select *
  into v_payment
  from public.tournament_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_PAYMENT_NOT_FOUND';
  end if;

  select *
  into v_registration
  from public.tournament_registrations
  where id = v_payment.registration_id;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  select *
  into v_tournament
  from public.tournaments
  where id = v_registration.tournament_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;

  if v_tournament.status = 'DA_QUYET_TOAN' then
    raise exception 'TOURNAMENT_ALREADY_SETTLED';
  end if;

  select coalesce(sum(r.amount), 0)
  into v_refunded_before
  from public.tournament_payment_refunds r
  where r.payment_id = p_payment_id;

  v_refundable_before :=
    v_payment.amount - v_refunded_before;

  if v_refundable_before <= 0 then
    raise exception 'PAYMENT_ALREADY_FULLY_REFUNDED';
  end if;

  if p_amount > v_refundable_before then
    raise exception 'REFUND_EXCEEDS_REFUNDABLE_AMOUNT';
  end if;

  insert into public.tournament_payment_refunds (
    payment_id,
    amount,
    refunded_at,
    reason,
    created_by
  )
  values (
    p_payment_id,
    p_amount,
    p_refunded_at,
    v_reason,
    v_actor
  )
  returning
    id,
    amount,
    refunded_at
  into
    v_refund_id,
    v_refund_amount,
    v_refund_time;

  v_refunded_after :=
    v_refunded_before + v_refund_amount;

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
    v_actor,
    'REFUND_TOURNAMENT_PAYMENT',
    'tournament_payment_refunds',
    v_refund_id,
    null,
    jsonb_build_object(
      'refund_id', v_refund_id,
      'payment_id', v_payment.id,
      'registration_id', v_payment.registration_id,
      'tournament_id', v_registration.tournament_id,
      'player_id', v_payment.player_id,
      'payment_amount', v_payment.amount,
      'refund_amount', v_refund_amount,
      'refunded_at', v_refund_time,
      'refunded_before', v_refunded_before,
      'refunded_after', v_refunded_after,
      'refundable_after',
        v_payment.amount - v_refunded_after,
      'engine',
        'TOURNAMENT_PAYMENT_REFUND_V1'
    ),
    v_reason,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'refund_id', v_refund_id,
    'payment_id', v_payment.id,
    'registration_id', v_payment.registration_id,
    'tournament_id', v_registration.tournament_id,
    'payment_amount', v_payment.amount,
    'refund_amount', v_refund_amount,
    'refunded_before', v_refunded_before,
    'refunded_after', v_refunded_after,
    'refundable_after',
      v_payment.amount - v_refunded_after,
    'fully_refunded',
      (
        v_payment.amount - v_refunded_after = 0
      )
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.reverse_tournament_expense(p_expense_id uuid, p_reason text, p_reversed_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_profile public.profiles%rowtype;

  v_expense public.tournament_expenses%rowtype;
  v_tournament public.tournaments%rowtype;

  v_reversal_id uuid;
  v_reason text;
begin
  -- AUTH
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_actor;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_profile.is_active, false) = false then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
     and coalesce(v_profile.can_manage_tournaments, false) = false then
    raise exception
      'TOURNAMENT_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  -- INPUT
  if p_expense_id is null then
    raise exception 'EXPENSE_ID_REQUIRED';
  end if;

  if p_reversed_at is null then
    raise exception 'REVERSED_AT_REQUIRED';
  end if;

  v_reason :=
    nullif(
      btrim(coalesce(p_reason, '')),
      ''
    );

  if v_reason is null then
    raise exception 'REVERSAL_REASON_REQUIRED';
  end if;

  if char_length(v_reason) > 1000 then
    raise exception 'REVERSAL_REASON_TOO_LONG';
  end if;

  perform pg_advisory_xact_lock(726184505);

  -- EXPENSE
  select *
  into v_expense
  from public.tournament_expenses
  where id = p_expense_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_EXPENSE_NOT_FOUND';
  end if;

  -- TOURNAMENT
  select *
  into v_tournament
  from public.tournaments
  where id = v_expense.tournament_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;

  if v_tournament.status = 'DA_QUYET_TOAN' then
    raise exception 'TOURNAMENT_ALREADY_SETTLED';
  end if;

  -- DUPLICATE REVERSAL GUARD
  if exists (
    select 1
    from public.tournament_expense_reversals r
    where r.expense_id = p_expense_id
  ) then
    raise exception 'EXPENSE_ALREADY_REVERSED';
  end if;

  -- APPEND REVERSAL
  insert into public.tournament_expense_reversals (
    expense_id,
    reversed_at,
    reason,
    created_by
  )
  values (
    p_expense_id,
    p_reversed_at,
    v_reason,
    v_actor
  )
  returning id
  into v_reversal_id;

  -- AUDIT
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
    v_actor,
    'REVERSE_TOURNAMENT_EXPENSE',
    'tournament_expense_reversals',
    v_reversal_id,

    null,

    jsonb_build_object(
      'reversal_id', v_reversal_id,
      'expense_id', v_expense.id,
      'tournament_id', v_expense.tournament_id,
      'expense_amount', v_expense.amount,
      'expense_category', v_expense.category,
      'expense_description', v_expense.description,
      'reversed_at', p_reversed_at,
      'engine', 'TOURNAMENT_EXPENSE_REVERSAL_V1'
    ),

    v_reason,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'reversal_id', v_reversal_id,
    'expense_id', v_expense.id,
    'tournament_id', v_expense.tournament_id,
    'expense_amount', v_expense.amount,
    'reversed_at', p_reversed_at,
    'reason', v_reason
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.settle_tournament(p_tournament_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_profile public.profiles%rowtype;
  v_tournament public.tournaments%rowtype;

  v_summary jsonb;
  v_remaining numeric := 0;
  v_note text;
begin
  -- AUTH
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_actor;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_profile.is_active, false) = false then
    raise exception 'PROFILE_INACTIVE';
  end if;

  if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
     and coalesce(v_profile.can_manage_tournaments, false) = false then
    raise exception
      'TOURNAMENT_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  -- INPUT
  if p_tournament_id is null then
    raise exception 'TOURNAMENT_ID_REQUIRED';
  end if;

  v_note :=
    nullif(
      btrim(coalesce(p_note, '')),
      ''
    );

  if v_note is not null
     and char_length(v_note) > 1000 then
    raise exception 'SETTLEMENT_NOTE_TOO_LONG';
  end if;

  -- SERIALIZE TOURNAMENT FINANCE/STATUS FLOW
  perform pg_advisory_xact_lock(726184503);

  select *
  into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;

  if upper(v_tournament.status) = 'HUY' then
    raise exception 'TOURNAMENT_CANCELLED';
  end if;

  if upper(v_tournament.status) = 'DA_QUYET_TOAN' then
    raise exception 'TOURNAMENT_ALREADY_SETTLED';
  end if;

  if upper(v_tournament.status) <> 'DA_KET_THUC' then
    raise exception
      'TOURNAMENT_MUST_BE_COMPLETED_BEFORE_SETTLEMENT';
  end if;

  -- FINANCE SNAPSHOT
  v_summary :=
    public.get_tournament_finance_summary(
      p_tournament_id
    );

  v_remaining :=
    coalesce(
      (v_summary ->> 'remaining_total')::numeric,
      0
    );

  if v_remaining > 0 then
    raise exception
      'TOURNAMENT_HAS_OUTSTANDING_BALANCE';
  end if;

  -- STATUS TRANSITION
  update public.tournaments
  set
    status = 'DA_QUYET_TOAN',
    updated_at = now()
  where id = p_tournament_id;

  -- AUDIT
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
    v_actor,
    'SETTLE_TOURNAMENT',
    'tournaments',
    p_tournament_id,

    jsonb_build_object(
      'status',
      v_tournament.status
    ),

    jsonb_build_object(
      'status',
      'DA_QUYET_TOAN',

      'registration_count',
      v_summary -> 'registration_count',

      'paid_in_full_count',
      v_summary -> 'paid_in_full_count',

      'outstanding_count',
      v_summary -> 'outstanding_count',

      'fee_due_total',
      v_summary -> 'fee_due_total',

      'paid_total',
      v_summary -> 'paid_total',

      'remaining_total',
      v_summary -> 'remaining_total',

      'expense_total',
      v_summary -> 'expense_total',

      'net_cash',
      v_summary -> 'net_cash',

      'note',
      v_note,

      'engine',
      'TOURNAMENT_SETTLEMENT_V1'
    ),

    coalesce(
      v_note,
      'Quyết toán giải đấu'
    ),

    now()
  );

  return jsonb_build_object(
    'ok',
    true,

    'tournament_id',
    p_tournament_id,

    'status_before',
    v_tournament.status,

    'status_after',
    'DA_QUYET_TOAN',

    'finance',
    v_summary,

    'note',
    v_note
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.update_tournament(p_tournament_id uuid, p_name text, p_code text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_location text DEFAULT NULL::text, p_event_category text DEFAULT NULL::text, p_format text DEFAULT NULL::text, p_registration_fee numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
    v_profile public.profiles%rowtype;

    v_old public.tournaments%rowtype;
    v_new public.tournaments%rowtype;

    v_name text;
    v_code text;
    v_location text;
    v_event_category text;
    v_format text;
    v_notes text;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_actor;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if v_profile.is_active is not true then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_profile.role, '')) <> 'ADMIN'
       and coalesce(v_profile.can_manage_tournaments, false) = false then
        raise exception 'TOURNAMENT_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    if p_tournament_id is null then
        raise exception 'TOURNAMENT_ID_REQUIRED';
    end if;

    /*
      Lock row để tránh hai ADMIN sửa cùng giải
      tại cùng thời điểm rồi ghi đè không kiểm soát.
    */
    select *
    into v_old
    from public.tournaments
    where id = p_tournament_id
    for update;

    if not found then
        raise exception 'TOURNAMENT_NOT_FOUND';
    end if;

    v_name :=
        nullif(
            btrim(p_name),
            ''
        );

    if v_name is null then
        raise exception 'TOURNAMENT_NAME_REQUIRED';
    end if;

    if p_start_date is null then
        raise exception 'START_DATE_REQUIRED';
    end if;

    if (
        p_end_date is not null
        and p_end_date < p_start_date
    ) then
        raise exception 'END_DATE_BEFORE_START_DATE';
    end if;

    if p_registration_fee is null then
        raise exception 'REGISTRATION_FEE_REQUIRED';
    end if;

    if p_registration_fee < 0 then
        raise exception 'REGISTRATION_FEE_MUST_BE_NONNEGATIVE';
    end if;

    v_code :=
        nullif(
            btrim(p_code),
            ''
        );

    v_location :=
        nullif(
            btrim(p_location),
            ''
        );

    v_event_category :=
        nullif(
            btrim(p_event_category),
            ''
        );

    v_format :=
        nullif(
            btrim(p_format),
            ''
        );

    v_notes :=
        nullif(
            btrim(p_notes),
            ''
        );

    update public.tournaments
    set
        name = v_name,
        code = v_code,
        start_date = p_start_date,
        end_date = p_end_date,
        location = v_location,
        event_category = v_event_category,
        format = v_format,
        registration_fee = p_registration_fee,
        notes = v_notes,
        updated_at = now()
    where id = p_tournament_id
    returning *
    into v_new;

    /*
      status và created_by cố ý không nằm trong UPDATE.
      Lifecycle sẽ do RPC riêng ở V1C quản lý.
    */

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_actor,
        'UPDATE_TOURNAMENT',
        'tournaments',
        v_new.id,
        to_jsonb(v_old),
        to_jsonb(v_new),
        'Cập nhật thông tin giải đấu'
    );

    return jsonb_build_object(
        'success', true,
        'tournament_id', v_new.id,
        'name', v_new.name,
        'code', v_new.code,
        'start_date', v_new.start_date,
        'end_date', v_new.end_date,
        'location', v_new.location,
        'event_category', v_new.event_category,
        'format', v_new.format,
        'registration_fee', v_new.registration_fee,
        'status', v_new.status,
        'notes', v_new.notes,
        'updated_at', v_new.updated_at
    );
end;
$function$;




CREATE OR REPLACE FUNCTION public.get_tournament_management_registrations()
RETURNS SETOF public.tournament_registrations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid uuid;
    v_profile public.profiles%rowtype;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT *
    INTO v_profile
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF coalesce(v_profile.is_active, false) = false THEN
        RAISE EXCEPTION 'PROFILE_INACTIVE';
    END IF;

    IF NOT (
        upper(coalesce(v_profile.role, '')) = 'ADMIN'
        OR coalesce(v_profile.can_manage_tournaments, false)
        OR coalesce(v_profile.can_collect_tournament_fee, false)
    ) THEN
        RAISE EXCEPTION 'TOURNAMENT_READ_PERMISSION_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT tr.*
    FROM public.tournament_registrations tr
    ORDER BY tr.created_at ASC, tr.id ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_tournament_management_registrations()
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_tournament_management_registrations()
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_tournament_management_registrations()
TO authenticated;


CREATE OR REPLACE FUNCTION public.get_tournament_management_payments()
RETURNS SETOF public.tournament_payments
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid uuid;
    v_profile public.profiles%rowtype;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT *
    INTO v_profile
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF coalesce(v_profile.is_active, false) = false THEN
        RAISE EXCEPTION 'PROFILE_INACTIVE';
    END IF;

    IF NOT (
        upper(coalesce(v_profile.role, '')) = 'ADMIN'
        OR coalesce(v_profile.can_manage_tournaments, false)
        OR coalesce(v_profile.can_collect_tournament_fee, false)
    ) THEN
        RAISE EXCEPTION 'TOURNAMENT_READ_PERMISSION_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT tp.*
    FROM public.tournament_payments tp
    ORDER BY tp.paid_at ASC, tp.id ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_tournament_management_payments()
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_tournament_management_payments()
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_tournament_management_payments()
TO authenticated;
