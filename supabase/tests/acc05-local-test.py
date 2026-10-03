"""Disposable localhost-only ACC05 fixture. Requires PostgreSQL and existing Supabase roles.
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
 reset();partner_anchor=uid(99);run(f"INSERT INTO players(id) VALUES('{partner_anchor}'); INSERT INTO match_players(player_id,partner_player_id) VALUES('{partner_anchor}','{player}');")
 assert run(f"SELECT get_member_hard_delete_snapshot('{t}')->'player_references'->>'match_players'")=='1'
 fail(cleanup(),'MEMBER_HAS_REFERENCES');print('PASS match partner-only remains an ACC05 blocker')
 reset();run(f"INSERT INTO players(id) VALUES('{partner_anchor}'); INSERT INTO tournament_registrations(player_id,partner_player_id) VALUES('{partner_anchor}','{player}');")
 assert run(f"SELECT get_member_hard_delete_snapshot('{t}')->'player_references'->>'tournament_registrations'")=='1'
 fail(cleanup(),'MEMBER_HAS_REFERENCES');print('PASS tournament partner-only remains an ACC05 blocker')
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
 # Concurrent transactions: first owns audit table lock; second must wait then fail target lookup.
 reset()
 cmd=[psql,'-X','-w','-h','127.0.0.1','-p','55439','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1']
 first=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
 first.stdin.write('BEGIN; '+cleanup()+" SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;\n");first.stdin.close()
 while first.stdout.readline().strip()!='LOCKED':
  if first.poll() is not None:raise AssertionError(first.stderr.read())
 fail(cleanup(),'TARGET_MEMBER_REQUIRED');assert first.wait(timeout=5)==0
 assert run("SELECT count(*) FROM audit_logs WHERE action='HARD_DELETE_MEMBER_ACCOUNT'")=='1'
 print('PASS two concurrent cleanup attempts: exactly one tombstone')
finally:
 if created:run(f'DROP DATABASE {db} WITH (FORCE)','postgres')
