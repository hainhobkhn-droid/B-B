-- FUND03E READ-ONLY PREFLIGHT. No migration or business mutation.
-- Run in SQL Editor as an authorized database operator.
-- Run section 1 first; its candidates are NOT authorization to use real debt.
-- Then replace <CONTRIBUTION_UUID> for section 2 and run the whole script.
-- <PAYMENT_ID> is optional for narrowing the section 2 output; no manual
-- payment ID is needed in the controlled test (RPC results capture it).
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

-- 1. Candidates: two dedicated test contributions must be confirmed by owner.
SELECT c.id, c.player_id, c.amount_due, c.status, c.reason,
       c.match_id, c.campaign_id
FROM public.fund_contributions c
LEFT JOIN public.matches m ON m.id=c.match_id
LEFT JOIN public.fund_obligation_campaigns k ON k.id=c.campaign_id
WHERE c.amount_due=100000 AND c.status='CHUA_DONG'
  AND c.reason IN ('THUA','HOA','QUY_THANG','PHI_SINH_HOAT','PHI_SU_KIEN','KHAC')
  AND ((c.campaign_id IS NOT NULL AND c.match_id IS NULL AND k.status IS DISTINCT FROM 'CANCELLED' AND k.id IS NOT NULL)
    OR (c.campaign_id IS NULL AND m.id IS NOT NULL AND m.status IS DISTINCT FROM 'VOIDED'))
  AND NOT EXISTS (SELECT 1 FROM public.fund_payments p WHERE p.contribution_id=c.id)
ORDER BY c.id LIMIT 50;

-- Check deployed definitions, security context, and effective execute privileges.
-- A repository migration existing does NOT mean this database has applied it.
SELECT p.oid::regprocedure AS function_name, p.prosecdef, p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       p.proacl, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN
  ('_record_fund_payment_internal','record_fund_payment','refund_fund_payment'))
   OR (n.nspname='auth' AND p.proname='uid');

-- Inspect ALL user triggers on affected tables. Review called function chains,
-- webhooks/extensions and external consumers separately before any write test.
-- ROLLBACK does not undo externally delivered effects or sequence increments.
SELECT t.tgrelid::regclass AS relation, t.tgname,
       pg_get_triggerdef(t.oid) AS trigger_definition,
       pg_get_functiondef(t.tgfoid) AS trigger_function
FROM pg_trigger t
WHERE NOT t.tgisinternal AND t.tgrelid IN
 ('public.fund_payments'::regclass,'public.fund_transactions'::regclass,
  'public.fund_contributions'::regclass,'public.audit_logs'::regclass);

-- 2. Existing payment/refund detail for a selected contribution.
SELECT p.id AS payment_id, p.amount, p.paid_at, p.confirmed_by,
       o.id AS original_transaction_id, o.transaction_type,
       r.id AS refund_id, r.amount AS refunded_amount,
       r.payment_id AS refund_direct_payment_id, r.reversal_of_transaction_id
FROM public.fund_payments p
LEFT JOIN public.fund_transactions o ON o.payment_id=p.id
 AND o.transaction_type IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','THU_KHAC')
LEFT JOIN public.fund_transactions r ON r.reversal_of_transaction_id=o.id
 AND r.transaction_type='HOAN_TIEN'
WHERE p.contribution_id='<CONTRIBUTION_UUID>'::uuid
ORDER BY p.paid_at,p.id,o.id,r.id;

-- Compare FUND03E canonical attribution with the existing refund RPC fallback.
WITH amounts AS (
 SELECT c.id,c.amount_due,c.status,
  (SELECT coalesce(sum(p.amount),0) FROM public.fund_payments p WHERE p.contribution_id=c.id) AS gross_paid,
  (SELECT coalesce(sum(r.amount),0) FROM public.fund_transactions r
   JOIN public.fund_transactions o ON o.id=r.reversal_of_transaction_id
   JOIN public.fund_payments p ON p.id=o.payment_id
   WHERE r.transaction_type='HOAN_TIEN'
     AND o.transaction_type IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','THU_KHAC')
     AND p.contribution_id=c.id) AS refunded,
  (SELECT coalesce(sum(r.amount),0) FROM public.fund_transactions r
   LEFT JOIN public.fund_transactions o ON o.id=r.reversal_of_transaction_id
   JOIN public.fund_payments p ON p.id=coalesce(r.payment_id,o.payment_id)
   WHERE r.transaction_type='HOAN_TIEN' AND p.contribution_id=c.id) AS refund_rpc_refunded
 FROM public.fund_contributions c WHERE c.id='<CONTRIBUTION_UUID>'::uuid
)
SELECT *, greatest(gross_paid-refunded,0) AS net_paid,
 greatest(amount_due-greatest(gross_paid-refunded,0),0) AS remaining,
 refunded IS DISTINCT FROM refund_rpc_refunded AS attribution_mismatch
FROM amounts;

-- 3. GLOBAL DATA-INTEGRITY AUDIT: zero rows is expected for canonical refunds.
-- NULL refund.payment_id is normal, provided reversal -> original -> payment works.
SELECT r.id AS refund_id,r.amount,r.payment_id AS direct_payment_id,
 r.reversal_of_transaction_id,o.payment_id AS original_payment_id,
 p.contribution_id AS canonical_contribution_id,
 dp.contribution_id AS direct_contribution_id,
 concat_ws('; ',
  CASE WHEN r.reversal_of_transaction_id IS NULL THEN 'MISSING_REVERSAL_ID' END,
  CASE WHEN r.reversal_of_transaction_id IS NOT NULL AND o.id IS NULL THEN 'ORIGINAL_TRANSACTION_NOT_FOUND' END,
  CASE WHEN o.id IS NOT NULL AND (o.transaction_type IS NULL OR o.transaction_type NOT IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','THU_KHAC')) THEN 'ORIGINAL_NOT_PAYMENT_CASH_IN' END,
  CASE WHEN o.id IS NOT NULL AND p.id IS NULL THEN 'ORIGINAL_PAYMENT_MISSING' END,
  CASE WHEN p.id IS NOT NULL AND c.id IS NULL THEN 'CONTRIBUTION_MISSING' END,
  CASE WHEN r.payment_id IS NOT NULL AND r.payment_id IS DISTINCT FROM o.payment_id THEN 'DIRECT_PAYMENT_CONFLICT_OR_FALLBACK_ONLY' END,
  CASE WHEN r.amount IS NULL OR r.amount<=0 THEN 'INVALID_REFUND_AMOUNT' END
 ) AS issue
FROM public.fund_transactions r
LEFT JOIN public.fund_transactions o ON o.id=r.reversal_of_transaction_id
LEFT JOIN public.fund_payments p ON p.id=o.payment_id
LEFT JOIN public.fund_payments dp ON dp.id=r.payment_id
LEFT JOIN public.fund_contributions c ON c.id=p.contribution_id
WHERE r.transaction_type='HOAN_TIEN' AND (
 r.reversal_of_transaction_id IS NULL OR o.id IS NULL OR p.id IS NULL OR c.id IS NULL
 OR o.transaction_type IS NULL OR o.transaction_type NOT IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','THU_KHAC')
 OR (r.payment_id IS NOT NULL AND r.payment_id IS DISTINCT FROM o.payment_id)
 OR r.amount IS NULL OR r.amount<=0)
ORDER BY r.id;

-- Missing/duplicate originals, cash-in mismatch and over-refund per payment.
WITH originals AS (
 SELECT p.id,p.contribution_id,p.amount,count(o.id) AS original_count,
        coalesce(sum(o.amount),0) AS cash_in
 FROM public.fund_payments p LEFT JOIN public.fund_transactions o ON o.payment_id=p.id
 AND o.transaction_type IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','THU_KHAC')
 GROUP BY p.id,p.contribution_id,p.amount
), refunds AS (
 SELECT o.payment_id,sum(r.amount) AS refunded
 FROM public.fund_transactions r JOIN public.fund_transactions o ON o.id=r.reversal_of_transaction_id
 WHERE r.transaction_type='HOAN_TIEN'
   AND o.transaction_type IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','THU_KHAC')
 GROUP BY o.payment_id
)
SELECT o.*,coalesce(r.refunded,0) AS refunded
FROM originals o LEFT JOIN refunds r ON r.payment_id=o.id
WHERE o.original_count<>1 OR o.cash_in IS DISTINCT FROM o.amount
   OR coalesce(r.refunded,0)>o.amount;
ROLLBACK;
