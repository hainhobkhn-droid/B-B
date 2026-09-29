-- FUND04 local-only regression suite. Run with fund04-local-test.py.
-- Requires disposable minimal fixture, never production. All cases roll back.
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'fund04_local_%'
     OR current_setting('fund04.local_fixture', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'LOCAL_DISPOSABLE_FIXTURE_REQUIRED';
  END IF;
END $$;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'PASS: %', label; END $$;
CREATE FUNCTION pg_temp.actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claim.sub',lpad(n::text,32,'0')::uuid::text,true)::text IS NOT NULL;
$$;
CREATE FUNCTION pg_temp.fixture(n integer, amounts numeric[]) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE pid uuid := lpad((1000+n)::text,32,'0')::uuid; i integer;
BEGIN
 INSERT INTO players(id) VALUES(pid);
 FOR i IN 1..array_length(amounts,1) LOOP
   INSERT INTO fund_contributions(id,player_id,campaign_id,amount_due,status,reason,due_date,created_at)
   VALUES(lpad((n*100+i)::text,32,'0')::uuid,pid,'00000000-0000-0000-0000-000000000050',amounts[i],
     'CHUA_DONG','QUY_THANG',date '2026-01-01'+i, timestamptz '2026-01-01 00:00:00+07'+i*interval '1 minute');
 END LOOP;
 RETURN pid;
END $$;
CREATE FUNCTION pg_temp.blocked(pid uuid, amount numeric, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_counts text; after_counts text; caught boolean := false;
BEGIN
 SELECT concat((SELECT count(*) FROM fund_payments),':',(SELECT count(*) FROM fund_transactions),':',(SELECT count(*) FROM audit_logs)) INTO before_counts;
 BEGIN
   PERFORM record_member_fund_payment(pid,amount);
 EXCEPTION WHEN OTHERS THEN
   IF position(expected IN SQLERRM)=0 THEN RAISE; END IF;
   caught := true;
 END;
 SELECT concat((SELECT count(*) FROM fund_payments),':',(SELECT count(*) FROM fund_transactions),':',(SELECT count(*) FROM audit_logs)) INTO after_counts;
 PERFORM pg_temp.assert_true(caught AND before_counts=after_counts, expected || ' / no writes');
END $$;
DO $$
DECLARE pid uuid; r jsonb; p jsonb; cid uuid; n integer; arr jsonb;
BEGIN
 PERFORM pg_temp.actor(1);
 pid:=pg_temp.fixture(1,ARRAY[100]); r:=record_member_fund_payment(pid,100);
 PERFORM pg_temp.assert_true(r->>'total_outstanding_after'='0' AND r->>'allocation_count'='1','single full / ADMIN');
 PERFORM pg_temp.blocked(pid,1,'BATCH_NO_OUTSTANDING');
 pid:=pg_temp.fixture(2,ARRAY[100,200,300]);
 r:=record_member_fund_payment(pid,350); arr:=r->'allocations';
 PERFORM pg_temp.assert_true(r->>'total_outstanding_before'='600' AND r->>'total_outstanding_after'='250'
   AND arr->0->>'allocated_amount'='100' AND arr->1->>'allocated_amount'='200' AND arr->2->>'allocated_amount'='50'
   AND arr->2->>'status'='DONG_MOT_PHAN','oldest-first + last partial');
 PERFORM pg_temp.assert_true(arr->0->>'contribution_id'=lpad('201',32,'0')::uuid::text,'first obligation id');
 r:=record_member_fund_payment(pid,250);
 PERFORM pg_temp.assert_true(r->>'total_outstanding_after'='0','exact remaining clears all');
 pid:=pg_temp.fixture(3,ARRAY[100,100]);
 PERFORM pg_temp.blocked(pid,201,'BATCH_OVERPAYMENT');
 PERFORM pg_temp.blocked(pid,0,'BATCH_AMOUNT_MUST_BE_FINITE_POSITIVE');
 PERFORM pg_temp.blocked(pid,-1,'BATCH_AMOUNT_MUST_BE_FINITE_POSITIVE');
 PERFORM pg_temp.blocked(pid,NULL,'BATCH_AMOUNT_MUST_BE_FINITE_POSITIVE');
 PERFORM pg_temp.blocked(pid,'NaN'::numeric,'BATCH_AMOUNT_MUST_BE_FINITE_POSITIVE');
 PERFORM pg_temp.blocked(pid,'Infinity'::numeric,'BATCH_AMOUNT_MUST_BE_FINITE_POSITIVE');
 PERFORM pg_temp.blocked(NULL,1,'BATCH_PLAYER_NOT_FOUND');
 PERFORM pg_temp.blocked(gen_random_uuid(),1,'BATCH_PLAYER_NOT_FOUND');
 pid:=pg_temp.fixture(4,ARRAY[100,100]); cid:=lpad('401',32,'0')::uuid;
 p:=record_fund_payment(cid,100);
 PERFORM refund_fund_payment((p->>'payment_id')::uuid,10,'local refund 1');
 PERFORM refund_fund_payment((p->>'payment_id')::uuid,30,'local refund 2');
 r:=record_member_fund_payment(pid,90); arr:=r->'allocations';
 PERFORM pg_temp.assert_true(arr->0->>'paid_before'='60' AND arr->0->>'paid_after'='100'
   AND arr->0->>'allocated_amount'='40' AND arr->1->>'allocated_amount'='50','refund-aware + mixed obligations + multiple refunds');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM audit_logs WHERE action='RECORD_FUND_PAYMENT'
   AND record_id IN (SELECT (value->>'payment_id')::uuid FROM jsonb_array_elements(arr))), 'per-payment audit');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM audit_logs WHERE action='RECORD_MEMBER_FUND_PAYMENT'
   AND table_name='players' AND record_id=pid
   AND new_data->>'batch_id'=r->>'batch_id'
   AND user_id=lpad('1',32,'0')::uuid
   AND new_data->>'actor'=lpad('1',32,'0')::uuid::text
   AND new_data->'allocations'=arr AND new_data->>'requested_amount'='90'
   AND new_data ? 'recorded_at'), 'batch audit / actor / allocations / amount / timestamp');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM fund_transactions WHERE payment_id IN
   (SELECT (value->>'payment_id')::uuid FROM jsonb_array_elements(arr))), 'separate ledger rows');
 -- Refund each allocation remains supported.
 PERFORM refund_fund_payment((arr->1->>'payment_id')::uuid,50,'full refund allocated payment');
 r:=record_member_fund_payment(pid,100);
 PERFORM pg_temp.assert_true(r->'allocations'->0->>'paid_before'='0' AND r->>'total_outstanding_after'='0','full refund then batch');
 -- Force second allocation to fail after the first engine call succeeds.
 pid:=pg_temp.fixture(5,ARRAY[100,100]);
 UPDATE fund_contributions SET reason='UNSUPPORTED_LOCAL_TEST' WHERE id=lpad('502',32,'0')::uuid;
 PERFORM pg_temp.blocked(pid,150,'chưa được Payment Engine V2 hỗ trợ');
 PERFORM pg_temp.assert_true((SELECT bool_and(status='CHUA_DONG') FROM fund_contributions WHERE player_id=pid),'atomic status rollback');
 pid:=pg_temp.fixture(6,ARRAY[100]);
 PERFORM pg_temp.actor(2); r:=record_member_fund_payment(pid,10);
 PERFORM pg_temp.assert_true(r->>'requested_amount'='10','collector allowed');
 FOR n IN 3..5 LOOP
   PERFORM pg_temp.actor(n); PERFORM pg_temp.blocked(pid,1,'FUND_COLLECTION_PERMISSION_REQUIRED');
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM pg_temp.blocked(pid,1,'FUND_COLLECTION_PERMISSION_REQUIRED');
 PERFORM pg_temp.actor(1);
 -- Same date/created_at must use contribution id, regardless of insertion order.
 pid:=pg_temp.fixture(7,ARRAY[100,100,100]);
 UPDATE fund_contributions SET due_date='2026-01-01',created_at='2026-01-01 00:00:00+07' WHERE player_id=pid;
 r:=record_member_fund_payment(pid,200);
 PERFORM pg_temp.assert_true(r->'allocations'->0->>'contribution_id'=lpad('701',32,'0')::uuid::text
   AND r->'allocations'->1->>'contribution_id'=lpad('702',32,'0')::uuid::text,'deterministic id tie-break');
 -- Excluded obligations are not collected.
 pid:=pg_temp.fixture(8,ARRAY[100,100]);
 UPDATE fund_contributions SET status='MIEN' WHERE id=lpad('801',32,'0')::uuid;
 r:=record_member_fund_payment(pid,100);
 PERFORM pg_temp.assert_true(r->'allocations'->0->>'contribution_id'=lpad('802',32,'0')::uuid::text,'waived excluded');
 PERFORM pg_temp.assert_true(NOT has_function_privilege('anon','record_member_fund_payment(uuid,numeric,timestamptz,text)','EXECUTE')
   AND has_function_privilege('authenticated','record_member_fund_payment(uuid,numeric,timestamptz,text)','EXECUTE')
   AND NOT has_function_privilege('authenticated','_record_fund_payment_internal(uuid,numeric,timestamptz,text,uuid)','EXECUTE'),'RPC grants / internal private');
END $$;
ROLLBACK;
