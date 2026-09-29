"""FUND04 disposable localhost fixture; no remote host option, no production data.
Usage: python fund04-local-test.py [--source-dir PATH]
Requires PostgreSQL 17 localhost:55440; tables below are a minimal fixture,
NOT a production schema/RLS clone. Database is dropped even after failure.
"""
from pathlib import Path
import argparse, subprocess, os, time, json, sys
sys.stdout.reconfigure(encoding="utf8")
parser=argparse.ArgumentParser(); parser.add_argument('--source-dir',type=Path)
args=parser.parse_args()
repo=Path(r'C:\Users\hainh\OneDrive\Desktop\PICK DUPR B&B\B-B-remote-check') if args.source_dir else Path(__file__).resolve().parents[2]
source=args.source_dir or repo/'supabase'
newmigration=source/'202609290003_fund04_member_batch_collection.sql' if args.source_dir else source/'migrations/202609290003_fund04_member_batch_collection.sql'
tests=source/'fund04-member-batch-collection.sql' if args.source_dir else source/'tests/fund04-member-batch-collection.sql'
db='fund04_local_'+str(time.time_ns()); env=dict(os.environ,PGCLIENTENCODING='UTF8')
psql=r'C:\Program Files\PostgreSQL\17\bin\psql.exe'
def cmd(database=None): return [psql,'-X','-w','-h','127.0.0.1','-p','55440','-U','postgres','-d',database or db,'-At','-v','ON_ERROR_STOP=1']
def run(sql,database=None):
 p=subprocess.run(cmd(database),input=sql,encoding='utf8',capture_output=True,env=env,timeout=30)
 if p.returncode: raise RuntimeError(p.stderr)
 return p.stdout.strip(),p.stderr
created=False
try:
 run("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$;",'postgres')
 run('CREATE DATABASE '+db,'postgres');created=True
 run('''CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_active boolean,can_collect_fund boolean,can_manage_fund boolean);
 CREATE TABLE players(id uuid PRIMARY KEY);
 CREATE TABLE matches(id uuid PRIMARY KEY,status text,played_at timestamptz);
 CREATE TABLE fund_obligation_campaigns(id uuid PRIMARY KEY,status text,title text,period_month date);
 CREATE TABLE fund_contributions(id uuid PRIMARY KEY,player_id uuid REFERENCES players(id),match_id uuid REFERENCES matches(id),campaign_id uuid REFERENCES fund_obligation_campaigns(id),amount_due numeric,status text,reason text,due_date date,created_at timestamptz);
 CREATE TABLE fund_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contribution_id uuid REFERENCES fund_contributions(id),player_id uuid REFERENCES players(id),amount numeric,paid_at timestamptz,confirmed_by uuid REFERENCES profiles(id),note text,created_at timestamptz);
 CREATE TABLE fund_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_date timestamptz,transaction_type text,amount numeric,description text,player_id uuid REFERENCES players(id),match_id uuid,tournament_id uuid,created_by uuid,created_at timestamptz,payment_id uuid REFERENCES fund_payments(id),reversal_of_transaction_id uuid REFERENCES fund_transactions(id));
 CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,action text,table_name text,record_id uuid,old_data jsonb,new_data jsonb,reason text,created_at timestamptz);
 INSERT INTO profiles VALUES(lpad('1',32,'0')::uuid,'ADMIN',true,false,false),(lpad('2',32,'0')::uuid,'MEMBER',true,true,false),(lpad('3',32,'0')::uuid,'MEMBER',true,false,false),(lpad('4',32,'0')::uuid,'MEMBER',false,true,false),(lpad('5',32,'0')::uuid,'MEMBER',true,false,true);
 INSERT INTO fund_obligation_campaigns VALUES('00000000-0000-0000-0000-000000000050','ACTIVE','Local fixture','2026-01-01');
 ''')
 permissions=(repo/'supabase/migrations/202609250007_perm01b3_fund_permissions.sql').read_text(encoding='utf8')
 for name in ['record_fund_payment','refund_fund_payment']:
  start=permissions.index('CREATE OR REPLACE FUNCTION public.'+name+'(');end=permissions.index('\n$function$\n;',start)+len('\n$function$\n;');run(permissions[start:end])
 for file in ['202609290001_fund03_payment_net_paid.sql','202609290002_fund03_collection_balances.sql']:
  run((repo/'supabase/migrations'/file).read_text(encoding='utf8'))
 run('REVOKE ALL ON FUNCTION _record_fund_payment_internal(uuid,numeric,timestamptz,text,uuid) FROM PUBLIC,anon,authenticated;')
 run(newmigration.read_text(encoding='utf8'))
 out,log=run("SET fund04.local_fixture='yes';\n"+tests.read_text(encoding='utf8')); print(log)
 # SQL suite rolls back every fixture; only permanent seed campaign/profiles remain.
 assert run('SELECT count(*) FROM fund_payments')[0]=='0'
 print('PASS: SQL fixture rollback leaves no payments')
 def actor(sql): return "BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',lpad('2',32,'0')::uuid::text,true);"+sql+';COMMIT;'
 pid='00000000-0000-0000-0000-000000009000';cid='00000000-0000-0000-0000-000000009001'
 run(f"INSERT INTO players VALUES('{pid}');INSERT INTO fund_contributions VALUES('{cid}','{pid}',NULL,'00000000-0000-0000-0000-000000000050',100,'CHUA_DONG','QUY_THANG','2026-01-01',now());")
 # Hold batch locks after RPC returns until the competing connection is waiting.
 first=subprocess.Popen(cmd(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
 first.stdin.write(actor(f"SELECT record_member_fund_payment('{pid}',100);SELECT pg_sleep(2)"));first.stdin.close()
 time.sleep(.4)
 second=subprocess.run(cmd(),input=actor(f"SELECT record_member_fund_payment('{pid}',100)"),encoding='utf8',capture_output=True,env=env,timeout=15)
 first.wait(timeout=15)
 assert first.returncode==0 and second.returncode!=0 and 'BATCH_NO_OUTSTANDING' in second.stderr,(first.stderr.read(),second.stderr)
 assert run('SELECT count(*),sum(amount) FROM fund_payments')[0]=='1|100'
 assert run("SELECT count(*) FROM audit_logs WHERE action='RECORD_MEMBER_FUND_PAYMENT'")[0]=='1'
 print('PASS: concurrent authenticated collector batches serialize; one payment / one batch audit')
 # Single-item collection shares the contribution lock with batch collection.
 run(f"UPDATE fund_contributions SET amount_due=200 WHERE id='{cid}'")
 first=subprocess.Popen(cmd(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
 first.stdin.write(actor(f"SELECT record_fund_payment('{cid}',100);SELECT pg_sleep(2)"));first.stdin.close();time.sleep(.4)
 second=subprocess.run(cmd(),input=actor(f"SELECT record_member_fund_payment('{pid}',100)"),encoding='utf8',capture_output=True,env=env,timeout=15)
 first.wait(timeout=15)
 assert first.returncode==0 and second.returncode!=0 and 'BATCH_NO_OUTSTANDING' in second.stderr,second.stderr
 assert run('SELECT sum(amount) FROM fund_payments')[0]=='200'
 print('PASS: concurrent single payment vs batch cannot overpay')
 print('PASS: FUND04 local SQL / ACL / atomicity / concurrency')
finally:
 if created: run('DROP DATABASE '+db+' WITH (FORCE)','postgres');print('Disposable test database dropped.')
