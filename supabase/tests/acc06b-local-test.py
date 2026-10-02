"""Disposable PostgreSQL fixture on localhost:55439, synthetic Auth/catalog only.
Requires postgres executable and existing anon/authenticated/service_role roles.
Never tests real Auth credentials or production.
"""
from pathlib import Path
import os, subprocess, time
repo=Path(__file__).resolve().parents[2]
psql=r'C:\Program Files\PostgreSQL\17\bin\psql.exe'
db='acc06b_test_'+str(time.time_ns())
env=dict(os.environ,PGCLIENTENCODING='UTF8',PGCONNECT_TIMEOUT='3')
def call(sql,database=None):
 return subprocess.run([psql,'-X','-w','-h','127.0.0.1','-p','55439','-U','postgres','-d',database or db,'-At','-v','ON_ERROR_STOP=1'],input=sql,encoding='utf8',capture_output=True,env=env,timeout=30)
def run(sql,database=None):
 p=call(sql,database);assert p.returncode==0,p.stderr;return p.stdout.strip()
def fail(sql,message):
 p=call(sql);assert p.returncode!=0 and message in p.stderr,(p.stdout,p.stderr)
a='00000000-0000-0000-0000-000000000001';b='00000000-0000-0000-0000-000000000002'
def context(role):return f"SET ROLE {role}; SELECT set_config('request.jwt.claim.role','{role}',false); "
created=False
try:
 run(f'CREATE DATABASE {db}','postgres');created=True
 run("CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$; GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; CREATE TABLE profiles(id uuid PRIMARY KEY,is_active boolean,must_change_password boolean,updated_at timestamptz); CREATE TABLE audit_logs(user_id uuid,action text,table_name text,record_id uuid,old_data jsonb,new_data jsonb,reason text,created_at timestamptz); CREATE FUNCTION complete_my_password_change() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE profiles SET must_change_password=false $$; GRANT EXECUTE ON FUNCTION complete_my_password_change() TO authenticated; GRANT SELECT,UPDATE ON profiles TO authenticated;")
 run(f"INSERT INTO profiles VALUES('{a}',true,true,now()),('{b}',false,true,now());")
 # Old FE model: Auth success followed by the legacy RPC. Auth itself is mocked.
 run(context('authenticated')+"SELECT complete_my_password_change();")
 assert run(f"SELECT must_change_password FROM profiles WHERE id='{a}'")=='f'
 run("UPDATE profiles SET must_change_password=true;")
 print('PASS matrix A: old FE + old DB legacy completion')
 run((repo/'supabase/migrations/202610020001_acc06b_forced_password_completion.sql').read_text(encoding='utf8'))
 run(context('authenticated')+"SELECT complete_my_password_change();")
 assert run(f"SELECT must_change_password FROM profiles WHERE id='{a}'")=='f'
 run("UPDATE profiles SET must_change_password=true;")
 assert run("SELECT count(*) FROM pg_trigger WHERE tgname='acc06b_guard_forced_password_completion'")=='0'
 print('PASS matrix B: old FE + Phase A works; guard absent')
 def readiness(extra=''):
  return run(context('service_role')+extra+f"SELECT get_forced_password_change_readiness_internal('{a}')->>'ready';").splitlines()[-1]
 assert readiness()=='true'
 # Prove no profile/audit writes by running readiness in a READ ONLY transaction.
 out=run("BEGIN READ ONLY; "+context('service_role')+f"SELECT get_forced_password_change_readiness_internal('{a}')->>'ready'; COMMIT;")
 assert 'true' in out
 assert run("SELECT count(*) FROM audit_logs")=='0'
 assert run(f"SELECT must_change_password FROM profiles WHERE id='{a}'")=='t'
 for role in ['anon','authenticated']:
  for name in ['complete_forced_password_change_internal','get_forced_password_change_readiness_internal']:
   fail(context(role)+f"SELECT {name}('{a}');",'permission denied')
 run("REVOKE EXECUTE ON FUNCTION complete_forced_password_change_internal(uuid) FROM service_role;")
 assert readiness()=='false'
 run("GRANT EXECUTE ON FUNCTION complete_forced_password_change_internal(uuid) TO service_role;")
 out=run("BEGIN; DROP FUNCTION complete_forced_password_change_internal(uuid); "+context('service_role')+f"SELECT get_forced_password_change_readiness_internal('{a}')->>'ready'; ROLLBACK;")
 assert 'false' in out
 for state in ['false','NULL']:
  run(f"UPDATE profiles SET must_change_password={state} WHERE id='{a}';")
  assert readiness()==('true' if state=='false' else 'false')
 run(f"UPDATE profiles SET must_change_password=true WHERE id='{a}';")
 for target in [b,'00000000-0000-0000-0000-000000000099']:
  assert run(context('service_role')+f"SELECT get_forced_password_change_readiness_internal('{target}')->>'ready';").splitlines()[-1]=='false'
 print('PASS Phase A readiness read-only, missing function/grant/profile, inactive, false/null flag and ACL')
 run(context('service_role')+f"SELECT complete_forced_password_change_internal('{a}');")
 assert run(f"SELECT must_change_password FROM profiles WHERE id='{a}'")=='f'
 run("UPDATE profiles SET must_change_password=true; TRUNCATE audit_logs;")
 print('PASS matrix C/F: Phase A secure completion contract')
 run((repo/'supabase/migrations/202610020002_acc06d_forced_password_cutover.sql').read_text(encoding='utf8'))
 assert readiness()=='true'
 print('PASS matrix G: Phase B readiness retained; final security tests follow')

 for role in ['anon','authenticated']:
  fail(context(role)+"SELECT complete_my_password_change();",'permission denied')
  fail(context(role)+f"SELECT complete_forced_password_change_internal('{a}');",'permission denied')
  assert run(f"SELECT has_function_privilege('{role}','complete_forced_password_change_internal(uuid)','EXECUTE')")=='f'
 assert run(f"SELECT must_change_password FROM profiles WHERE id='{a}'")=='t'
 print('PASS old RPC + internal RPC blocked for anon/authenticated; flag unchanged')
 for value in ['false','NULL']:
  fail(context('authenticated')+f"UPDATE profiles SET must_change_password={value} WHERE id='{a}';",'TRUSTED_PASSWORD_COMPLETION_REQUIRED')
 # Legacy definer path also blocked even with table owner privileges.
 run("CREATE FUNCTION legacy_clear() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE profiles SET must_change_password=false $$;")
 fail(context('authenticated')+"SELECT legacy_clear();",'TRUSTED_PASSWORD_COMPLETION_REQUIRED')
 print('PASS direct table and legacy definer bypass blocked')
 fail(context('service_role')+f"SELECT complete_forced_password_change_internal('{b}');",'ACCOUNT_INACTIVE')
 fail(context('service_role')+"SELECT complete_forced_password_change_internal('00000000-0000-0000-0000-000000000099');",'PROFILE_NOT_FOUND')
 # Audit failure must roll back the flag in the same DB transaction.
 run("ALTER TABLE audit_logs ADD CONSTRAINT fixture_fail CHECK (false);")
 fail(context('service_role')+f"SELECT complete_forced_password_change_internal('{a}');",'fixture_fail')
 assert run(f"SELECT must_change_password FROM profiles WHERE id='{a}'")=='t'
 run("ALTER TABLE audit_logs DROP CONSTRAINT fixture_fail;")
 print('PASS inactive/missing and audit-failure rollback')
 run(context('service_role')+f"SELECT complete_forced_password_change_internal('{a}'); SELECT complete_forced_password_change_internal('{a}');")
 assert run(f"SELECT must_change_password FROM profiles WHERE id='{a}'")=='f'
 assert run(f"SELECT must_change_password FROM profiles WHERE id='{b}'")=='t'
 assert run(f"SELECT count(*) FROM audit_logs WHERE user_id='{a}' AND record_id='{a}' AND table_name='profiles' AND action='COMPLETE_FORCED_PASSWORD_CHANGE' AND old_data->>'must_change_password'='true' AND new_data->>'must_change_password'='false' AND new_data->>'completed_at' IS NOT NULL AND created_at IS NOT NULL")=='1'
 print('PASS completion atomic/idempotent, one self audit, other profile unchanged')
 print('PASS migration parsed/executed on PostgreSQL; actual Supabase Auth NOT TESTED')
finally:
 if created:run(f'DROP DATABASE {db} WITH (FORCE)','postgres')
