-- ============================================================
-- FUND03C
-- Payment Engine V2 + campaign-aware club fund summary
-- ============================================================


-- ============================================================
-- 1. PAYMENT ENGINE V2
-- Existing public.record_fund_payment() remains unchanged and
-- continues calling this internal engine.
-- ============================================================

CREATE OR REPLACE FUNCTION
public._record_fund_payment_internal(
    p_contribution_id uuid,
    p_amount numeric,
    p_paid_at timestamptz DEFAULT now(),
    p_note text DEFAULT NULL,
    p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_contribution public.fund_contributions%rowtype;
    v_match public.matches%rowtype;
    v_campaign public.fund_obligation_campaigns%rowtype;

    v_payment_id uuid;
    v_transaction_id uuid;

    v_paid_before numeric := 0;
    v_paid_after numeric := 0;
    v_remaining numeric := 0;

    v_new_status text;
    v_transaction_type text;
    v_description text;
BEGIN

    IF p_contribution_id IS NULL THEN
        RAISE EXCEPTION
            'contribution_id không được NULL';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION
            'Số tiền thanh toán phải lớn hơn 0';
    END IF;

    IF p_paid_at IS NULL THEN
        RAISE EXCEPTION
            'paid_at không được NULL';
    END IF;


    SELECT *
    INTO v_contribution
    FROM public.fund_contributions
    WHERE id = p_contribution_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Không tìm thấy fund_contribution: %',
            p_contribution_id;
    END IF;


    IF v_contribution.amount_due IS NULL
       OR v_contribution.amount_due <= 0 THEN
        RAISE EXCEPTION
            'Contribution % có amount_due không hợp lệ: %',
            p_contribution_id,
            v_contribution.amount_due;
    END IF;

    IF v_contribution.status = 'MIEN' THEN
        RAISE EXCEPTION
            'Contribution % đã được MIỄN, không thể ghi thanh toán',
            p_contribution_id;
    END IF;

    IF v_contribution.status = 'DIEU_CHINH' THEN
        RAISE EXCEPTION
            'Contribution % đang ở trạng thái ĐIỀU CHỈNH, không thể ghi thanh toán tự động',
            p_contribution_id;
    END IF;


    -- Campaign obligation
    IF v_contribution.campaign_id IS NOT NULL THEN

        IF v_contribution.match_id IS NOT NULL THEN
            RAISE EXCEPTION
                'Contribution % vừa có match_id vừa có campaign_id',
                p_contribution_id;
        END IF;

        SELECT *
        INTO v_campaign
        FROM public.fund_obligation_campaigns
        WHERE id = v_contribution.campaign_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Không tìm thấy campaign %',
                v_contribution.campaign_id;
        END IF;

        IF v_campaign.status = 'CANCELLED' THEN
            RAISE EXCEPTION
                'Campaign đã bị hủy, không thể ghi thanh toán';
        END IF;

    -- Match obligation
    ELSE

        IF v_contribution.match_id IS NULL THEN
            RAISE EXCEPTION
                'Contribution % không có nguồn match hoặc campaign',
                p_contribution_id;
        END IF;

        SELECT *
        INTO v_match
        FROM public.matches
        WHERE id = v_contribution.match_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Không tìm thấy match %',
                v_contribution.match_id;
        END IF;

        IF v_match.status = 'VOIDED' THEN
            RAISE EXCEPTION
                'Match đã VOIDED, không thể ghi thanh toán';
        END IF;

    END IF;


    SELECT coalesce(sum(fp.amount), 0)
    INTO v_paid_before
    FROM public.fund_payments fp
    WHERE fp.contribution_id =
        p_contribution_id;


    IF v_paid_before >=
       v_contribution.amount_due THEN
        RAISE EXCEPTION
            'Contribution đã thanh toán đủ. Phải thu: %, đã thu: %',
            v_contribution.amount_due,
            v_paid_before;
    END IF;


    v_paid_after :=
        v_paid_before +
        p_amount;


    IF v_paid_after >
       v_contribution.amount_due THEN
        RAISE EXCEPTION
            'Thanh toán vượt công nợ. Phải thu: %, đã thu trước: %, thanh toán mới: %',
            v_contribution.amount_due,
            v_paid_before,
            p_amount;
    END IF;


    IF v_paid_after =
       v_contribution.amount_due THEN

        v_new_status :=
            'DA_DONG';

        v_remaining :=
            0;

    ELSE

        v_new_status :=
            'DONG_MOT_PHAN';

        v_remaining :=
            v_contribution.amount_due -
            v_paid_after;

    END IF;


    CASE v_contribution.reason

        WHEN 'THUA' THEN
            v_transaction_type :=
                'THU_QUY_THUA_TRAN';

            v_description :=
                'Thu quỹ thua trận';

        WHEN 'HOA' THEN
            v_transaction_type :=
                'THU_QUY_HOA';

            v_description :=
                'Thu quỹ trận hòa';

        WHEN 'QUY_THANG' THEN
            v_transaction_type :=
                'THU_KHAC';

            v_description :=
                coalesce(
                    v_campaign.title,
                    'Thu Quỹ CLB tháng'
                );

        WHEN 'PHI_SINH_HOAT' THEN
            v_transaction_type :=
                'THU_KHAC';

            v_description :=
                coalesce(
                    v_campaign.title,
                    'Thu phí sinh hoạt'
                );

        WHEN 'PHI_SU_KIEN' THEN
            v_transaction_type :=
                'THU_KHAC';

            v_description :=
                coalesce(
                    v_campaign.title,
                    'Thu phí sự kiện'
                );

        WHEN 'KHAC' THEN
            v_transaction_type :=
                'THU_KHAC';

            v_description :=
                coalesce(
                    v_campaign.title,
                    'Thu khoản phải đóng khác'
                );

        ELSE
            RAISE EXCEPTION
                'Contribution reason "%" chưa được Payment Engine V2 hỗ trợ',
                v_contribution.reason;

    END CASE;


    INSERT INTO public.fund_payments (
        contribution_id,
        player_id,
        amount,
        paid_at,
        confirmed_by,
        note,
        created_at
    )
    VALUES (
        v_contribution.id,
        v_contribution.player_id,
        p_amount,
        p_paid_at,
        p_actor_user_id,
        p_note,
        now()
    )
    RETURNING id
    INTO v_payment_id;


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
        payment_id
    )
    VALUES (
        p_paid_at,
        v_transaction_type,
        p_amount,
        v_description,
        v_contribution.player_id,
        v_contribution.match_id,
        NULL,
        p_actor_user_id,
        now(),
        v_payment_id
    )
    RETURNING id
    INTO v_transaction_id;


    UPDATE public.fund_contributions
    SET status = v_new_status
    WHERE id =
        v_contribution.id;


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
        p_actor_user_id,

        'RECORD_FUND_PAYMENT',

        'fund_payments',

        v_payment_id,

        jsonb_build_object(
            'contribution_id',
                v_contribution.id,
            'status',
                v_contribution.status,
            'paid_before',
                v_paid_before
        ),

        jsonb_build_object(
            'payment_id',
                v_payment_id,
            'transaction_id',
                v_transaction_id,
            'contribution_id',
                v_contribution.id,
            'player_id',
                v_contribution.player_id,
            'match_id',
                v_contribution.match_id,
            'campaign_id',
                v_contribution.campaign_id,
            'reason',
                v_contribution.reason,
            'amount_due',
                v_contribution.amount_due,
            'payment_amount',
                p_amount,
            'paid_before',
                v_paid_before,
            'paid_after',
                v_paid_after,
            'remaining',
                v_remaining,
            'new_status',
                v_new_status,
            'transaction_type',
                v_transaction_type,
            'engine',
                'FUND_PAYMENT_V2'
        ),

        'Ghi nhận thanh toán nghĩa vụ Quỹ CLB',

        now()
    );


    RETURN jsonb_build_object(
        'success',
            true,
        'payment_id',
            v_payment_id,
        'transaction_id',
            v_transaction_id,
        'contribution_id',
            v_contribution.id,
        'player_id',
            v_contribution.player_id,
        'match_id',
            v_contribution.match_id,
        'campaign_id',
            v_contribution.campaign_id,
        'reason',
            v_contribution.reason,
        'amount_due',
            v_contribution.amount_due,
        'payment_amount',
            p_amount,
        'paid_before',
            v_paid_before,
        'paid_after',
            v_paid_after,
        'remaining',
            v_remaining,
        'status',
            v_new_status,
        'transaction_type',
            v_transaction_type,
        'engine',
            'FUND_PAYMENT_V2'
    );

END;
$$;


-- ============================================================
-- 2. CLUB FUND SUMMARY
-- Exclude cancelled obligation campaigns.
-- ============================================================

CREATE OR REPLACE FUNCTION
public.get_club_fund_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result jsonb;
BEGIN

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION
            'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active
          AND p.role IN (
              'MEMBER',
              'ADMIN'
          )
    ) THEN
        RAISE EXCEPTION
            'ACTIVE_PROFILE_REQUIRED'
            USING ERRCODE = '42501';
    END IF;


    WITH cash AS (
        SELECT
            coalesce(
                sum(t.amount)
                FILTER (
                    WHERE t.transaction_type IN (
                        'THU_QUY_THUA_TRAN',
                        'THU_QUY_HOA',
                        'UNG_HO',
                        'TAI_TRO',
                        'THU_KHAC',
                        'CHUYEN_VAO_QUY'
                    )
                ),
                0
            ) AS income,

            coalesce(
                sum(t.amount)
                FILTER (
                    WHERE t.transaction_type IN (
                        'CHI_TIEU',
                        'HOAN_TIEN'
                    )
                ),
                0
            ) AS expense,

            count(*)
                FILTER (
                    WHERE t.transaction_type =
                        'DIEU_CHINH'
                )
                AS adjustment_count,

            coalesce(
                sum(t.amount)
                FILTER (
                    WHERE t.transaction_type =
                        'DIEU_CHINH'
                ),
                0
            )
                AS adjustment_amount

        FROM public.fund_transactions t
    ),

    refunds AS (
        SELECT
            p.contribution_id,
            sum(t.amount) AS amount

        FROM public.fund_transactions t

        LEFT JOIN public.fund_transactions original
          ON original.id =
             t.reversal_of_transaction_id

        JOIN public.fund_payments p
          ON p.id =
             coalesce(
                 t.payment_id,
                 original.payment_id
             )

        WHERE t.transaction_type =
            'HOAN_TIEN'

          AND t.player_id =
              p.player_id

        GROUP BY
            p.contribution_id
    ),

    payment_totals AS (
        SELECT
            p.contribution_id,
            sum(p.amount) AS amount
        FROM public.fund_payments p
        GROUP BY p.contribution_id
    ),

    dues AS (
        SELECT
            c.amount_due,

            coalesce(
                p.amount,
                0
            ) -
            coalesce(
                r.amount,
                0
            ) AS paid

        FROM public.fund_contributions c

        LEFT JOIN public.matches m
          ON m.id =
             c.match_id

        LEFT JOIN
          public.fund_obligation_campaigns camp
          ON camp.id =
             c.campaign_id

        LEFT JOIN payment_totals p
          ON p.contribution_id =
             c.id

        LEFT JOIN refunds r
          ON r.contribution_id =
             c.id

        WHERE c.status NOT IN (
            'MIEN',
            'DIEU_CHINH',
            'VOIDED',
            'INVALID',
            'CANCELLED',
            'CANCELED'
        )

          AND (
              c.match_id IS NULL
              OR coalesce(
                  m.status,
                  ''
              ) <> 'VOIDED'
          )

          AND (
              c.campaign_id IS NULL
              OR coalesce(
                  camp.status,
                  ''
              ) <> 'CANCELLED'
          )
    ),

    obligations AS (
        SELECT
            coalesce(
                sum(d.amount_due),
                0
            ) AS due,

            coalesce(
                sum(d.paid),
                0
            ) AS paid,

            coalesce(
                sum(
                    greatest(
                        d.amount_due -
                        d.paid,
                        0
                    )
                ),
                0
            ) AS outstanding,

            coalesce(
                sum(
                    greatest(
                        d.paid -
                        d.amount_due,
                        0
                    )
                ),
                0
            ) AS credit

        FROM dues d
    )

    SELECT jsonb_build_object(
        'total_in',
            c.income,
        'total_out',
            c.expense,
        'balance',
            c.income -
            c.expense,
        'adjustment_count',
            c.adjustment_count,
        'adjustment_amount',
            c.adjustment_amount,
        'total_due',
            o.due,
        'total_paid',
            o.paid,
        'total_outstanding',
            o.outstanding,
        'total_credit',
            o.credit
    )
    INTO v_result
    FROM cash c
    CROSS JOIN obligations o;


    RETURN v_result;

END;
$$;


REVOKE ALL
ON FUNCTION
public.get_club_fund_summary()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION
public.get_club_fund_summary()
TO authenticated;


COMMENT ON FUNCTION
public._record_fund_payment_internal(
    uuid,
    numeric,
    timestamptz,
    text,
    uuid
)
IS
'FUND03 Payment Engine V2: supports match and obligation campaign payments.';