BEGIN;

-- FUND03 fix: allow repayment after append-only refunds.
-- Replace only the internal engine; preserve the public wrapper and existing ACLs.
-- Contribution FOR UPDATE serializes this calculation with the refund engine.

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

    v_gross_paid numeric := 0;
    v_refunded numeric := 0;
    v_remaining_before numeric := 0;
    -- Keep paid_before/paid_after response and audit keys; values are NET paid.
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
    INTO v_gross_paid
    FROM public.fund_payments fp
    WHERE fp.contribution_id =
        p_contribution_id;


    -- Refunds are append-only and belong to the original payment's contribution.
    -- Joining through primary keys counts each refund once, including refunds
    -- whose payment_id is NULL (the current refund_fund_payment contract).
    SELECT coalesce(sum(refund_tx.amount), 0)
    INTO v_refunded
    FROM public.fund_transactions refund_tx
    JOIN public.fund_transactions original_tx
      ON original_tx.id = refund_tx.reversal_of_transaction_id
    JOIN public.fund_payments linked_payment
      ON linked_payment.id = original_tx.payment_id
    WHERE refund_tx.transaction_type = 'HOAN_TIEN'
      AND original_tx.transaction_type IN (
          'THU_QUY_THUA_TRAN', 'THU_QUY_HOA', 'THU_KHAC'
      )
      AND linked_payment.contribution_id = p_contribution_id;

    v_paid_before := greatest(v_gross_paid - v_refunded, 0);
    v_remaining_before := v_contribution.amount_due - v_paid_before;

    IF v_remaining_before <= 0 THEN
        RAISE EXCEPTION
            'Contribution đã thanh toán đủ. Phải thu: %, đã thu: %',
            v_contribution.amount_due,
            v_paid_before;
    END IF;

    IF p_amount > v_remaining_before THEN
        RAISE EXCEPTION
            'Thanh toán vượt công nợ. Phải thu: %, đã thu trước: %, thanh toán mới: %',
            v_contribution.amount_due,
            v_paid_before,
            p_amount;
    END IF;

    v_paid_after := greatest(v_gross_paid + p_amount - v_refunded, 0);
    v_remaining := greatest(v_contribution.amount_due - v_paid_after, 0);
    v_new_status := CASE
        WHEN v_paid_after <= 0 THEN 'CHUA_DONG'
        WHEN v_paid_after >= v_contribution.amount_due THEN 'DA_DONG'
        ELSE 'DONG_MOT_PHAN'
    END;


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

COMMIT;
