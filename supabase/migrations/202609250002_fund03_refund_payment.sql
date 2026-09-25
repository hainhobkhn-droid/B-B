-- ============================================================
-- FUND03D
-- Append-only refund/reversal for fund payments.
-- Original payment and original cash transaction are preserved.
-- ============================================================

CREATE OR REPLACE FUNCTION
public.refund_fund_payment(
    p_payment_id uuid,
    p_amount numeric,
    p_reason text,
    p_refunded_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
          AND p.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION
            'ADMIN_REQUIRED'
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
$$;


REVOKE ALL
ON FUNCTION
public.refund_fund_payment(
    uuid,
    numeric,
    text,
    timestamptz
)
FROM PUBLIC, anon;


GRANT EXECUTE
ON FUNCTION
public.refund_fund_payment(
    uuid,
    numeric,
    text,
    timestamptz
)
TO authenticated;


COMMENT ON FUNCTION
public.refund_fund_payment(
    uuid,
    numeric,
    text,
    timestamptz
)
IS
'ADMIN-only append-only refund for fund payments using HOAN_TIEN + reversal_of_transaction_id.';