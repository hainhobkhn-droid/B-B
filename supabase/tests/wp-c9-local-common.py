"""Disposable localhost fixture. Never connects to Supabase."""
from pathlib import Path
import json
import os
import subprocess
import time

repo = Path(__file__).resolve().parents[2]
psql = r'C:\Program Files\PostgreSQL\17\bin\psql.exe'
env = dict(os.environ, PGCLIENTENCODING='UTF8', PGCONNECT_TIMEOUT='3')

class Fixture:
    def __init__(self):
        self.database = 'wp_c9_' + str(time.time_ns())
    def call(self, sql, target=None):
        result = subprocess.run([psql, '-X', '-w', '-h', '127.0.0.1', '-p', '55439',
            '-U', 'postgres', '-d', target or self.database, '-At', '-v', 'ON_ERROR_STOP=1'],
            input=sql.encode('utf8'), capture_output=True, env=env, timeout=90)
        result.stdout=result.stdout.decode('utf8').replace('\r\n','\n')
        result.stderr=result.stderr.decode('utf8').replace('\r\n','\n')
        return result
    def run(self, sql, target=None):
        r=self.call(sql,target)
        assert r.returncode==0,(r.stdout,r.stderr)
        return r.stdout.strip()
    def fail(self,sql,error):
        r=self.call(sql)
        assert r.returncode!=0 and error in r.stderr,(r.stdout,r.stderr,error)
    def install(self,sql):
        # psql Windows stdin chunk boundaries can add CR to multiline function
        # literals. Server-side decode preserves the exact audited source bytes.
        self.run("DO $install$ BEGIN EXECUTE convert_from(decode('"+sql.encode('utf8').hex()+"','hex'),'UTF8'); END $install$;")
    def __enter__(self):
        self.run('CREATE DATABASE '+self.database,'postgres')
        self.install(SCHEMA)
        self.run('ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; GRANT ALL ON audit_logs TO service_role;')
        self.baseline=json.loads((repo/'supabase/tests/wp-c9-production-rating-baseline.json').read_text(encoding='utf8'))
        for name,row in self.baseline.items():
            if name.startswith('_capture'):continue
            self.install(row['definition'])
            assert self.run("SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='"+name+"'")==row['md5'],name
        initial_source=(repo/'supabase/migrations/202610030005_rating_initial01b_pre_history_edit.sql').read_bytes().decode('utf8')
        import re
        initial=re.search(r'CREATE OR REPLACE FUNCTION public.set_player_initial_rating_before_history\([\s\S]*?\$function\$;',initial_source).group()
        self.install(initial.replace("\r\n","\n").replace("\n","\r\n"))
        assert self.run("SELECT md5(pg_get_functiondef('public.set_player_initial_rating_before_history(uuid,numeric,text)'::regprocedure))")=='4f8a480037ef04a8e0b223739bce5652'
        boundary_source=(repo/'supabase/migrations/202610030002_player_lifecycle01b_status_transition.sql').read_text(encoding='utf8')
        for name,cap,error,expected in [
            ('update_player','can_manage_players','PLAYER_MANAGEMENT_PERMISSION_REQUIRED','c4ef35bdfb01923dde0f9bb4a849a84c'),
            ('set_player_lifecycle_status','can_manage_player_lifecycle','PLAYER_LIFECYCLE_PERMISSION_REQUIRED','3d4c99cee77a9fea190f8392e0efafcb')]:
            definition=re.search(r'CREATE OR REPLACE FUNCTION public.'+name+r'\([\s\S]*?\$function\$;',boundary_source).group().replace('\n','\r\n')
            definition=definition.replace('coalesce(p.can_manage_members, false)','coalesce(p.'+cap+', false)').replace('MEMBER_MANAGEMENT_PERMISSION_REQUIRED',error)
            definition=definition.replace('    IF NOT public.current_user_business_access_active() THEN','    -- ACC07B business access gate\n    IF NOT public.current_user_business_access_active() THEN')
            self.install(definition)
            assert self.run("SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='"+name+"'")==expected,name
        self.run("""
          REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
          GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
          GRANT EXECUTE ON FUNCTION public.current_user_business_access_active(),
            public.record_rating_adjustment_active(uuid,uuid,numeric,text,timestamptz),
            public.correct_rating_adjustment_active(uuid,text),
            public.set_player_initial_rating_before_history(uuid,numeric,text),
            public.update_player(uuid,text,text,text,text,text,date,date,text),
            public.set_player_lifecycle_status(uuid,text,text) TO authenticated;
        """)
        return self
    def __exit__(self,*args):
        self.run('DROP DATABASE '+self.database+' WITH (FORCE)','postgres')
    def as_user(self,n,sql):
        return "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','"+uid(n)+"',false); "+sql
    def json(self,n,sql):
        return json.loads(self.run(self.as_user(n,sql)).splitlines()[-1])

def uid(n):return f'00000000-0000-0000-0000-{n:012d}'

SCHEMA = """
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,role text NOT NULL,
 is_active boolean NOT NULL DEFAULT true,membership_status text NOT NULL DEFAULT 'APPROVED',
 must_change_password boolean NOT NULL DEFAULT false,can_adjust_rating boolean NOT NULL DEFAULT false,
 can_view_audit boolean NOT NULL DEFAULT false,can_manage_players boolean NOT NULL DEFAULT false,
 can_manage_player_lifecycle boolean NOT NULL DEFAULT false);
CREATE TABLE players(id uuid PRIMARY KEY, full_name text NOT NULL,status text NOT NULL DEFAULT 'ACTIVE',
 initial_rating numeric(6,3) NOT NULL DEFAULT 4,current_rating numeric(6,3) NOT NULL DEFAULT 4,
 updated_at timestamptz DEFAULT now());
CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),
 action text NOT NULL,table_name text,record_id uuid,old_data jsonb,new_data jsonb,reason text,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE rating_settings(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 algorithm_version text UNIQUE NOT NULL,initial_rating numeric DEFAULT 4,min_rating numeric DEFAULT 2,
 max_rating numeric DEFAULT 8,k_factor numeric DEFAULT .5,expected_sensitivity numeric DEFAULT 1,
 provisional_matches integer DEFAULT 5,stable_matches integer DEFAULT 10,
 recency_half_life_days integer DEFAULT 180,recency_floor numeric DEFAULT .2,
 rating_delta_cap numeric DEFAULT .5,is_active boolean DEFAULT true);
INSERT INTO rating_settings(algorithm_version) VALUES ('V1.1');
CREATE TABLE rating_match_weights(match_type text PRIMARY KEY,weight numeric NOT NULL);
INSERT INTO rating_match_weights VALUES('FRIENDLY',1);
CREATE TABLE matches(id uuid PRIMARY KEY,played_at timestamptz,match_number integer,
 match_type text,score_mode text,team_a_score integer,team_b_score integer,status text);
CREATE TABLE match_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),match_id uuid,player_id uuid,team text);
CREATE TABLE rating_adjustments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
 amount numeric(8,5) NOT NULL CHECK(amount<>0),reason text NOT NULL,
 created_by uuid REFERENCES profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 effective_at timestamptz NOT NULL,replay_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 correction_of_adjustment_id uuid REFERENCES rating_adjustments(id) ON DELETE RESTRICT,
 request_id uuid UNIQUE,request_algorithm_version text,
 CHECK(correction_of_adjustment_id IS NULL OR correction_of_adjustment_id<>id),
 CHECK((request_id IS NULL AND request_algorithm_version IS NULL) OR
 (request_id IS NOT NULL AND request_algorithm_version IS NOT NULL AND btrim(request_algorithm_version)<>'')));
CREATE UNIQUE INDEX one_direct_correction ON rating_adjustments(correction_of_adjustment_id)
 WHERE correction_of_adjustment_id IS NOT NULL;
CREATE TABLE rating_adjustment_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 adjustment_id uuid NOT NULL REFERENCES rating_adjustments(id) ON DELETE RESTRICT,
 player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
 algorithm_version text NOT NULL REFERENCES rating_settings(algorithm_version),
 rating_before numeric NOT NULL CHECK(rating_before BETWEEN 2 AND 8),
 requested_amount numeric NOT NULL,applied_delta numeric NOT NULL,
 rating_after numeric NOT NULL CHECK(rating_after BETWEEN 2 AND 8),created_at timestamptz DEFAULT now(),
 UNIQUE(adjustment_id,algorithm_version));
CREATE TABLE rating_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),match_id uuid,player_id uuid,
 algorithm_version text,rating_before numeric(6,3),team_rating numeric(6,3),
 opponent_team_rating numeric(6,3),expected_share numeric(8,5),actual_share numeric(8,5),
 performance_gap numeric(8,5),match_weight numeric(6,3),recency_weight numeric(6,3),
 provisional_factor numeric(6,3),rating_delta numeric(8,5),rating_after numeric(6,3),
 created_at timestamptz DEFAULT now());
CREATE FUNCTION current_user_business_access_active() RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
""".replace("AS $function$\n", "AS $function$\r\n") + """    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active IS TRUE
          AND p.membership_status = 'APPROVED'
          AND p.must_change_password IS NOT TRUE
    );
""".replace('\n','\r\n') + """$function$;
CREATE FUNCTION _get_active_rating_version() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path=public,pg_temp AS $$ DECLARE v text; BEGIN
 SELECT algorithm_version INTO v FROM rating_settings WHERE is_active ORDER BY id DESC LIMIT 1;
 IF v IS NULL THEN RAISE EXCEPTION 'ACTIVE_RATING_VERSION_NOT_CONFIGURED'; END IF; RETURN v; END $$;
"""
for n,role,rating,audit,active,membership,forced in [
 (1,'ADMIN',False,False,True,'APPROVED',False),
 (2,'MEMBER',True,False,True,'APPROVED',False),
 (3,'MEMBER',False,True,True,'APPROVED',False),
 (4,'MEMBER',False,False,True,'APPROVED',False),
 (5,'MEMBER',True,True,False,'APPROVED',False),
 (6,'MEMBER',True,True,True,'PENDING',False),
 (7,'MEMBER',True,True,True,'REJECTED',False),
 (8,'MEMBER',True,True,True,'APPROVED',True)]:
    SCHEMA+=f"INSERT INTO profiles VALUES('{uid(n)}','Fixture {n}','{role}',{str(active).lower()},'{membership}',{str(forced).lower()},{str(rating).lower()},{str(audit).lower()},false,false);\n"
for n in range(10,15):SCHEMA+=f"INSERT INTO players(id,full_name) VALUES('{uid(n)}','Player {n}');\n"
