-- ============================================================
-- FUND03E
-- Least-privilege collection balance read model.
--
-- Purpose:
-- - Allow ADMIN / delegated fund manager / delegated collector
--   to read NET payment state per fund contribution.
-- - Do NOT expose raw fund_transactions ledger rows.
-- ============================================================

CREATE OR REPLACE FUNCTION
public.get_fund_collection_balances()
RETURNS TABLE (
    contribution_id uuid,
    player_id uuid,
    amount_due numeric,
    gross_paid numeric,
    refunded numeric,
    net_paid numeric,
    amount_remaining numeric,
    computed_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_uid uuid;
    v_profile public.profiles%rowtype;
BEGIN
    -- --------------------------------------------------------
    -- Authentication / authorization
    -- --------------------------------------------------------

    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO v_profile
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND'
            USING ERRCODE = '42501';
    END IF;

    IF coalesce(v_profile.is_active, false) = false THEN
        RAISE EXCEPTION 'PROFILE_INACTIVE'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (
        upper(coalesce(v_profile.role, '')) = 'ADMIN'
        OR coalesce(v_profile.can_manage_fund, false)
        OR coalesce(v_profile.can_collect_fund, false)
    ) THEN
        RAISE EXCEPTION 'FUND_READ_PERMISSION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    -- --------------------------------------------------------
    -- Read model
    --
    -- Valid refund chain:
    --
    -- HOAN_TIEN
    --   -> reversal_of_transaction_id
    --   -> original cash-in fund_transaction
    --   -> original.payment_id
    --   -> fund_payments
    --   -> contribution_id
    --
    -- Orphan / malformed refunds are deliberately ignored here.
    -- --------------------------------------------------------

    RETURN QUERY
    WITH payment_totals AS (
        SELECT
            fp.contribution_id,
            coalesce(sum(fp.amount), 0)::numeric AS gross_paid
        FROM public.fund_payments fp
        WHERE fp.contribution_id IS NOT NULL
        GROUP BY fp.contribution_id
    ),

    refund_totals AS (
        SELECT
            fp.contribution_id,
            coalesce(sum(refund_tx.amount), 0)::numeric AS refunded
        FROM public.fund_transactions refund_tx

        JOIN public.fund_transactions original_tx
          ON original_tx.id =
             refund_tx.reversal_of_transaction_id

        JOIN public.fund_payments fp
          ON fp.id =
             original_tx.payment_id

        WHERE refund_tx.transaction_type = 'HOAN_TIEN'

          AND original_tx.transaction_type IN (
              'THU_QUY_THUA_TRAN',
              'THU_QUY_HOA',
              'THU_KHAC'
          )

          AND fp.contribution_id IS NOT NULL

        GROUP BY
            fp.contribution_id
    ),

    balances AS (
        SELECT
            fc.id AS contribution_id,
            fc.player_id,
            coalesce(fc.amount_due, 0)::numeric AS amount_due,

            coalesce(
                pt.gross_paid,
                0
            )::numeric AS gross_paid,

            coalesce(
                rt.refunded,
                0
            )::numeric AS refunded,

            greatest(
                coalesce(
                    pt.gross_paid,
                    0
                ) -
                coalesce(
                    rt.refunded,
                    0
                ),
                0
            )::numeric AS net_paid

        FROM public.fund_contributions fc

        LEFT JOIN public.matches m
          ON m.id =
             fc.match_id

        LEFT JOIN public.fund_obligation_campaigns camp
          ON camp.id =
             fc.campaign_id

        LEFT JOIN payment_totals pt
          ON pt.contribution_id =
             fc.id

        LEFT JOIN refund_totals rt
          ON rt.contribution_id =
             fc.id

        WHERE coalesce(
            fc.amount_due,
            0
        ) > 0

          AND upper(
              coalesce(
                  fc.status,
                  ''
              )
          ) NOT IN (
              'MIEN',
              'DIEU_CHINH',
              'VOIDED',
              'INVALID',
              'CANCELLED',
              'CANCELED'
          )

          AND (
              fc.match_id IS NULL
              OR upper(
                  coalesce(
                      m.status,
                      ''
                  )
              ) <> 'VOIDED'
          )

          AND (
              fc.campaign_id IS NULL
              OR upper(
                  coalesce(
                      camp.status,
                      ''
                  )
              ) <> 'CANCELLED'
          )
    )

    SELECT
        b.contribution_id,
        b.player_id,
        b.amount_due,
        b.gross_paid,
        b.refunded,
        b.net_paid,

        greatest(
            b.amount_due -
            b.net_paid,
            0
        )::numeric AS amount_remaining,

        CASE
            WHEN b.net_paid <= 0
                THEN 'CHUA_DONG'

            WHEN b.net_paid >=
                 b.amount_due
                THEN 'DA_DONG'

            ELSE 'DONG_MOT_PHAN'
        END::text AS computed_status

    FROM balances b

    ORDER BY
        b.contribution_id;

END;
$function$;


REVOKE ALL
ON FUNCTION
public.get_fund_collection_balances()
FROM PUBLIC;


REVOKE ALL
ON FUNCTION
public.get_fund_collection_balances()
FROM anon;


GRANT EXECUTE
ON FUNCTION
public.get_fund_collection_balances()
TO authenticated;


COMMENT ON FUNCTION
public.get_fund_collection_balances()
IS
'FUND03E least-privilege NET fund balance read model for ADMIN, fund managers and delegated fund collectors.';