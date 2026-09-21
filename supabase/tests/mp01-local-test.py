"""MP01 integration verification on a NEW disposable localhost PostgreSQL database.
Never accepts a production host/URL. All test fixtures and migration roll back.
Usage: python mp01-local-test.py --schema-export DIRECTORY [--migration FILE]
"""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--schema-export', type=Path, required=True)
default_migration = Path(__file__).with_name('202609210001_mp01_member_fund_readonly.sql')
if not default_migration.exists():
    default_migration = Path(__file__).resolve().parent.parent/'migrations'/'202609210001_mp01_member_fund_readonly.sql'
parser.add_argument('--migration', type=Path, default=default_migration)
parser.add_argument('--legacy-migration', type=Path, default=default_migration.with_name('202609210002_mp01_harden_legacy_fund_rpc.sql'))
parser.add_argument('--output-dir', type=Path, default=Path.cwd()/'outputs')
parser.add_argument('--psql', default=r'C:\Program Files\PostgreSQL\17\bin\psql.exe')
args = parser.parse_args()
out = args.output_dir.resolve()
out.mkdir(parents=True,exist_ok=True)
db = 'mp01_test_' + str(time.time_ns())
env = dict(os.environ, PGCLIENTENCODING='UTF8', PGCONNECT_TIMEOUT='5')

def run(sql, database=db):
    p = subprocess.run([args.psql, '-X','-h','127.0.0.1','-p','55432','-U','postgres',
                        '-d',database,'-At','-v','ON_ERROR_STOP=1'],input=sql,
                       encoding='utf8',capture_output=True,env=env,timeout=60)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return p.stdout

def rows(name):
    with (args.schema_export/name).open(encoding='utf-8-sig',newline='') as f:
        return list(csv.DictReader(f))

def uid(n):
    return f'00000000-0000-0000-0000-{n:012d}'

run(f'CREATE DATABASE {db}', 'postgres')
columns = {}
for name in ['01_tables_columns.csv','01C_columns_group1.csv..csv','01D_columns_group2.csv','01E_columns_group3.csv']:
    for c in rows(name):
        columns[c['table_name'],int(c['ordinal_position'])] = c
schema = ["CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);",
          "CREATE EXTENSION btree_gist;",
          "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;",
          "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
          'GRANT USAGE ON SCHEMA auth TO anon,authenticated;']
for table in sorted({t for t,_ in columns}):
    defs = []
    for (t,_),c in sorted(columns.items()):
        if t != table:
            continue
        d = f'"{c["column_name"]}" {c["data_type"]}'
        if c['is_nullable']=='NO': d += ' NOT NULL'
        if c['column_default'] and c['column_default']!='null': d += ' DEFAULT '+c['column_default']
        defs.append(d)
    schema.append(f'CREATE TABLE public."{table}"('+','.join(defs)+');')
constraints = {}
for name in ['05_constraints.csv','05B_constraints_core.csv','05C_constraints_fund_tournament.csv']:
    for c in rows(name): constraints[c['constraint_name']] = c
for c in sorted(constraints.values(),key=lambda c:c['constraint_type']=='f'):
    schema.append(f'ALTER TABLE public."{c["table_name"]}" ADD CONSTRAINT "{c["constraint_name"]}" {c["definition"]};')
# Reproduce inspected admin-only fund RLS. SELECT grant remains ineffective for MEMBER.
schema.append("""CREATE FUNCTION public.current_user_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND role='ADMIN' AND is_active) $$;""")
for t in ['fund_contributions','fund_payments','fund_transactions']:
    schema += [f'ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;',
               f'GRANT SELECT ON public.{t} TO authenticated;',
               f'CREATE POLICY {t}_admin_select ON public.{t} FOR SELECT TO authenticated USING(public.current_user_is_admin());']
run('\n'.join(schema))
migration = args.migration.read_text(encoding='utf8')
legacy_migration = args.legacy_migration.read_text(encoding='utf8')
security_snapshot = "SELECT md5(string_agg(c.relname||coalesce(c.relacl::text,'')||c.relrowsecurity::text||coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname)::text FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),''),',' ORDER BY c.relname)) FROM pg_class c WHERE c.oid IN ('public.fund_contributions'::regclass,'public.fund_payments'::regclass,'public.fund_transactions'::regclass)"
sql = ["DO $$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database() NOT LIKE 'mp01_test_%' THEN RAISE EXCEPTION 'LOCAL_MP01_TEST_DATABASE_REQUIRED'; END IF; END $$;",
       'BEGIN;', 'CREATE TEMP TABLE before_security AS '+security_snapshot+';', migration,
       legacy_migration, legacy_migration,  # Verify safe re-application of hardening.
       "CREATE FUNCTION pg_temp.check_test(label text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'PASS: %',label; END $$;"]
checks = []
def check(label, expression):
    checks.append(label)
    sql.append(f"SELECT pg_temp.check_test('{label}',({expression}));")
def actor(n, role='authenticated'):
    sql.append(f"RESET ROLE; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid(n) if n else ''}',true);")
def denial(label, statement):
    checks.append(label)
    sql.append(f"""DO $$ BEGIN BEGIN {statement}; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: {label}'; RETURN; END; RAISE EXCEPTION 'FAIL: {label}'; END $$;""")

names = ['get_my_fund_obligations','get_my_fund_payment_history','get_club_fund_summary','get_member_fund_transactions']
for name in names:
    check(name+'_anon_execute_false', f"NOT has_function_privilege('anon','public.{name}()','EXECUTE')")
    check(name+'_authenticated_execute_true', f"has_function_privilege('authenticated','public.{name}()','EXECUTE')")
    check(name+'_public_execute_false', f"NOT EXISTS(SELECT FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.{name}()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')")
    check(name+'_fixed_search_path', f"SELECT p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=public, pg_temp'] FROM pg_proc p WHERE p.oid='public.{name}()'::regprocedure")

for n in range(1,7):
    sql.append(f"INSERT INTO auth.users VALUES('{uid(n)}'); INSERT INTO public.players(id,full_name) VALUES('{uid(100+n)}','Synthetic MP01 {n}');")
    if n != 5:
        player = 'NULL' if n==4 else f"'{uid(100+n)}'"
        sql.append(f"INSERT INTO public.profiles(id,role,is_active,player_id) VALUES('{uid(n)}','{'ADMIN' if n==6 else 'MEMBER'}',{str(n!=3).lower()},{player});")

actor(1)
check('empty_obligations', 'SELECT count(*)=0 FROM public.get_my_fund_obligations()')
check('empty_history', 'SELECT count(*)=0 FROM public.get_my_fund_payment_history()')
check('empty_summary_zero', "public.get_club_fund_summary() = '{\"total_in\":0,\"total_out\":0,\"balance\":0,\"adjustment_count\":0,\"adjustment_amount\":0,\"total_due\":0,\"total_paid\":0,\"total_outstanding\":0,\"total_credit\":0}'::jsonb")
sql.append('RESET ROLE;')
sql.append(f"INSERT INTO public.matches(id,played_at,match_type,score_mode,team_a_score,team_b_score,status) VALUES('{uid(500)}',now(),'CLUB_RATED','POINTS',11,7,'VOIDED');")
# A: partial 100; voided 80; waived 30; legacy paid 20; unpaid 50; credit 10/20.
# B: fully paid 200. All amounts synthetic.
for i,player,due,status,match in [(201,101,100,'DONG_MOT_PHAN',None),(202,102,200,'DA_DONG',None),(203,101,80,'DIEU_CHINH',500),(204,101,30,'MIEN',None),(205,101,20,'DA_DONG',None),(206,101,50,'CHUA_DONG',None),(207,101,10,'DA_DONG',None)]:
    mid = f"'{uid(match)}'" if match else 'NULL'
    sql.append(f"INSERT INTO public.fund_contributions(id,player_id,amount_due,status,reason,match_id) VALUES('{uid(i)}','{uid(player)}',{due},'{status}','THUA',{mid});")
for i,c,player,amount in [(301,201,101,30),(302,201,101,30),(303,202,102,200),(304,203,101,80),(305,205,101,20),(306,207,101,20)]:
    sql.append(f"INSERT INTO public.fund_payments(id,contribution_id,player_id,amount,note) VALUES('{uid(i)}','{uid(c)}','{uid(player)}',{amount},'STAFF PRIVATE NOTE');")
for i,player,amount,kind,payment,reversal in [(401,101,30,'THU_QUY_THUA_TRAN',301,None),(402,101,30,'THU_QUY_THUA_TRAN',302,None),(403,102,200,'THU_QUY_THUA_TRAN',303,None),(404,101,80,'THU_QUY_THUA_TRAN',304,None),(405,101,80,'HOAN_TIEN',None,404),(406,101,7,'DIEU_CHINH',None,None),(407,None,100,'UNG_HO',None,None),(408,None,25,'CHI_TIEU',None,None),(409,101,20,'THU_QUY_THUA_TRAN',306,None)]:
    lit = lambda n: f"'{uid(n)}'" if n else 'NULL'
    sql.append(f"INSERT INTO public.fund_transactions(id,player_id,amount,transaction_type,payment_id,reversal_of_transaction_id,description) VALUES('{uid(i)}',{lit(player)},{amount},'{kind}',{lit(payment)},{lit(reversal)},'STAFF PRIVATE DESCRIPTION');")

fingerprint = "SELECT md5((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id)::text FROM public.fund_contributions x)||(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id)::text FROM public.fund_payments x)||(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id)::text FROM public.fund_transactions x))"
sql.append('CREATE TEMP TABLE before_data AS '+fingerprint+';')
actor(1)
check('member_A_own_obligations', 'SELECT count(*)=6 FROM public.get_my_fund_obligations()')
check('member_A_excludes_B_obligations', f"NOT EXISTS(SELECT FROM public.get_my_fund_obligations() WHERE contribution_id='{uid(202)}')")
check('partial_payments_not_duplicated', f"SELECT payment_total=60 AND amount_paid=60 AND amount_remaining=40 FROM public.get_my_fund_obligations() WHERE contribution_id='{uid(201)}'")
check('void_refund_obligation', f"SELECT payment_total=80 AND refund_total=80 AND amount_paid=0 AND amount_remaining=0 AND NOT is_collectible FROM public.get_my_fund_obligations() WHERE contribution_id='{uid(203)}'")
check('waived_not_collectible', f"SELECT collectible_amount=0 AND amount_remaining=0 AND NOT is_collectible FROM public.get_my_fund_obligations() WHERE contribution_id='{uid(204)}'")
check('member_A_history_only_A', f"SELECT count(*)=7 AND count(DISTINCT event_id)=7 AND count(*) FILTER(WHERE event_id IN ('{uid(403)}','{uid(407)}','{uid(408)}'))=0 FROM public.get_my_fund_payment_history()")
check('refund_links_own_original_payment', f"SELECT cash_delta=-80 AND payment_id='{uid(304)}' AND contribution_id='{uid(203)}' AND reversal_of_transaction_id='{uid(404)}' FROM public.get_my_fund_payment_history() WHERE event_id='{uid(405)}'")
check('adjustment_has_unknown_cash_direction', f"SELECT cash_delta IS NULL AND amount=7 FROM public.get_my_fund_payment_history() WHERE event_id='{uid(406)}'")
check('legacy_payment_not_invented_cash', f"SELECT event_source='PAYMENT_WITHOUT_LEDGER' AND cash_delta IS NULL AND amount=20 FROM public.get_my_fund_payment_history() WHERE event_id='{uid(305)}'")
check('history_no_private_notes', "SELECT coalesce(jsonb_agg(to_jsonb(h))::text,'') NOT LIKE '%STAFF PRIVATE%' FROM public.get_my_fund_payment_history() h")
check('legacy_A_only_own_ledger', f"SELECT count(*)=6 AND bool_and(id IN ('{uid(401)}','{uid(402)}','{uid(404)}','{uid(405)}','{uid(406)}','{uid(409)}')) FROM public.get_member_fund_transactions()")
check('legacy_member_description_redacted', "SELECT bool_and(description NOT LIKE '%STAFF PRIVATE%') FROM public.get_member_fund_transactions()")
check('legacy_contract_unchanged', "SELECT pg_get_function_result('public.get_member_fund_transactions()'::regprocedure)='TABLE(id uuid, transaction_date timestamp with time zone, transaction_type text, amount numeric, description text, match_id uuid)'")
expected = {'total_in':460,'total_out':105,'balance':355,'adjustment_count':1,'adjustment_amount':7,'total_due':380,'total_paid':300,'total_outstanding':90,'total_credit':10}
check('club_aggregate_reversal_adjustment_and_credit', f"public.get_club_fund_summary()='{json.dumps(expected)}'::jsonb")
for t in ['fund_contributions','fund_payments','fund_transactions']:
    check(t+'_raw_rls_still_blocks_member', f'SELECT count(*)=0 FROM public.{t}')
    denial(t+'_member_cannot_update', f'UPDATE public.{t} SET id=id')
actor(2)
check('member_B_only_B', f"SELECT count(*)=1 AND bool_and(contribution_id='{uid(202)}') FROM public.get_my_fund_obligations()")
check('member_B_history_only_B', f"SELECT count(*)=1 AND bool_and(event_id='{uid(403)}') FROM public.get_my_fund_payment_history()")
check('legacy_B_only_own_ledger', f"SELECT count(*)=1 AND bool_and(id='{uid(403)}') FROM public.get_member_fund_transactions()")
actor(6)
check('admin_personal_scope_not_all_members', 'SELECT count(*)=0 FROM public.get_my_fund_obligations()')
check('admin_summary', f"public.get_club_fund_summary()='{json.dumps(expected)}'::jsonb")
check('legacy_admin_all_ledger_and_descriptions', "SELECT count(*)=9 AND bool_and(description='STAFF PRIVATE DESCRIPTION') FROM public.get_member_fund_transactions()")
check('admin_raw_workflow_unchanged', 'SELECT count(*)=9 FROM public.fund_transactions')
for n,label in [(0,'no_auth'),(3,'inactive'),(5,'missing_profile')]:
    actor(n)
    for name in names: denial(label+'_'+name, f'PERFORM public.{name}()')
actor(4)
for name in names[:2]: denial('unlinked_'+name, f'PERFORM public.{name}()')
denial('unlinked_legacy', 'PERFORM public.get_member_fund_transactions()')
actor(1,'anon')
for name in names: denial('anon_call_'+name, f'PERFORM public.{name}()')
sql.append('RESET ROLE;')
check('rpc_reads_did_not_mutate_fixture', f'({fingerprint})=(SELECT md5 FROM before_data)')
check('fund_table_grants_and_rls_unchanged', f'({security_snapshot})=(SELECT md5 FROM before_security)')
sql.append('ROLLBACK;')
script = '\n'.join(sql)
(out/'mp01-local-verification.sql').write_text(script,encoding='utf8')
result = {'database':db,'host':'127.0.0.1:55432','migration_sha256':hashlib.sha256(args.migration.read_bytes()).hexdigest(),'legacy_migration_sha256':hashlib.sha256(args.legacy_migration.read_bytes()).hexdigest(),'production_queries':'catalog SELECT only; fixtures exclusively local'}
try:
    run(script)
    empty_tables = ' AND '.join(f'(SELECT count(*) FROM {t})=0' for t in ['auth.users','public.profiles','public.players','public.matches','public.fund_contributions','public.fund_payments','public.fund_transactions'])
    assert run('SELECT '+empty_tables+" AND to_regprocedure('public.get_my_fund_obligations()') IS NULL AND to_regprocedure('public.get_my_fund_payment_history()') IS NULL AND to_regprocedure('public.get_club_fund_summary()') IS NULL AND to_regprocedure('public.get_member_fund_transactions()') IS NULL;").strip()=='t'
    result.update(status='PASS',checks={c:'PASS' for c in checks},rollback='PASS')
except Exception as e:
    result.update(status='FAIL',error=str(e))
    raise
finally:
    (out/'mp01-local-test-result.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf8')
print(json.dumps(result,indent=2))
