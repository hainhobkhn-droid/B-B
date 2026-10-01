"""Disposable localhost-only ACC05 fixture. Requires PostgreSQL, existing Supabase roles and an unprivileged acc05b_public_probe role.
No production schema claim: minimal tables are generated for the IAM05E references.
Run: python supabase/tests/acc05-local-test.py
"""
from pathlib import Path
import os, subprocess, time, re
repo=Path(__file__).resolve().parents[2]
psql=r'C:\Program Files\PostgreSQL\17\bin\psql.exe'
db='acc05_test_'+str(time.time_ns())
env=dict(os.environ,PGCLIENTENCODING='UTF8',PGCONNECT_TIMEOUT='3')
def call(sql,database=None):
 return subprocess.run([psql,'-X','-w','-h','127.0.0.1','-p','55439','-U','postgres','-d',database or db,'-At','-v','ON_ERROR_STOP=1'],input=sql,encoding='utf8',capture_output=True,env=env,timeout=30)
def run(sql,database=None):
 p=call(sql,database);assert p.returncode==0,p.stderr;return p.stdout.strip()
def fail(sql,expected):
 p=call(sql);assert p.returncode!=0 and expected in p.stderr,(p.stdout,p.stderr)
def uid(n):return f'00000000-0000-0000-0000-{n:012d}'
a,t,player=uid(1),uid(2),uid(3)
old=(repo/'supabase/migrations/202609280006_iam05e_safe_member_hard_delete.sql').read_text(encoding='utf8')
new=(repo/'supabase/migrations/202610010001_acc05_hard_delete_integrity_recovery.sql').read_text(encoding='utf8')
created=False
try:
 run(f'CREATE DATABASE {db}','postgres');created=True
 run("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;")
 run("CREATE TABLE players(id uuid PRIMARY KEY,full_name text,player_type text,status text,initial_rating numeric,current_rating numeric); CREATE TABLE profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),role text,is_active boolean,player_id uuid REFERENCES players(id),full_name text,login_name text,membership_status text); CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),action text,table_name text,record_id uuid,old_data jsonb,new_data jsonb,reason text,created_at timestamptz DEFAULT now());")
 for table,where in re.findall(r'FROM public\.(\w+) x\s+WHERE (.*?);',old,re.S):
  if table=='audit_logs':continue
  cols=set(re.findall(r'x\.(\w+)\s*=\s*v_(?:profile|player)\.id',where))
  if not cols:continue
  definition=','.join(c+' uuid REFERENCES '+('players' if 'player' in c else 'profiles')+'(id)' for c in sorted(cols))
  # The snapshot repeats tables for player and actor counts: add individual columns.
  run(f'CREATE TABLE IF NOT EXISTS {table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid());')
  for column in definition.split(','):run(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column};')
 run(old);run(new)
 def reset():
  run(f"TRUNCATE auth.users,profiles,players,audit_logs CASCADE; INSERT INTO auth.users VALUES('{a}'),('{t}'); INSERT INTO players(id) VALUES('{player}'); INSERT INTO profiles(id,role,is_active) VALUES('{a}','ADMIN',true); INSERT INTO profiles(id,role,is_active,player_id) VALUES('{t}','MEMBER',true,'{player}');")
 def cleanup():return f"SELECT admin_hard_delete_member_public('{t}','{a}','fixture');"
 reset()
 run(f"INSERT INTO audit_logs(user_id,action,table_name,record_id) VALUES('{a}','UPDATE_PLAYER','players','{player}');")
 fail(cleanup(),'MEMBER_HAS_REFERENCES');assert run(f"SELECT count(*) FROM profiles WHERE id='{t}'")=='1'
 print('PASS player audit blocker / public cleanup rollback')
 reset();run(f"SELECT get_member_hard_delete_snapshot('{t}'); INSERT INTO fund_payments(player_id) VALUES('{player}');")
 fail(cleanup(),'MEMBER_HAS_REFERENCES');print('PASS blocker inserted after preview')
 reset();run(f"INSERT INTO audit_logs(user_id,action,table_name,record_id) VALUES('{t}','AUTO_PROVISION_MEMBER','profiles','{t}');")
 run(cleanup());assert run("SELECT count(*) FROM audit_logs WHERE action='HARD_DELETE_MEMBER_ACCOUNT'")=='1'
 assert run("SELECT count(*) FROM audit_logs WHERE action='AUTO_PROVISION_MEMBER'")=='0'
 fail(f"SELECT complete_member_hard_delete_auth('{t}','{a}');",'CLEANUP_NOT_COMPLETE')
 run(f"DELETE FROM auth.users WHERE id='{t}'; SELECT complete_member_hard_delete_auth('{t}','{a}'); SELECT complete_member_hard_delete_auth('{t}','{a}');")
 assert run("SELECT count(*) FROM audit_logs WHERE action='HARD_DELETE_MEMBER_AUTH_COMPLETED'")=='1'
 print('PASS lifecycle-only eligible / tombstone retained / completion idempotent')
 reset();fail(f"SELECT admin_hard_delete_member_public('{a}','{a}','fixture');",'SELF_HARD_DELETE_FORBIDDEN')
 fail(f"SELECT admin_hard_delete_member_public('{t}','{t}','fixture');",'ADMIN_REQUIRED')
 for role in ['anon','authenticated']:
  assert run(f"SELECT has_function_privilege('{role}','public.get_member_hard_delete_snapshot(uuid)','EXECUTE')")=='f'
  assert run(f"SELECT has_function_privilege('{role}','public.complete_member_hard_delete_auth(uuid,uuid)','EXECUTE')")=='f'
 assert run("SELECT has_function_privilege('service_role','public.get_member_hard_delete_snapshot(uuid)','EXECUTE')")=='t'
 print('PASS actor and grant checks')
 # Concurrent transactions: first owns the target advisory lock; second must wait then fail target lookup.
 reset()
 cmd=[psql,'-X','-w','-h','127.0.0.1','-p','55439','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1']
 first=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
 first.stdin.write('BEGIN; '+cleanup()+" SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;\n");first.stdin.close()
 while first.stdout.readline().strip()!='LOCKED':
  if first.poll() is not None:raise AssertionError(first.stderr.read())
 began=time.monotonic();fail(cleanup(),'TARGET_MEMBER_REQUIRED');same_delay=time.monotonic()-began;assert first.wait(timeout=5)==0
 print(f'Same-target wait: {same_delay:.3f}s; deterministic TARGET_MEMBER_REQUIRED')
 assert run("SELECT count(*) FROM audit_logs WHERE action='HARD_DELETE_MEMBER_ACCOUNT'")=='1'
 print('PASS two concurrent cleanup attempts: exactly one tombstone')
 # Additional ACC05B gates; never touches production.
 reset()
 for role in ['anon','authenticated','acc05b_public_probe']:
  for fn in [f"get_member_hard_delete_snapshot('{t}')",f"complete_member_hard_delete_auth('{t}','{a}')"]:
   fail(f'SET ROLE {role}; SELECT {fn};','permission denied for function')
 run(f"SET ROLE service_role; SELECT get_member_hard_delete_snapshot('{t}');")
 run(cleanup());run(f"DELETE FROM auth.users WHERE id='{t}'; SET ROLE service_role; SELECT complete_member_hard_delete_auth('{t}','{a}');")
 print('PASS actual invocation service_role / authenticated / anon / PUBLIC-only probe')
 reset();run(f"INSERT INTO audit_logs(user_id,action,table_name,record_id) VALUES('{a}','UPDATE_PLAYER','players','{player}');")
 assert run(f"SELECT get_member_hard_delete_snapshot('{t}')->>'hard_delete_allowed'")=='false'
 fail(cleanup(),'MEMBER_HAS_REFERENCES')
 assert run('SELECT count(*) FROM players')=='1'
 assert run("SELECT count(*) FROM audit_logs WHERE action='HARD_DELETE_MEMBER_ACCOUNT'")=='0'
 run("DELETE FROM audit_logs WHERE action='UPDATE_PLAYER';")
 assert run(f"SELECT get_member_hard_delete_snapshot('{t}')->>'hard_delete_allowed'")=='true'
 print('PASS blocker removal restores eligibility / no partial deletion')
 reset();run(f"INSERT INTO audit_logs(user_id,action,table_name,record_id) VALUES('{t}','AUTO_PROVISION_MEMBER','profiles','{t}');")
 run("CREATE FUNCTION fail_player_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_ROLLBACK'; END $$; CREATE TRIGGER fail_delete BEFORE DELETE ON players FOR EACH ROW EXECUTE FUNCTION fail_player_delete();")
 fail(cleanup(),'INJECTED_ROLLBACK')
 assert run(f"SELECT count(*) FROM profiles WHERE id='{t}'")=='1'
 assert run('SELECT count(*) FROM players')=='1'
 assert run("SELECT count(*) FROM audit_logs WHERE action='AUTO_PROVISION_MEMBER'")=='1'
 assert run("SELECT count(*) FROM audit_logs WHERE action='HARD_DELETE_MEMBER_ACCOUNT'")=='0'
 run('DROP TRIGGER fail_delete ON players;')
 print('PASS late injected error rolls back profile, Player, lifecycle audit and tombstone')
 def held(sql):
  p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
  p.stdin.write("BEGIN; "+sql+" SELECT 'READY'; SELECT pg_sleep(1); COMMIT;\n");p.stdin.close()
  while p.stdout.readline().strip()!='READY':
   if p.poll() is not None:raise AssertionError(p.stderr.read())
  return p
 reset()
 p=held(f"INSERT INTO audit_logs(user_id,action,table_name,record_id) VALUES('{a}','UNRELATED','fixtures','{uid(99)}');")
 began=time.monotonic();run(cleanup());elapsed=time.monotonic()-began
 assert p.wait(timeout=5)==0
 assert elapsed < 0.8, elapsed
 print(f'PASS unrelated audit insert -> delete waits {elapsed:.3f}s; no deadlock')
 reset();t2,pl2=uid(4),uid(5)
 run(f"INSERT INTO auth.users VALUES('{t2}'); INSERT INTO players(id) VALUES('{pl2}'); INSERT INTO profiles(id,role,is_active,player_id) VALUES('{t2}','MEMBER',true,'{pl2}');")
 p=held(cleanup());began=time.monotonic();run(f"SELECT admin_hard_delete_member_public('{t2}','{a}','fixture');")
 elapsed=time.monotonic()-began;assert p.wait(timeout=5)==0
 assert run("SELECT count(*) FROM audit_logs WHERE action='HARD_DELETE_MEMBER_ACCOUNT'")=='2'
 assert elapsed < 0.8, elapsed
 print(f'PASS two different targets independent {elapsed:.3f}s; no deadlock')
 print('FIXTURE FK CATALOG\n'+run("SELECT conrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='f' AND confrelid IN ('profiles'::regclass,'players'::regclass) ORDER BY 1,2;"))
 # Realistic inverse lock order: writer locks target profile before adding audit.
 reset()
 writer=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
 writer.stdin.write(f"BEGIN; UPDATE profiles SET full_name='writer' WHERE id='{t}'; SELECT 'WRITER_LOCKED';\n");writer.stdin.flush()
 while writer.stdout.readline().strip()!='WRITER_LOCKED':
  if writer.poll() is not None:raise AssertionError(writer.stderr.read())
 deleter=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
 deleter.stdin.write("SET application_name='acc05b_deleter'; "+cleanup()+"\n");deleter.stdin.close()
 deadline=time.monotonic()+5
 while time.monotonic()<deadline:
  if run("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name='acc05b_deleter' AND l.locktype='advisory' AND l.granted")=='1':break
 else:raise AssertionError('deleter did not acquire target advisory lock')
 writer.stdin.write(f"INSERT INTO audit_logs(user_id,action,table_name,record_id) VALUES('{a}','UPDATE_MEMBER','profiles','{t}'); COMMIT;\n");writer.stdin.close()
 writer.wait(timeout=10);deleter.wait(timeout=10)
 errors=writer.stderr.read()+deleter.stderr.read()
 print('INVERSE LOCK ORDER RESULT\n'+errors)
 assert 'deadlock detected' not in errors, errors
 assert writer.returncode == 0 and 'MEMBER_HAS_REFERENCES' in errors, errors
 assert run(f"SELECT count(*) FROM profiles WHERE id='{t}'")=='1'
 assert run('SELECT count(*) FROM players')=='1'
 assert run("SELECT count(*) FROM audit_logs WHERE action='HARD_DELETE_MEMBER_ACCOUNT'")=='0'
 print('PASS old deadlock: writer commits, authoritative recheck blocks delete; no partial cleanup')
 reset()
 p=held(cleanup())
 # Delayed history append does not touch target rows; pseudo-reference has no FK.
 run(f"INSERT INTO audit_logs(user_id,action,table_name,record_id) VALUES('{a}','LATE_HISTORY','players','{player}');")
 assert p.wait(timeout=5)==0
 assert run("SELECT count(*) FROM audit_logs WHERE action='LATE_HISTORY'")=='1'
 assert run('SELECT count(*) FROM players')=='0'
 print('PASS pseudo-reference appended after snapshot retained by explicit history boundary')
 reset();p=held(cleanup())
 fail(f"INSERT INTO audit_logs(user_id,action) VALUES('{t}','LATE_ACTOR');",'foreign key constraint')
 assert p.wait(timeout=5)==0
 reset();p=held(cleanup())
 fail(f"INSERT INTO fund_payments(player_id) VALUES('{player}');",'foreign key constraint')
 assert p.wait(timeout=5)==0
 print('PASS audit actor FK and business Player FK reject inserts after concurrent deletion')

finally:
 if created:run(f'DROP DATABASE {db} WITH (FORCE)','postgres')
