-- ============================================================
-- FUND03E
-- Cancel obligation campaign safely.
--
-- Rules:
-- - ADMIN only.
-- - No hard delete.
-- - Campaign must exist and not already be CANCELLED.
-- - Cancellation is blocked while any net collected amount
--   remains after refunds.
-- - Contributions remain immutable history; campaign status
--   controls collectibility.
-- ============================================================

CREATE OR REPLACE FUNCTION
public.cancel_fund_obligation_campaign(
    p_campaign_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
          AND p.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION
            'ADMIN_REQUIRED'
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
$$;


REVOKE ALL
ON FUNCTION
public.cancel_fund_obligation_campaign(
    uuid,
    text
)
FROM PUBLIC, anon;


GRANT EXECUTE
ON FUNCTION
public.cancel_fund_obligation_campaign(
    uuid,
    text
)
TO authenticated;


COMMENT ON FUNCTION
public.cancel_fund_obligation_campaign(
    uuid,
    text
)
IS
'ADMIN-only safe cancellation of FUND03 obligation campaigns after all collected money has been refunded.';