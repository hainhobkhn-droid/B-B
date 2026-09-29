-- FUND03E A-K functional verification. NEVER applies the migration.
-- Prefer a staging clone with outbound hooks disabled. DO NOT use real member debt.
-- On production, stop unless an owner designates TWO isolated disposable fixtures
-- and verifies that affected triggers/called functions have no external effects.
-- Each fixture: existing contribution, amount_due=100000, CHUA_DONG, no payments.
-- Replace <ADMIN_UUID>, <CONTRIBUTION_UUID> (A), <CONTRIBUTION_B_UUID> (B).
-- <PAYMENT_ID> is captured automatically from each RPC; do not paste a real payment.
-- Change reviewed_safe_fixture to true ONLY after reviewing those prerequisites.
-- Run ENTIRE script in ONE SQL Editor execution. Never remove final ROLLBACK.
-- On error: stop, issue ROLLBACK on the same connection; do not resume mid-script.
-- SQL Editor uses a privileged DB role: claims below simulate auth.uid(), NOT
-- signed JWT validation, API grants, RLS or a real authenticated client session.
-- If auth.uid() does not match the supplied actor, this script fails closed.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT set_config('fund03e.actor','<ADMIN_UUID>',true),
       set_config('fund03e.a','<CONTRIBUTION_UUID>',true),
       set_config('fund03e.b','<CONTRIBUTION_B_UUID>',true),
       set_config('fund03e.reviewed_safe_fixture','false',true);
SELECT set_config('request.jwt.claim.sub',current_setting('fund03e.actor'),true),
       set_config('request.jwt.claims',jsonb_build_object(
         'sub',current_setting('fund03e.actor'),'role','authenticated')::text,true);

-- All helpers live in pg_temp and are rolled back with the test.
CREATE FUNCTION pg_temp.fund03e_check(ok boolean,label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FUND03E FAIL: %',label; END IF;
END $$;

CREATE FUNCTION pg_temp.fund03e_state(cid uuid) RETURNS jsonb
LANGUAGE sql AS $$
 WITH payments AS (SELECT * FROM public.fund_payments WHERE contribution_id=cid),
 originals AS (SELECT t.* FROM public.fund_transactions t JOIN payments p ON p.id=t.payment_id
   WHERE t.transaction_type IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','THU_KHAC')),
 refunds AS (SELECT r.* FROM public.fund_transactions r JOIN originals o ON o.id=r.reversal_of_transaction_id
   WHERE r.transaction_type='HOAN_TIEN'),
 totals AS (SELECT (SELECT coalesce(sum(amount),0) FROM payments) g,
                  (SELECT coalesce(sum(amount),0) FROM refunds) r)
 SELECT jsonb_build_object('gross',g,'refund',r,'net',greatest(g-r,0),
 'remaining',greatest(c.amount_due-greatest(g-r,0),0),'status',c.status,
 'payment_count',(SELECT count(*) FROM payments),
 'transaction_count',(SELECT count(*) FROM public.fund_transactions t
     WHERE t.payment_id IN (SELECT id FROM payments)
        OR t.reversal_of_transaction_id IN (SELECT id FROM originals)),
 'audit_count',(SELECT count(*) FROM public.audit_logs
     WHERE new_data->>'contribution_id'=cid::text OR old_data->>'contribution_id'=cid::text),
 'ledger_net',(SELECT coalesce(sum(amount),0) FROM originals)-r)
 FROM public.fund_contributions c CROSS JOIN totals WHERE c.id=cid;
$$;

CREATE FUNCTION pg_temp.fund03e_expect(cid uuid,g numeric,r numeric,n numeric,rem numeric,st text,label text)
RETURNS void LANGUAGE plpgsql AS $$ DECLARE s jsonb; BEGIN
 s:=pg_temp.fund03e_state(cid);
 PERFORM pg_temp.fund03e_check(s @> jsonb_build_object('gross',g,'refund',r,'net',n,
   'remaining',rem,'status',st,'ledger_net',n),label);
 RAISE NOTICE '% PASS: %',label,s;
END $$;

CREATE FUNCTION pg_temp.fund03e_pay(cid uuid,p_amount numeric,before_paid numeric,after_paid numeric,rem numeric,st text)
RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE x jsonb; actor uuid:=auth.uid(); BEGIN
 x:=public.record_fund_payment(cid,p_amount,now(),'FUND03E rollback verification');
 PERFORM pg_temp.fund03e_check(x @> jsonb_build_object('success',true,'paid_before',before_paid,
   'paid_after',after_paid,'remaining',rem,'status',st),'payment response');
 PERFORM pg_temp.fund03e_check((SELECT count(*)=1 FROM public.audit_logs
   WHERE action='RECORD_FUND_PAYMENT' AND table_name='fund_payments'
     AND record_id=(x->>'payment_id')::uuid AND user_id=actor
     AND old_data @> jsonb_build_object('contribution_id',cid,'paid_before',before_paid)
     AND new_data @> jsonb_build_object('contribution_id',cid,'payment_id',x->>'payment_id',
       'transaction_id',x->>'transaction_id','paid_before',before_paid,'paid_after',after_paid,
       'remaining',rem,'new_status',st)),'J payment audit');
 PERFORM pg_temp.fund03e_check((SELECT count(*)=1 FROM public.fund_transactions
   WHERE id=(x->>'transaction_id')::uuid AND payment_id=(x->>'payment_id')::uuid
     AND created_by=actor AND transaction_type IN ('THU_QUY_THUA_TRAN','THU_QUY_HOA','THU_KHAC')
     AND fund_transactions.amount=p_amount AND reversal_of_transaction_id IS NULL),'K payment cash-in');
 RETURN x;
END $$;

CREATE FUNCTION pg_temp.fund03e_refund(pid uuid,p_amount numeric,net numeric,st text)
RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE x jsonb; actor uuid:=auth.uid(); cid uuid; BEGIN
 SELECT contribution_id INTO cid FROM public.fund_payments WHERE id=pid;
 x:=public.refund_fund_payment(pid,p_amount,'FUND03E rollback verification',now());
 PERFORM pg_temp.fund03e_check(x @> jsonb_build_object('ok',true,'net_paid',net,'status',st),'refund response');
 -- Existing refund audit uses net_paid/new_status, NOT paid_before/paid_after/remaining.
 PERFORM pg_temp.fund03e_check((SELECT count(*)=1 FROM public.audit_logs
   WHERE action='REFUND_FUND_PAYMENT' AND table_name='fund_transactions'
     AND record_id=(x->>'refund_transaction_id')::uuid AND user_id=actor
     AND old_data @> jsonb_build_object('contribution_id',cid,'payment_id',pid)
     AND new_data @> jsonb_build_object('contribution_id',cid,'payment_id',pid,
       'refund_transaction_id',x->>'refund_transaction_id','net_paid',net,'new_status',st)),'J refund audit');
 PERFORM pg_temp.fund03e_check((SELECT count(*)=1 FROM public.fund_transactions
   WHERE id=(x->>'refund_transaction_id')::uuid AND transaction_type='HOAN_TIEN'
     AND created_by=actor AND fund_transactions.amount=p_amount AND payment_id IS NULL
     AND reversal_of_transaction_id=(x->>'original_transaction_id')::uuid),'K refund cash-out');
 RETURN x;
END $$;

DO $$
DECLARE
 a uuid:=current_setting('fund03e.a')::uuid;
 b uuid:=current_setting('fund03e.b')::uuid;
 actor uuid:=current_setting('fund03e.actor')::uuid;
 p1 jsonb; p2 jsonb; p3 jsonb; before_e jsonb; isolated_b jsonb;
 blocked boolean:=false; msg text;
BEGIN
 PERFORM pg_temp.fund03e_check(current_setting('fund03e.reviewed_safe_fixture')='true','review fixture and external hooks first');
 PERFORM pg_temp.fund03e_check(a<>b,'two distinct fixtures');
 PERFORM pg_temp.fund03e_check(auth.uid()=actor,'simulated auth.uid');
 PERFORM pg_temp.fund03e_check(EXISTS(SELECT 1 FROM public.profiles
   WHERE id=actor AND role='ADMIN' AND is_active IS TRUE),'active ADMIN fixture');
 -- Fail promptly instead of contending with real activity. Locks persist to ROLLBACK.
 PERFORM id FROM public.fund_contributions WHERE id IN (a,b) ORDER BY id FOR UPDATE NOWAIT;
 PERFORM pg_temp.fund03e_check((SELECT count(*)=2 FROM public.fund_contributions
   WHERE id IN (a,b) AND amount_due=100000 AND status='CHUA_DONG'),'pristine 100k fixtures');
 PERFORM pg_temp.fund03e_check(NOT EXISTS(SELECT 1 FROM public.fund_payments
   WHERE contribution_id IN (a,b)),'no existing payments');

 PERFORM pg_temp.fund03e_expect(a,0,0,0,100000,'CHUA_DONG','A initial');
 PERFORM pg_temp.fund03e_expect(b,0,0,0,100000,'CHUA_DONG','I B initial');
 isolated_b:=pg_temp.fund03e_state(b);
 p1:=pg_temp.fund03e_pay(a,100000,0,100000,0,'DA_DONG');
 PERFORM pg_temp.fund03e_expect(a,100000,0,100000,0,'DA_DONG','B full payment');
 PERFORM pg_temp.fund03e_refund((p1->>'payment_id')::uuid,40000,60000,'DONG_MOT_PHAN');
 PERFORM pg_temp.fund03e_expect(a,100000,40000,60000,40000,'DONG_MOT_PHAN','C refund40k');
 p2:=pg_temp.fund03e_pay(a,40000,60000,100000,0,'DA_DONG');
 PERFORM pg_temp.fund03e_expect(a,140000,40000,100000,0,'DA_DONG','D recollect40k');

 before_e:=pg_temp.fund03e_state(a);
 BEGIN
   PERFORM public.record_fund_payment(a,1,now(),'FUND03E must block');
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
   IF SQLSTATE<>'P0001' OR position('Contribution đã thanh toán đủ' in msg)=0 THEN RAISE; END IF;
   blocked:=true;
 END;
 PERFORM pg_temp.fund03e_check(blocked,'E fully paid blocked by debt check');
 PERFORM pg_temp.fund03e_check(before_e=pg_temp.fund03e_state(a),'E no new payment/transaction/audit');
 RAISE NOTICE 'E PASS: blocked; payment/transaction/audit counts unchanged';
 PERFORM pg_temp.fund03e_check(isolated_b=pg_temp.fund03e_state(b),'I A activity leaves B unchanged');
 PERFORM pg_temp.fund03e_pay(b,30000,0,30000,70000,'DONG_MOT_PHAN');
 PERFORM pg_temp.fund03e_expect(b,30000,0,30000,70000,'DONG_MOT_PHAN','F partial payment');
 isolated_b:=pg_temp.fund03e_state(b);

 -- Fully refund both A payments: p1 still has 60k refundable; p2 has 40k.
 PERFORM pg_temp.fund03e_refund((p1->>'payment_id')::uuid,60000,40000,'DONG_MOT_PHAN');
 PERFORM pg_temp.fund03e_refund((p2->>'payment_id')::uuid,40000,0,'CHUA_DONG');
 PERFORM pg_temp.fund03e_expect(a,140000,140000,0,100000,'CHUA_DONG','G full refund');
 p3:=pg_temp.fund03e_pay(a,100000,0,100000,0,'DA_DONG');
 PERFORM pg_temp.fund03e_expect(a,240000,140000,100000,0,'DA_DONG','G full recollect');
 PERFORM pg_temp.fund03e_refund((p3->>'payment_id')::uuid,10000,90000,'DONG_MOT_PHAN');
 PERFORM pg_temp.fund03e_refund((p3->>'payment_id')::uuid,30000,60000,'DONG_MOT_PHAN');
 PERFORM pg_temp.fund03e_expect(a,240000,180000,60000,40000,'DONG_MOT_PHAN','H multiple refunds');
 PERFORM pg_temp.fund03e_pay(a,40000,60000,100000,0,'DA_DONG');
 PERFORM pg_temp.fund03e_expect(a,280000,180000,100000,0,'DA_DONG','H recollect');
 PERFORM pg_temp.fund03e_check(isolated_b=pg_temp.fund03e_state(b),'I refunds of A leave partially-paid B unchanged');
 PERFORM pg_temp.fund03e_check((SELECT count(*)=10 FROM public.audit_logs
   WHERE user_id=actor AND new_data->>'contribution_id' IN (a::text,b::text)
     AND action IN ('RECORD_FUND_PAYMENT','REFUND_FUND_PAYMENT')
     AND (record_id IN (SELECT id FROM public.fund_payments WHERE contribution_id IN(a,b))
       OR record_id IN (SELECT r.id FROM public.fund_transactions r
          JOIN public.fund_transactions o ON o.id=r.reversal_of_transaction_id
          JOIN public.fund_payments p ON p.id=o.payment_id WHERE p.contribution_id IN(a,b)))),'J 5 payment + 5 refund audits');
 RAISE NOTICE 'A-K FUNCTIONAL PASS; this is not signed-JWT/RLS/API security certification';
END $$;

SELECT 'A final before rollback' AS checkpoint,pg_temp.fund03e_state(current_setting('fund03e.a')::uuid) AS state
UNION ALL SELECT 'B final before rollback',pg_temp.fund03e_state(current_setting('fund03e.b')::uuid);
-- Every test write, helper and local claim setting is discarded.
ROLLBACK;
-- Read-only receipt after rollback: expect TWO rows, CHUA_DONG, payment_count=0.
SELECT c.id,c.amount_due,c.status,
 (SELECT count(*) FROM public.fund_payments p WHERE p.contribution_id=c.id) AS payment_count
FROM public.fund_contributions c
WHERE c.id IN ('<CONTRIBUTION_UUID>'::uuid,'<CONTRIBUTION_B_UUID>'::uuid)
ORDER BY c.id;
