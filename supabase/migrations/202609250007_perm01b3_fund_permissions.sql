-- PERM01B-3 Fund Permissions
-- Generated from current production function definitions.

CREATE OR REPLACE FUNCTION public.admin_create_fund_rule_version(p_match_type text, p_amount_loss numeric, p_amount_draw numeric, p_amount_win numeric, p_effective_from date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid;

    v_current public.fund_rules%rowtype;
    v_new_id uuid;
begin
    -- =====================================================
    -- AUTH
    -- =====================================================

    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_user_id
          and (
              upper(coalesce(p.role, '')) = 'ADMIN'
              or coalesce(p.can_manage_fund, false)
          )
          and p.is_active = true
    ) then
        raise exception 'FUND_MANAGEMENT_PERMISSION_REQUIRED';
    end if;


    -- =====================================================
    -- INPUT
    -- =====================================================

    if p_match_type is null
       or btrim(p_match_type) = '' then
        raise exception 'match_type không được để trống';
    end if;

    if p_amount_loss is null
       or p_amount_draw is null
       or p_amount_win is null then
        raise exception 'Các mức tiền quỹ không được NULL';
    end if;

    if p_amount_loss < 0
       or p_amount_draw < 0
       or p_amount_win < 0 then
        raise exception 'Mức tiền quỹ không được âm';
    end if;

    if p_effective_from is null then
        raise exception 'effective_from không được để trống';
    end if;

    -- Chỉ dùng match_type hợp lệ đã được hệ thống định nghĩa
    if not exists (
        select 1
        from public.rating_match_weights rw
        where rw.match_type = btrim(p_match_type)
    ) then
        raise exception
            'match_type không hợp lệ: %',
            btrim(p_match_type);
    end if;


    -- =====================================================
    -- SERIALIZE CONFIG WRITES
    -- =====================================================

    perform pg_advisory_xact_lock(726184502);


    -- =====================================================
    -- LOAD CURRENT OPEN RULE
    -- =====================================================

    select fr.*
    into v_current
    from public.fund_rules fr
    where fr.match_type = btrim(p_match_type)
      and fr.is_active = true
      and fr.effective_to is null
    order by fr.effective_from desc
    limit 1
    for update;


    if found then

        -- Không cho backdate làm phá lịch sử/version hiện có
        if p_effective_from < v_current.effective_from then
            raise exception
                'Ngày hiệu lực mới (%) phải >= ngày hiệu lực hiện tại (%)',
                p_effective_from,
                v_current.effective_from;
        end if;

        -- Cùng ngày + cùng cấu hình => NO-OP
        if p_effective_from = v_current.effective_from
           and v_current.amount_loss is not distinct from p_amount_loss
           and v_current.amount_draw is not distinct from p_amount_draw
           and v_current.amount_win is not distinct from p_amount_win then

            return jsonb_build_object(
                'success', true,
                'changed', false,
                'rule_id', v_current.id,
                'match_type', v_current.match_type,
                'effective_from', v_current.effective_from,
                'amount_loss', v_current.amount_loss,
                'amount_draw', v_current.amount_draw,
                'amount_win', v_current.amount_win
            );
        end if;

        -- Cùng ngày nhưng giá trị khác => không rewrite version cũ
        if p_effective_from = v_current.effective_from then
            raise exception
                'Đã có Fund Rule bắt đầu đúng ngày %. Hãy chọn ngày hiệu lực mới sau ngày này.',
                p_effective_from;
        end if;

        -- Đóng rule cũ tại ngày trước version mới
        update public.fund_rules
        set effective_to = p_effective_from - 1
        where id = v_current.id;

    end if;


    -- =====================================================
    -- INSERT NEW VERSION
    -- =====================================================

    insert into public.fund_rules (
        match_type,
        amount_loss,
        amount_draw,
        amount_win,
        effective_from,
        effective_to,
        is_active
    )
    values (
        btrim(p_match_type),
        p_amount_loss,
        p_amount_draw,
        p_amount_win,
        p_effective_from,
        null,
        true
    )
    returning id
    into v_new_id;


    -- =====================================================
    -- AUDIT
    -- =====================================================

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
        'CREATE_FUND_RULE_VERSION',
        'fund_rules',
        v_new_id,

        case
            when v_current.id is null then null
            else jsonb_build_object(
                'id', v_current.id,
                'match_type', v_current.match_type,
                'amount_loss', v_current.amount_loss,
                'amount_draw', v_current.amount_draw,
                'amount_win', v_current.amount_win,
                'effective_from', v_current.effective_from,
                'effective_to', v_current.effective_to
            )
        end,

        jsonb_build_object(
            'id', v_new_id,
            'match_type', btrim(p_match_type),
            'amount_loss', p_amount_loss,
            'amount_draw', p_amount_draw,
            'amount_win', p_amount_win,
            'effective_from', p_effective_from,
            'effective_to', null
        ),

        'ADMIN tạo phiên bản mới của Fund Rule',
        now()
    );


    return jsonb_build_object(
        'success', true,
        'changed', true,
        'rule_id', v_new_id,
        'match_type', btrim(p_match_type),
        'effective_from', p_effective_from,
        'amount_loss', p_amount_loss,
        'amount_draw', p_amount_draw,
        'amount_win', p_amount_win
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_fund_obligation_campaign(p_campaign_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid;
    v_campaign public.fund_obligation_campaigns%rowtype;

    v_reason text;

    v_obligation_count integer := 0;
    v_payment_count integer := 0;

    v_gross_paid numeric := 0;
    v_refunded numeric := 0;
    v_net_paid numeric := 0;
BEGIN

    v_actor := auth.uid();

    IF v_actor IS NULL THEN
        RAISE EXCEPTION
            'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_actor
          AND p.is_active = true
          AND (
            upper(coalesce(p.role, '')) = 'ADMIN'
            OR coalesce(p.can_manage_fund, false)
          )
    ) THEN
        RAISE EXCEPTION
            'FUND_MANAGEMENT_PERMISSION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;


    IF p_campaign_id IS NULL THEN
        RAISE EXCEPTION
            'CAMPAIGN_ID_REQUIRED';
    END IF;


    v_reason :=
        nullif(
            btrim(
                coalesce(
                    p_reason,
                    ''
                )
            ),
            ''
        );

    IF v_reason IS NULL THEN
        RAISE EXCEPTION
            'CANCEL_REASON_REQUIRED';
    END IF;


    IF char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION
            'CANCEL_REASON_TOO_LONG';
    END IF;


    SELECT *
    INTO v_campaign
    FROM public.fund_obligation_campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'CAMPAIGN_NOT_FOUND';
    END IF;


    IF v_campaign.status = 'CANCELLED' THEN
        RAISE EXCEPTION
            'CAMPAIGN_ALREADY_CANCELLED';
    END IF;


    SELECT count(*)
    INTO v_obligation_count
    FROM public.fund_contributions c
    WHERE c.campaign_id = p_campaign_id;


    SELECT count(*)
    INTO v_payment_count
    FROM public.fund_payments fp
    JOIN public.fund_contributions c
      ON c.id = fp.contribution_id
    WHERE c.campaign_id = p_campaign_id;


    SELECT
        coalesce(
            sum(fp.amount),
            0
        )
    INTO v_gross_paid
    FROM public.fund_payments fp
    JOIN public.fund_contributions c
      ON c.id = fp.contribution_id
    WHERE c.campaign_id = p_campaign_id;


    SELECT
        coalesce(
            sum(refund_tx.amount),
            0
        )
    INTO v_refunded

    FROM public.fund_transactions refund_tx

    JOIN public.fund_transactions original_tx
      ON original_tx.id =
         refund_tx.reversal_of_transaction_id

    JOIN public.fund_payments fp
      ON fp.id =
         original_tx.payment_id

    JOIN public.fund_contributions c
      ON c.id =
         fp.contribution_id

    WHERE refund_tx.transaction_type =
            'HOAN_TIEN'
      AND c.campaign_id =
            p_campaign_id;


    v_net_paid :=
        greatest(
            v_gross_paid -
            v_refunded,
            0
        );


    IF v_net_paid > 0 THEN
        RAISE EXCEPTION
            'CAMPAIGN_HAS_UNREFUNDED_PAYMENTS';
    END IF;


    UPDATE public.fund_obligation_campaigns
    SET
        status = 'CANCELLED',
        updated_at = now()
    WHERE id = p_campaign_id;


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
        v_actor,

        'CANCEL_FUND_OBLIGATION_CAMPAIGN',

        'fund_obligation_campaigns',

        p_campaign_id,

        jsonb_build_object(
            'status',
                v_campaign.status,
            'title',
                v_campaign.title,
            'category',
                v_campaign.category,
            'period_month',
                v_campaign.period_month,
            'amount_due',
                v_campaign.amount_due,
            'due_date',
                v_campaign.due_date
        ),

        jsonb_build_object(
            'status',
                'CANCELLED',
            'obligation_count',
                v_obligation_count,
            'payment_count',
                v_payment_count,
            'gross_paid',
                v_gross_paid,
            'refunded',
                v_refunded,
            'net_paid',
                v_net_paid,
            'engine',
                'FUND_OBLIGATION_CAMPAIGN_CANCEL_V1'
        ),

        v_reason,

        now()
    );


    RETURN jsonb_build_object(
        'ok',
            true,
        'campaign_id',
            p_campaign_id,
        'status_before',
            v_campaign.status,
        'status_after',
            'CANCELLED',
        'obligation_count',
            v_obligation_count,
        'payment_count',
            v_payment_count,
        'gross_paid',
            v_gross_paid,
        'refunded',
            v_refunded,
        'net_paid',
            v_net_paid,
        'engine',
            'FUND_OBLIGATION_CAMPAIGN_CANCEL_V1'
    );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_fund_obligation_campaign(p_category text, p_title text, p_amount_due numeric, p_period_month date DEFAULT NULL::date, p_due_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_category text;
  v_title text;
  v_period_month date;
  v_campaign_id uuid;
  v_reason text;
  v_count integer;
BEGIN

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'AUTH_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.is_active = true
      AND (
        upper(coalesce(p.role, '')) = 'ADMIN'
        OR coalesce(p.can_manage_fund, false)
      )
  ) THEN
    RAISE EXCEPTION
      'FUND_MANAGEMENT_PERMISSION_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  v_category :=
    upper(
      btrim(
        coalesce(
          p_category,
          ''
        )
      )
    );

  IF v_category NOT IN (
    'MONTHLY_CLUB_FUND',
    'ACTIVITY_FEE',
    'EVENT_FEE',
    'OTHER'
  ) THEN
    RAISE EXCEPTION
      'INVALID_CATEGORY';
  END IF;

  v_title :=
    btrim(
      coalesce(
        p_title,
        ''
      )
    );

  IF v_title = '' THEN
    RAISE EXCEPTION
      'TITLE_REQUIRED';
  END IF;

  IF p_amount_due IS NULL
     OR p_amount_due <= 0 THEN
    RAISE EXCEPTION
      'AMOUNT_MUST_BE_POSITIVE';
  END IF;

  IF p_period_month IS NOT NULL THEN
    v_period_month :=
      date_trunc(
        'month',
        p_period_month
      )::date;
  ELSE
    v_period_month := NULL;
  END IF;

  IF v_category = 'MONTHLY_CLUB_FUND'
     AND v_period_month IS NULL THEN
    RAISE EXCEPTION
      'PERIOD_MONTH_REQUIRED';
  END IF;

  IF p_due_date IS NOT NULL
     AND v_period_month IS NOT NULL
     AND p_due_date < v_period_month THEN
    RAISE EXCEPTION
      'INVALID_DUE_DATE';
  END IF;

  v_reason :=
    CASE v_category
      WHEN 'MONTHLY_CLUB_FUND'
        THEN 'QUY_THANG'
      WHEN 'ACTIVITY_FEE'
        THEN 'PHI_SINH_HOAT'
      WHEN 'EVENT_FEE'
        THEN 'PHI_SU_KIEN'
      ELSE 'KHAC'
    END;

  INSERT INTO
    public.fund_obligation_campaigns (
      category,
      title,
      period_month,
      amount_due,
      due_date,
      note,
      status,
      created_by
    )
  VALUES (
    v_category,
    v_title,
    v_period_month,
    p_amount_due,
    p_due_date,
    nullif(
      btrim(
        coalesce(
          p_note,
          ''
        )
      ),
      ''
    ),
    'ACTIVE',
    v_user_id
  )
  RETURNING id
  INTO v_campaign_id;

  INSERT INTO
    public.fund_contributions (
      match_id,
      campaign_id,
      player_id,
      reason,
      amount_due,
      due_date,
      status
    )
  SELECT
    NULL,
    v_campaign_id,
    target.player_id,
    v_reason,
    p_amount_due,
    p_due_date,
    'CHUA_DONG'
  FROM (
    SELECT DISTINCT
      profile.player_id
    FROM public.profiles profile
    JOIN public.players player
      ON player.id =
        profile.player_id
    WHERE profile.is_active = true
      AND profile.role IN (
        'MEMBER',
        'ADMIN'
      )
      AND profile.player_id IS NOT NULL
      AND player.status = 'ACTIVE'
      AND player.player_type = 'CLUB'
  ) target
  ON CONFLICT (
    campaign_id,
    player_id
  )
  WHERE campaign_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS
    v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'campaign_id',
    v_campaign_id,
    'category',
    v_category,
    'title',
    v_title,
    'amount_due',
    p_amount_due,
    'period_month',
    v_period_month,
    'due_date',
    p_due_date,
    'obligation_count',
    v_count
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_match_fund(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid;
    v_role text;
    v_is_active boolean;
    v_can_manage_fund boolean;
begin

    -- 1. LẤY USER TỪ JWT
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ';
    end if;


    -- 2. KIỂM TRA PROFILE
    select
        role,
        is_active,
        can_manage_fund
    into
        v_role,
        v_is_active,
        v_can_manage_fund
    from public.profiles
    where id = v_user_id;

    if not found then
        raise exception
            'Không tìm thấy hồ sơ người dùng';
    end if;


    -- 3. KIỂM TRA ACTIVE
    if coalesce(v_is_active, false) = false then
        raise exception
            'Tài khoản đã bị vô hiệu hóa';
    end if;


    -- 4. CHỈ ADMIN ĐƯỢC SINH NGHĨA VỤ QUỸ
    if upper(coalesce(v_role, '')) <> 'ADMIN'
       and coalesce(v_can_manage_fund, false) = false then
        raise exception
            'FUND_MANAGEMENT_PERMISSION_REQUIRED';
    end if;


    -- 5. GỌI INTERNAL FUND ENGINE
    -- actor_user_id luôn lấy từ JWT,
    -- frontend không được tự truyền user_id.
    return public._generate_match_fund_internal(
        p_match_id,
        v_user_id
    );

end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_fund_expense(p_amount numeric, p_description text, p_transaction_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor_user_id uuid;
    v_profile_role text;
    v_profile_active boolean;
    v_can_manage_fund boolean;

    v_description text;
    v_transaction_id uuid;

    v_total_in numeric := 0;
    v_total_out numeric := 0;
    v_balance_before numeric := 0;
    v_balance_after numeric := 0;
begin
    /*
     * FUND EXPENSE V1
     *
     * Cash-in types:
     *   THU_QUY_THUA_TRAN
     *   THU_QUY_HOA
     *   UNG_HO
     *   TAI_TRO
     *   THU_KHAC
     *   CHUYEN_VAO_QUY
     *
     * Cash-out types:
     *   CHI_TIEU
     *   HOAN_TIEN
     *
     * DIEU_CHINH is deliberately excluded because
     * its increase/decrease direction is not defined yet.
     */

    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception 'Authentication required';
    end if;

    select
        p.role,
        p.is_active,
        p.can_manage_fund
    into
        v_profile_role,
        v_profile_active,
        v_can_manage_fund
    from public.profiles p
    where p.id = v_actor_user_id;

    if not found then
        raise exception 'Profile not found';
    end if;

    if coalesce(v_profile_active, false) is not true then
        raise exception 'Inactive account';
    end if;

    if upper(coalesce(v_profile_role, '')) <> 'ADMIN'
       and coalesce(v_can_manage_fund, false) = false then
        raise exception 'FUND_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    if p_amount is null or p_amount <= 0 then
        raise exception 'Expense amount must be greater than 0';
    end if;

    if p_transaction_date is null then
        raise exception 'Transaction date is required';
    end if;

    v_description := nullif(btrim(p_description), '');

    if v_description is null then
        raise exception 'Expense description is required';
    end if;

    perform pg_advisory_xact_lock(726184502);

    select
        coalesce(
            sum(
                case
                    when ft.transaction_type in (
                        'THU_QUY_THUA_TRAN',
                        'THU_QUY_HOA',
                        'UNG_HO',
                        'TAI_TRO',
                        'THU_KHAC',
                        'CHUYEN_VAO_QUY'
                    )
                    then ft.amount
                    else 0
                end
            ),
            0
        ),

        coalesce(
            sum(
                case
                    when ft.transaction_type in (
                        'CHI_TIEU',
                        'HOAN_TIEN'
                    )
                    then ft.amount
                    else 0
                end
            ),
            0
        )
    into
        v_total_in,
        v_total_out
    from public.fund_transactions ft;

    v_balance_before :=
        v_total_in - v_total_out;

    if p_amount > v_balance_before then
        raise exception
            'Insufficient fund balance. Available: %, requested: %',
            v_balance_before,
            p_amount;
    end if;

    insert into public.fund_transactions (
        transaction_date,
        transaction_type,
        amount,
        description,
        player_id,
        match_id,
        tournament_id,
        created_by,
        payment_id,
        reversal_of_transaction_id
    )
    values (
        p_transaction_date,
        'CHI_TIEU',
        p_amount,
        v_description,
        null,
        null,
        null,
        v_actor_user_id,
        null,
        null
    )
    returning id
    into v_transaction_id;

    v_balance_after :=
        v_balance_before - p_amount;

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
        v_actor_user_id,
        'RECORD_FUND_EXPENSE',
        'fund_transactions',
        v_transaction_id,
        null,
        jsonb_build_object(
            'transaction_id', v_transaction_id,
            'transaction_type', 'CHI_TIEU',
            'transaction_date', p_transaction_date,
            'amount', p_amount,
            'description', v_description,
            'balance_before', v_balance_before,
            'balance_after', v_balance_after
        ),
        v_description
    );

    return jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'transaction_type', 'CHI_TIEU',
        'transaction_date', p_transaction_date,
        'amount', p_amount,
        'description', v_description,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_fund_payment(p_contribution_id uuid, p_amount numeric, p_paid_at timestamp with time zone DEFAULT now(), p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_user_id uuid;
    v_role text;
    v_is_active boolean;
    v_can_collect_fund boolean;
begin

    -- =====================================================
    -- 1. LẤY USER TỪ JWT
    -- =====================================================

    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ';
    end if;


    -- =====================================================
    -- 2. KIỂM TRA PROFILE + QUYỀN ADMIN
    -- =====================================================

    select
        role,
        is_active,
        can_collect_fund
    into
        v_role,
        v_is_active,
        v_can_collect_fund
    from public.profiles
    where id = v_user_id;

    if not found then
        raise exception
            'Không tìm thấy hồ sơ người dùng';
    end if;

    if coalesce(v_is_active, false) = false then
        raise exception
            'Tài khoản đã bị vô hiệu hóa';
    end if;

    if upper(coalesce(v_role, '')) <> 'ADMIN'
       and coalesce(v_can_collect_fund, false) = false then
        raise exception
            'FUND_COLLECTION_PERMISSION_REQUIRED';
    end if;


    -- =====================================================
    -- 3. GỌI INTERNAL PAYMENT ENGINE
    --
    -- actor_user_id luôn lấy từ JWT.
    -- Frontend không được tự truyền user_id.
    -- =====================================================

    return public._record_fund_payment_internal(
        p_contribution_id,
        p_amount,
        p_paid_at,
        p_note,
        v_user_id
    );

end;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_fund_payment(p_payment_id uuid, p_amount numeric, p_reason text, p_refunded_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid;
    v_payment public.fund_payments%rowtype;
    v_contribution public.fund_contributions%rowtype;
    v_original public.fund_transactions%rowtype;

    v_reason text;
    v_original_count integer := 0;

    v_refunded_before numeric := 0;
    v_refunded_after numeric := 0;
    v_refundable_before numeric := 0;

    v_gross_paid numeric := 0;
    v_contribution_refunded numeric := 0;
    v_net_paid numeric := 0;

    v_new_status text;
    v_refund_transaction_id uuid;
BEGIN

    v_actor := auth.uid();

    IF v_actor IS NULL THEN
        RAISE EXCEPTION
            'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_actor
          AND p.is_active = true
          AND (
            upper(coalesce(p.role, '')) = 'ADMIN'
            OR coalesce(p.can_collect_fund, false)
          )
    ) THEN
        RAISE EXCEPTION
            'FUND_COLLECTION_PERMISSION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;


    IF p_payment_id IS NULL THEN
        RAISE EXCEPTION
            'PAYMENT_ID_REQUIRED';
    END IF;


    IF p_amount IS NULL
       OR p_amount <= 0 THEN
        RAISE EXCEPTION
            'REFUND_AMOUNT_MUST_BE_POSITIVE';
    END IF;


    IF p_refunded_at IS NULL THEN
        RAISE EXCEPTION
            'REFUNDED_AT_REQUIRED';
    END IF;


    v_reason :=
        nullif(
            btrim(
                coalesce(
                    p_reason,
                    ''
                )
            ),
            ''
        );

    IF v_reason IS NULL THEN
        RAISE EXCEPTION
            'REFUND_REASON_REQUIRED';
    END IF;

    IF char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION
            'REFUND_REASON_TOO_LONG';
    END IF;


    -- Serialize operations on this payment.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            p_payment_id::text,
            0
        )
    );


    SELECT *
    INTO v_payment
    FROM public.fund_payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'FUND_PAYMENT_NOT_FOUND';
    END IF;


    SELECT *
    INTO v_contribution
    FROM public.fund_contributions
    WHERE id = v_payment.contribution_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'FUND_CONTRIBUTION_NOT_FOUND';
    END IF;


    SELECT count(*)
    INTO v_original_count
    FROM public.fund_transactions ft
    WHERE ft.payment_id = p_payment_id
      AND ft.transaction_type IN (
          'THU_QUY_THUA_TRAN',
          'THU_QUY_HOA',
          'THU_KHAC'
      );

    IF v_original_count = 0 THEN
        RAISE EXCEPTION
            'ORIGINAL_FUND_TRANSACTION_NOT_FOUND';
    END IF;

    IF v_original_count <> 1 THEN
        RAISE EXCEPTION
            'ORIGINAL_FUND_TRANSACTION_NOT_UNIQUE';
    END IF;


    SELECT *
    INTO v_original
    FROM public.fund_transactions ft
    WHERE ft.payment_id = p_payment_id
      AND ft.transaction_type IN (
          'THU_QUY_THUA_TRAN',
          'THU_QUY_HOA',
          'THU_KHAC'
      )
    FOR UPDATE;


    SELECT
        coalesce(
            sum(rev.amount),
            0
        )
    INTO v_refunded_before
    FROM public.fund_transactions rev
    WHERE rev.transaction_type =
            'HOAN_TIEN'
      AND rev.reversal_of_transaction_id =
            v_original.id;


    v_refundable_before :=
        v_payment.amount -
        v_refunded_before;


    IF v_refundable_before <= 0 THEN
        RAISE EXCEPTION
            'PAYMENT_ALREADY_FULLY_REFUNDED';
    END IF;


    IF p_amount >
       v_refundable_before THEN
        RAISE EXCEPTION
            'REFUND_EXCEEDS_REFUNDABLE_AMOUNT';
    END IF;


    INSERT INTO public.fund_transactions (
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
    VALUES (
        p_refunded_at,
        'HOAN_TIEN',
        p_amount,
        'Hoàn tiền Quỹ: ' ||
            v_reason,
        v_payment.player_id,
        v_original.match_id,
        NULL,
        v_actor,
        now(),
        NULL,
        v_original.id
    )
    RETURNING id
    INTO v_refund_transaction_id;


    v_refunded_after :=
        v_refunded_before +
        p_amount;


    -- Recalculate contribution state from immutable payment history
    -- minus append-only refund transactions.
    SELECT
        coalesce(
            sum(fp.amount),
            0
        )
    INTO v_gross_paid
    FROM public.fund_payments fp
    WHERE fp.contribution_id =
        v_contribution.id;


    SELECT
        coalesce(
            sum(refund_tx.amount),
            0
        )
    INTO v_contribution_refunded

    FROM public.fund_transactions refund_tx

    LEFT JOIN
      public.fund_transactions original_tx
      ON original_tx.id =
         refund_tx.reversal_of_transaction_id

    LEFT JOIN
      public.fund_payments linked_payment
      ON linked_payment.id =
         coalesce(
             refund_tx.payment_id,
             original_tx.payment_id
         )

    WHERE refund_tx.transaction_type =
            'HOAN_TIEN'
      AND linked_payment.contribution_id =
            v_contribution.id;


    v_net_paid :=
        greatest(
            v_gross_paid -
            v_contribution_refunded,
            0
        );


    v_new_status :=
        CASE
            WHEN v_net_paid <= 0
                THEN 'CHUA_DONG'

            WHEN v_net_paid >=
                 v_contribution.amount_due
                THEN 'DA_DONG'

            ELSE 'DONG_MOT_PHAN'
        END;


    UPDATE public.fund_contributions
    SET status = v_new_status
    WHERE id = v_contribution.id;


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
        v_actor,

        'REFUND_FUND_PAYMENT',

        'fund_transactions',

        v_refund_transaction_id,

        jsonb_build_object(
            'payment_id',
                v_payment.id,
            'contribution_id',
                v_contribution.id,
            'original_transaction_id',
                v_original.id,
            'payment_amount',
                v_payment.amount,
            'refunded_before',
                v_refunded_before,
            'contribution_status',
                v_contribution.status
        ),

        jsonb_build_object(
            'refund_transaction_id',
                v_refund_transaction_id,
            'payment_id',
                v_payment.id,
            'contribution_id',
                v_contribution.id,
            'campaign_id',
                v_contribution.campaign_id,
            'original_transaction_id',
                v_original.id,
            'refund_amount',
                p_amount,
            'refunded_after',
                v_refunded_after,
            'refundable_after',
                v_payment.amount -
                v_refunded_after,
            'gross_paid',
                v_gross_paid,
            'contribution_refunded',
                v_contribution_refunded,
            'net_paid',
                v_net_paid,
            'new_status',
                v_new_status,
            'engine',
                'FUND_PAYMENT_REFUND_V1'
        ),

        v_reason,

        now()
    );


    RETURN jsonb_build_object(
        'ok',
            true,
        'refund_transaction_id',
            v_refund_transaction_id,
        'payment_id',
            v_payment.id,
        'contribution_id',
            v_contribution.id,
        'campaign_id',
            v_contribution.campaign_id,
        'original_transaction_id',
            v_original.id,
        'payment_amount',
            v_payment.amount,
        'refund_amount',
            p_amount,
        'refunded_before',
            v_refunded_before,
        'refunded_after',
            v_refunded_after,
        'refundable_after',
            v_payment.amount -
            v_refunded_after,
        'net_paid',
            v_net_paid,
        'status',
            v_new_status,
        'engine',
            'FUND_PAYMENT_REFUND_V1'
    );

END;
$function$
;


CREATE OR REPLACE FUNCTION public.get_fund_management_contributions()
RETURNS SETOF public.fund_contributions
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
        OR coalesce(v_profile.can_manage_fund, false)
        OR coalesce(v_profile.can_collect_fund, false)
    ) THEN
        RAISE EXCEPTION 'FUND_READ_PERMISSION_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT fc.*
    FROM public.fund_contributions fc
    ORDER BY fc.created_at ASC, fc.id ASC;
END;
$function$;

REVOKE ALL
ON FUNCTION public.get_fund_management_contributions()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_fund_management_contributions()
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_fund_management_contributions()
TO authenticated;


CREATE OR REPLACE FUNCTION public.get_fund_management_payments()
RETURNS SETOF public.fund_payments
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
        OR coalesce(v_profile.can_manage_fund, false)
        OR coalesce(v_profile.can_collect_fund, false)
    ) THEN
        RAISE EXCEPTION 'FUND_READ_PERMISSION_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT fp.*
    FROM public.fund_payments fp
    ORDER BY fp.paid_at ASC, fp.id ASC;
END;
$function$;

REVOKE ALL
ON FUNCTION public.get_fund_management_payments()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_fund_management_payments()
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_fund_management_payments()
TO authenticated;


CREATE OR REPLACE FUNCTION public.get_fund_management_transactions()
RETURNS SETOF public.fund_transactions
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
        OR coalesce(v_profile.can_manage_fund, false)
    ) THEN
        RAISE EXCEPTION 'FUND_MANAGEMENT_PERMISSION_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT ft.*
    FROM public.fund_transactions ft
    ORDER BY ft.transaction_date ASC, ft.id ASC;
END;
$function$;

REVOKE ALL
ON FUNCTION public.get_fund_management_transactions()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_fund_management_transactions()
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_fund_management_transactions()
TO authenticated;
