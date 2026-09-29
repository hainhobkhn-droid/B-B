"""IAM05D PostgreSQL integration test. Localhost-only disposable database.

Usage: python iam05d-local-test.py --schema-export DIR
The export supplies existing table shapes. Auth HTTP behavior is tested separately.
"""
import argparse
import csv
import json
import os
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--schema-export', type=Path, required=True)
parser.add_argument('--psql', default=r'C:\Program Files\PostgreSQL\17\bin\psql.exe')
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
db = 'iam05d_test_' + str(time.time_ns())
env = dict(os.environ, PGCLIENTENCODING='UTF8', PGCONNECT_TIMEOUT='5')
passed = []

def command(database=db):
    return [args.psql, '-X', '-w', '-h', '127.0.0.1', '-p', '55439', '-U', 'postgres',
            '-d', database, '-At', '-v', 'ON_ERROR_STOP=1']

def run(sql, database=db, fail=None):
    p = subprocess.run(command(database), input=sql, encoding='utf8', capture_output=True, env=env, timeout=40)
    if fail:
        assert p.returncode and fail in p.stderr, (fail, p.stdout, p.stderr)
    elif p.returncode:
        raise RuntimeError(p.stderr)
    return p.stdout.strip()

def uid(n): return f'00000000-0000-0000-0000-{n:012d}'
def lit(s): return "'" + s.replace("'", "''") + "'"
def rows(name):
    return list(csv.DictReader((args.schema_export/name).open(encoding='utf-8-sig')))
def as_actor(n, sql, role='authenticated'):
    return f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid(n) if n else ''}',true); {sql}; COMMIT;"
def check(name, expr):
    assert run('SELECT ('+expr+')::text;') == 'true', name
    passed.append(name)
def deny(name, n, sql, error, role='authenticated'):
    run(as_actor(n, sql, role), fail=error); passed.append(name)
def migration(name): return (repo/'supabase/migrations'/name).read_text(encoding='utf8')
def signup(n, user=None, app=None):
    data={'full_name':f'Test {n}', 'login_name':f'iam05d{n}', 'initial_rating':'4.250'}
    data.update(user or {})
    return f"INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES('{uid(n)}','test{n}@example.invalid',{lit(json.dumps(data))}::jsonb,{lit(json.dumps(app or {}))}::jsonb);"

created=False
try:
    run(f'CREATE DATABASE {db}', 'postgres'); created=True
    columns={}
    for file in ['01_tables_columns.csv','01C_columns_group1.csv..csv','01D_columns_group2.csv','01E_columns_group3.csv']:
        for c in rows(file): columns[c['table_name'],int(c['ordinal_position'])]=c
    sql=["CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb);",
         "CREATE EXTENSION btree_gist;",
         "DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I',r); END IF; END LOOP; END $$;",
         "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
         "GRANT USAGE ON SCHEMA auth TO authenticated,anon;"]
    for table in sorted({t for t,_ in columns}):
        defs=[]
        for (t,_),c in sorted(columns.items()):
            if t != table: continue
            d=f'"{c["column_name"]}" {c["data_type"]}'
            if c['is_nullable']=='NO': d+=' NOT NULL'
            if c['column_default'] and c['column_default']!='null': d+=' DEFAULT '+c['column_default']
            defs.append(d)
        sql.append(f'CREATE TABLE public."{table}"('+','.join(defs)+');')
    constraints={}
    for file in ['05_constraints.csv','05B_constraints_core.csv','05C_constraints_fund_tournament.csv']:
        for c in rows(file): constraints[c['constraint_name']]=c
    for c in sorted(constraints.values(),key=lambda c:c['constraint_type']=='f'):
        if c['table_name'] not in {t for t,_ in columns}: continue
        sql.append(f'ALTER TABLE public."{c["table_name"]}" ADD CONSTRAINT "{c["constraint_name"]}" {c["definition"]};')
    sql += ["CREATE TABLE public.fund_obligation_campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid());",
            "CREATE UNIQUE INDEX profiles_login_name_lower_uidx ON public.profiles(lower(login_name)) WHERE login_name IS NOT NULL;",
            "CREATE FUNCTION public.current_user_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT FROM public.profiles WHERE id=auth.uid() AND role='ADMIN' AND is_active) $$;"]
    for t in ['leagues','tournaments','fund_obligation_campaigns','tournament_registrations','tournament_payments',
              'rating_settings','fund_rules','rating_match_weights','players','matches','rating_events','fund_payments',
              'fund_transactions','match_players','fund_contributions']:
        if t not in {table for table,_ in columns} and t != 'fund_obligation_campaigns':
            sql.append(f'CREATE TABLE public.{t}(id uuid PRIMARY KEY DEFAULT gen_random_uuid());')
        sql += [f'ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;', f'GRANT SELECT ON public.{t} TO authenticated;',
                f'CREATE POLICY baseline_read ON public.{t} FOR SELECT TO authenticated USING(true);']
    # Minimal post-export shapes needed by the unchanged IAM05B preview.
    for table in ['tournament_expense_reversals','tournament_payment_refunds']:
        if table not in {t for t,_ in columns}:
            sql.append(f'CREATE TABLE public.{table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid());')
    for table, field in [('fund_obligation_campaigns','created_by'),('leagues','created_by'),
                         ('matches','opponent_confirmed_by'),('matches','opponent_rejected_by'),
                         ('tournament_expense_reversals','created_by'),('tournament_payment_refunds','created_by')]:
        sql.append(f'ALTER TABLE public.{table} ADD COLUMN IF NOT EXISTS {field} uuid;')
    sql += ["ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public.profiles TO authenticated; CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());"]
    run('\n'.join(sql))
    run(migration('202609250004_perm01a_member_permission_schema.sql'))
    for n,role,active in [(1,'ADMIN',True),(2,'MEMBER',True),(3,'MEMBER',False),(4,'ADMIN',False),(5,'MEMBER',True)]:
        run(f"INSERT INTO auth.users(id) VALUES('{uid(n)}'); INSERT INTO public.profiles(id,role,is_active) VALUES('{uid(n)}','{role}',{str(active).lower()});")
    run(f"UPDATE public.profiles SET can_manage_members=true WHERE id='{uid(5)}'; INSERT INTO public.rating_settings(id,is_active) VALUES(900,true);")
    run(migration('202609280002_iam05a_member_account_lifecycle.sql'))
    run(migration('202609280003_iam05b_member_deletion_preview.sql'))
    d1=migration('202609280004_iam05d1_signup_membership.sql')
    # Transactional dry run before applying to the disposable fixture.
    run(d1.replace('COMMIT;', 'ROLLBACK;'))
    check('dry-run rollback restores schema',"NOT EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='membership_status')")
    run(d1)
    run("CREATE TRIGGER on_auth_user_created_member_provision AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_member_signup();")
    d2=migration('202609280005_iam05d2_member_approval.sql')
    run(d2.replace('COMMIT;', 'ROLLBACK;'))
    check('approval RPC dry-run rollback', "to_regprocedure('public.admin_approve_member_signup(uuid)') IS NULL")
    run(d2)
    check('existing active approved',f"SELECT membership_status='APPROVED' AND is_active FROM public.profiles WHERE id='{uid(2)}'")
    check('existing inactive preserved',f"SELECT membership_status='APPROVED' AND NOT is_active FROM public.profiles WHERE id='{uid(3)}'")
    check('existing admin unchanged',f"SELECT membership_status='APPROVED' AND is_active FROM public.profiles WHERE id='{uid(1)}'")
    for n in [10,11,12,13,14,15]: run(signup(n))
    check('self signup pending inactive',f"SELECT membership_status='PENDING' AND NOT is_active FROM public.profiles WHERE id='{uid(10)}'")
    run(signup(16,{'membership_source':'ADMIN_CREATE_MEMBER','membership_created_by':uid(1),'membership_status':'APPROVED','is_active':True,'must_change_password':True}))
    check('untrusted metadata cannot approve',f"SELECT membership_status='PENDING' AND NOT is_active FROM public.profiles WHERE id='{uid(16)}'")
    run(signup(17,app={'membership_source':'ADMIN_CREATE_MEMBER','membership_created_by':uid(1)}))
    check('admin-created approved active',f"SELECT membership_status='APPROVED' AND is_active AND membership_reviewed_by='{uid(1)}' FROM public.profiles WHERE id='{uid(17)}'")
    for n,actor in [(18,4),(19,5),(20,999)]:
        run(signup(n,app={'membership_source':'ADMIN_CREATE_MEMBER','membership_created_by':uid(actor)}),fail='ADMIN_PROVISIONING_ACTOR_REQUIRED'); passed.append('invalid provisioning actor '+str(actor))
    before=run(f"SELECT row_to_json(p) FROM public.players p WHERE id=(SELECT player_id FROM public.profiles WHERE id='{uid(10)}');")
    for actor in [0,2,4,5]:
        deny('approval forbidden actor '+str(actor),actor,f"SELECT public.admin_approve_member_signup('{uid(10)}')",'AUTH_REQUIRED' if actor==0 else 'ADMIN_REQUIRED')
        deny('rejection forbidden actor '+str(actor),actor,f"SELECT public.admin_reject_member_signup('{uid(10)}','test')",'AUTH_REQUIRED' if actor==0 else 'ADMIN_REQUIRED')
        deny('pending list forbidden actor '+str(actor),actor,"SELECT * FROM public.get_admin_pending_member_signups()",'ADMIN_REQUIRED')
    deny('anon cannot approve',0,f"SELECT public.admin_approve_member_signup('{uid(10)}')",'permission denied','anon')
    deny('internal review not executable',1,f"SELECT public._review_member_signup('{uid(10)}','APPROVED',NULL)",'permission denied')
    deny('cannot target admin',1,f"SELECT public.admin_approve_member_signup('{uid(4)}')",'TARGET_MEMBER_REQUIRED')
    deny('cannot target self',1,f"SELECT public.admin_approve_member_signup('{uid(1)}')",'TARGET_MEMBER_REQUIRED')
    for reason in ['NULL',"''","'   '","repeat('x',1001)"]:
        deny('reject invalid reason '+reason,1,f"SELECT public.admin_reject_member_signup('{uid(11)}',{reason})",'REASON_REQUIRED_MAX_1000')
    run(as_actor(1,f"SELECT public.admin_approve_member_signup('{uid(10)}')"))
    check('approved active',f"SELECT membership_status='APPROVED' AND is_active FROM public.profiles WHERE id='{uid(10)}'")
    assert before==run(f"SELECT row_to_json(p) FROM public.players p WHERE id=(SELECT player_id FROM public.profiles WHERE id='{uid(10)}');")
    passed.append('approval preserves complete Player row and rating')
    run(as_actor(1,f"SELECT public.admin_reject_member_signup('{uid(11)}',' Test rejection ' )"))
    check('rejected inactive',f"SELECT membership_status='REJECTED' AND NOT is_active FROM public.profiles WHERE id='{uid(11)}'")
    for target in [10,11]:
        deny('nonpending approve '+str(target),1,f"SELECT public.admin_approve_member_signup('{uid(target)}')",'SIGNUP_NOT_PENDING')
        deny('nonpending reject '+str(target),1,f"SELECT public.admin_reject_member_signup('{uid(target)}','repeat')",'SIGNUP_NOT_PENDING')
    check('exactly one approval audit',f"SELECT count(*)=1 FROM public.audit_logs WHERE record_id='{uid(10)}' AND action='APPROVE_MEMBER_SIGNUP'")
    check('rejection audit actor reason old new',f"SELECT user_id='{uid(1)}' AND reason='Test rejection' AND old_data->>'membership_status'='PENDING' AND new_data->>'membership_status'='REJECTED' FROM public.audit_logs WHERE record_id='{uid(11)}' AND action='REJECT_MEMBER_SIGNUP'")
    for n in [11,12]:
        deny('cannot reactivate pending/rejected '+str(n),1,f"SELECT public.admin_set_member_account_active('{uid(n)}',true,'test')",'MEMBERSHIP_APPROVAL_REQUIRED')
        deny('direct nickname update blocked '+str(n),n,f"UPDATE public.profiles SET login_name='bypass' WHERE id='{uid(n)}'",'permission denied')
        deny('direct approval blocked '+str(n),n,f"UPDATE public.profiles SET membership_status='APPROVED',is_active=true WHERE id='{uid(n)}'",'permission denied')
        for table in ['players','rating_settings','tournaments','fund_rules']:
            result=run(as_actor(n,f"SELECT count(*) FROM public.{table}")); assert '\n0\n' in '\n'+result+'\n',result
            passed.append('RLS hides '+table+' from '+str(n))
        result=run(as_actor(n,'SELECT count(*) FROM public.get_player_directory()')); assert '\n0\n' in '\n'+result+'\n'
        passed.append('directory hides business data '+str(n))
        result=run(as_actor(n,'SELECT count(*) FROM public.profiles')); assert '\n1\n' in '\n'+result+'\n'
        passed.append('own status remains readable '+str(n))
    run(as_actor(1,f"SELECT public.admin_set_member_account_active('{uid(10)}',false,'test'); SELECT public.admin_set_member_account_active('{uid(10)}',true,'test')"))
    check('approved lifecycle still works',f"SELECT is_active AND membership_status='APPROVED' FROM public.profiles WHERE id='{uid(10)}'")
    run(f"UPDATE public.profiles SET is_active=true WHERE id='{uid(12)}';",fail='profiles_membership_active_check'); passed.append('DB invariant blocks activation bypass')
    # Hold target lock in first transaction; competing rejection must observe the committed decision.
    first=subprocess.Popen(command(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
    first.stdin.write(as_actor(1,f"SELECT public.admin_approve_member_signup('{uid(13)}'); SELECT pg_sleep(1)")); first.stdin.close()
    time.sleep(.2)
    run(as_actor(1,f"SELECT public.admin_reject_member_signup('{uid(13)}','competing decision')"),fail='SIGNUP_NOT_PENDING')
    first.wait(timeout=10); assert first.returncode==0,first.stderr.read()
    check('concurrent decisions create single audit',f"SELECT count(*)=1 FROM public.audit_logs WHERE record_id='{uid(13)}' AND action IN ('APPROVE_MEMBER_SIGNUP','REJECT_MEMBER_SIGNUP')")
    check('initial rating preserved',f"SELECT initial_rating=4.250 AND current_rating=4.250 AND status='ACTIVE' FROM public.players WHERE id=(SELECT player_id FROM public.profiles WHERE id='{uid(11)}')")
    for n in [10,11,12]:
        result=run(as_actor(1,f"SELECT public.get_admin_member_deletion_preview('{uid(n)}')"))
        preview=json.loads(next(line for line in result.splitlines() if line.startswith('{')))
        assert preview['hard_delete_allowed'] is False and preview['recommended_action']=='DEACTIVATE_ONLY'
        assert preview['player']['initial_rating']==4.25 and preview['player']['current_rating']==4.25
        passed.append('unchanged IAM05B preview works for membership '+str(n))
    run(f"INSERT INTO public.fund_obligation_campaigns(created_by) VALUES('{uid(14)}');")
    run(as_actor(1,f"SELECT public.admin_reject_member_signup('{uid(14)}','test preservation')"))
    check('rejection preserves existing business reference',f"SELECT count(*)=1 FROM public.fund_obligation_campaigns WHERE created_by='{uid(14)}'")
    result=run(as_actor(1,f"SELECT public.get_admin_member_deletion_preview('{uid(14)}')"))
    preview=json.loads(next(line for line in result.splitlines() if line.startswith('{')))
    assert preview['profile_references']['fund_obligation_campaigns_created']==1
    passed.append('IAM05B still counts business references after rejection')
    run("CREATE FUNCTION public.test_fail_approval_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='APPROVE_MEMBER_SIGNUP' THEN RAISE EXCEPTION 'TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_fail_approval_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.test_fail_approval_audit();")
    deny('audit failure aborts approval',1,f"SELECT public.admin_approve_member_signup('{uid(15)}')",'TEST_AUDIT_FAILURE')
    check('failed audit preserves pending inactive',f"SELECT membership_status='PENDING' AND NOT is_active AND membership_reviewed_at IS NULL FROM public.profiles WHERE id='{uid(15)}'")
    run("DROP TRIGGER test_fail_approval_audit ON public.audit_logs; DROP FUNCTION public.test_fail_approval_audit();")
    result=run(as_actor(1,"SELECT row_to_json(x) FROM public.get_admin_pending_member_signups(1,0) x"))
    item=json.loads(next(line for line in result.splitlines() if line.startswith('{')))
    assert item['membership_status']=='PENDING' and item['email'].endswith('@example.invalid')
    passed.append('ADMIN paginated pending directory returns review metadata')
    print(json.dumps({'status':'PASS','checks':len(passed),'details':passed},ensure_ascii=False,indent=2))
finally:
    if created: run(f'DROP DATABASE {db}', 'postgres')
