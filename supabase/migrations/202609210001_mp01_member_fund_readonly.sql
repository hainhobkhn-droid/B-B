-- MP01 part 1. New read-only API; existing writers, RLS and table grants unchanged.
-- Apply in a transaction. This file deliberately does not COMMIT.
-- Cash semantics match record_fund_expense/void_match inspected 2026-09-21:
-- HOAN_TIEN is positive cash out; DIEU_CHINH has no defined cash direction.

CREATE FUNCTION public.get_my_fund_obligations()
RETURNS TABLE (
  contribution_id uuid, match_id uuid, occurred_at timestamptz, reason text,
  amount_due numeric, collectible_amount numeric, payment_total numeric,
  refund_total numeric, amount_paid numeric, amount_remaining numeric,
  status text, is_collectible boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_player uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT p.player_id INTO v_player FROM public.profiles p
  WHERE p.id=auth.uid() AND p.is_active AND p.role IN ('MEMBER','ADMIN');
  IF v_player IS NULL THEN RAISE EXCEPTION 'ACTIVE_LINKED_PROFILE_REQUIRED' USING ERRCODE='42501'; END IF;

  RETURN QUERY
  WITH payments AS (
    SELECT p.* FROM public.fund_payments p
    JOIN public.fund_contributions c ON c.id=p.contribution_id
    WHERE p.player_id=v_player AND c.player_id=v_player
  ), refunds AS (
    SELECT p.contribution_id, sum(t.amount) AS amount
    FROM public.fund_transactions t
    LEFT JOIN public.fund_transactions original ON original.id=t.reversal_of_transaction_id
      AND original.player_id=v_player
    JOIN payments p ON p.id=coalesce(t.payment_id,original.payment_id)
    WHERE t.player_id=v_player AND t.transaction_type='HOAN_TIEN'
    GROUP BY p.contribution_id
  ), amounts AS (
    SELECT c.*, coalesce(p.amount,0) AS paid, coalesce(r.amount,0) AS refunded,
      c.status NOT IN ('MIEN','DIEU_CHINH','VOIDED','INVALID','CANCELLED','CANCELED')
      AND coalesce(m.status,'')<>'VOIDED' AS collectible
    FROM public.fund_contributions c
    LEFT JOIN public.matches m ON m.id=c.match_id
    LEFT JOIN (SELECT p.contribution_id,sum(p.amount) AS amount FROM payments p GROUP BY p.contribution_id) p ON p.contribution_id=c.id
    LEFT JOIN refunds r ON r.contribution_id=c.id
    WHERE c.player_id=v_player
  )
  SELECT a.id,a.match_id,a.created_at,a.reason,a.amount_due,
    CASE WHEN a.collectible THEN a.amount_due ELSE 0 END,
    a.paid,a.refunded,a.paid-a.refunded,
    CASE WHEN a.collectible THEN greatest(a.amount_due-a.paid+a.refunded,0) ELSE 0 END,
    a.status,a.collectible
  FROM amounts a ORDER BY a.created_at DESC,a.id;
END;
$$;

CREATE FUNCTION public.get_my_fund_payment_history()
RETURNS TABLE (
  event_id uuid, event_source text, occurred_at timestamptz,
  transaction_type text, amount numeric, cash_delta numeric,
  payment_id uuid, contribution_id uuid, match_id uuid,
  reversal_of_transaction_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_player uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT p.player_id INTO v_player FROM public.profiles p
  WHERE p.id=auth.uid() AND p.is_active AND p.role IN ('MEMBER','ADMIN');
  IF v_player IS NULL THEN RAISE EXCEPTION 'ACTIVE_LINKED_PROFILE_REQUIRED' USING ERRCODE='42501'; END IF;

  -- One event per ledger row, including both original and refund.
  -- Never expose staff notes, actor IDs, or other players' linked IDs.
  RETURN QUERY
  WITH own_payments AS (
    SELECT p.* FROM public.fund_payments p
    JOIN public.fund_contributions c ON c.id=p.contribution_id
    WHERE p.player_id=v_player AND c.player_id=v_player
  ), events AS (
    SELECT t.id,'LEDGER'::text AS source,t.transaction_date AS at,t.transaction_type,t.amount,
      CASE WHEN t.transaction_type IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','UNG_HO','TAI_TRO','THU_KHAC','CHUYEN_VAO_QUY') THEN t.amount
           WHEN t.transaction_type IN ('CHI_TIEU','HOAN_TIEN') THEN -t.amount
           ELSE NULL::numeric END AS delta,
      p.id AS payment,p.contribution_id,t.match_id,original.id AS reversal
    FROM public.fund_transactions t
    LEFT JOIN public.fund_transactions original ON original.id=t.reversal_of_transaction_id AND original.player_id=v_player
    LEFT JOIN own_payments p ON p.id=coalesce(t.payment_id,original.payment_id)
    WHERE t.player_id=v_player
    UNION ALL
    -- Legacy payment without ledger: disclose payment, but do not invent cash.
    SELECT p.id,'PAYMENT_WITHOUT_LEDGER',p.paid_at,'PAYMENT',p.amount,NULL::numeric,
      p.id,p.contribution_id,c.match_id,NULL::uuid
    FROM own_payments p
    JOIN public.fund_contributions c ON c.id=p.contribution_id
    WHERE NOT EXISTS (SELECT 1 FROM public.fund_transactions t WHERE t.payment_id=p.id)
  )
  SELECT e.id,e.source,e.at,e.transaction_type,e.amount,e.delta,e.payment,e.contribution_id,e.match_id,e.reversal
  FROM events e ORDER BY e.at DESC,e.id;
END;
$$;

CREATE FUNCTION public.get_club_fund_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
    AND p.is_active AND p.role IN ('MEMBER','ADMIN')) THEN
    RAISE EXCEPTION 'ACTIVE_PROFILE_REQUIRED' USING ERRCODE='42501';
  END IF;

  -- All totals use the same statement snapshot. Cash never joins payments.
  WITH cash AS (
    SELECT coalesce(sum(t.amount) FILTER (WHERE t.transaction_type IN
      ('THU_QUY_THUA_TRAN','THU_QUY_HOA','UNG_HO','TAI_TRO','THU_KHAC','CHUYEN_VAO_QUY')),0) AS income,
      coalesce(sum(t.amount) FILTER (WHERE t.transaction_type IN ('CHI_TIEU','HOAN_TIEN')),0) AS expense,
      count(*) FILTER (WHERE t.transaction_type='DIEU_CHINH') AS adjustment_count,
      coalesce(sum(t.amount) FILTER (WHERE t.transaction_type='DIEU_CHINH'),0) AS adjustment_amount
    FROM public.fund_transactions t
  ), refunds AS (
    SELECT p.contribution_id,sum(t.amount) AS amount
    FROM public.fund_transactions t
    LEFT JOIN public.fund_transactions original ON original.id=t.reversal_of_transaction_id
    JOIN public.fund_payments p ON p.id=coalesce(t.payment_id,original.payment_id)
    WHERE t.transaction_type='HOAN_TIEN' AND t.player_id=p.player_id
    GROUP BY p.contribution_id
  ), dues AS (
    SELECT c.amount_due,coalesce(p.amount,0)-coalesce(r.amount,0) AS paid
    FROM public.fund_contributions c
    LEFT JOIN public.matches m ON m.id=c.match_id
    LEFT JOIN (SELECT p.contribution_id,sum(p.amount) AS amount FROM public.fund_payments p GROUP BY p.contribution_id) p ON p.contribution_id=c.id
    LEFT JOIN refunds r ON r.contribution_id=c.id
    WHERE c.status NOT IN ('MIEN','DIEU_CHINH','VOIDED','INVALID','CANCELLED','CANCELED')
      AND coalesce(m.status,'')<>'VOIDED'
  ), obligations AS (
    SELECT coalesce(sum(d.amount_due),0) AS due,coalesce(sum(d.paid),0) AS paid,
      coalesce(sum(greatest(d.amount_due-d.paid,0)),0) AS outstanding,
      coalesce(sum(greatest(d.paid-d.amount_due,0)),0) AS credit FROM dues d
  )
  SELECT jsonb_build_object('total_in',c.income,'total_out',c.expense,'balance',c.income-c.expense,
    'adjustment_count',c.adjustment_count,'adjustment_amount',c.adjustment_amount,
    'total_due',o.due,'total_paid',o.paid,'total_outstanding',o.outstanding,'total_credit',o.credit)
  INTO v_result FROM cash c CROSS JOIN obligations o;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_fund_obligations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_fund_payment_history() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_club_fund_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_fund_obligations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_fund_payment_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_club_fund_summary() TO authenticated;
