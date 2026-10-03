"""Disposable localhost PLAYER-LIFECYCLE01D promotion inventory tests."""
from pathlib import Path
import json
import os
import subprocess
import time

repo = Path(__file__).resolve().parents[2]
migrations = [repo / f"supabase/migrations/{name}" for name in [
    "202610030001_player_lifecycle01a_reference_inventory.sql",
    "202610030002_player_lifecycle01b_status_transition.sql",
    "202610030003_player_lifecycle01c_conditional_hard_delete.sql",
    "202610030004_player_lifecycle01d_inventory_convergence.sql",
]]
psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
db = "player_lifecycle01d_" + str(time.time_ns())
env = dict(os.environ, PGCLIENTENCODING="UTF8", PGCONNECT_TIMEOUT="3")

def call(sql, target=None):
    return subprocess.run([psql,"-X","-w","-h","127.0.0.1","-p","55439","-U","postgres","-d",target or db,"-At","-v","ON_ERROR_STOP=1"],input=sql,encoding="utf8",capture_output=True,env=env,timeout=45)
def run(sql, target=None):
    p=call(sql,target); assert p.returncode==0,p.stderr; return p.stdout.strip()
def fail(sql, expected):
    p=call(sql); assert p.returncode!=0 and expected in p.stderr,(p.stdout,p.stderr)
def uid(n): return f"00000000-0000-0000-0000-{n:012d}"

admin,manager,normal,forced=uid(1),uid(2),uid(3),uid(4)
temp,guest,profile,anchor=uid(10),uid(11),uid(12),uid(13)
created=False
try:
    run(f"CREATE DATABASE {db}","postgres"); created=True
    run(f"""
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    CREATE TABLE players(id uuid PRIMARY KEY,full_name text NOT NULL,player_type text NOT NULL DEFAULT 'CLUB' CHECK(player_type=ANY(ARRAY['CLUB','GUEST'])),phone text,email text,initial_rating numeric NOT NULL DEFAULT 4,current_rating numeric NOT NULL DEFAULT 4,status text NOT NULL DEFAULT 'ACTIVE' CONSTRAINT players_status_check CHECK(status=ANY(ARRAY['ACTIVE','INACTIVE'])),joined_at date,date_of_birth date,notes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,login_name text,role text NOT NULL,is_active boolean NOT NULL,membership_status text NOT NULL,must_change_password boolean NOT NULL DEFAULT false,can_manage_members boolean NOT NULL DEFAULT false,player_id uuid UNIQUE REFERENCES players(id) ON DELETE SET NULL);
    CREATE TABLE match_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,partner_player_id uuid);
    CREATE TABLE rating_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
    CREATE TABLE rating_adjustments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,created_by uuid);
    CREATE TABLE rating_adjustment_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
    CREATE TABLE fund_contributions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
    CREATE TABLE fund_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,confirmed_by uuid);
    CREATE TABLE fund_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid REFERENCES players(id),created_by uuid);
    CREATE TABLE tournament_registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,partner_player_id uuid REFERENCES players(id) ON DELETE RESTRICT);
    CREATE TABLE tournament_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,confirmed_by uuid);
    CREATE TABLE awards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
    CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),action text NOT NULL,table_name text,record_id uuid,old_data jsonb,new_data jsonb,reason text,created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE players ENABLE ROW LEVEL SECURITY; ALTER TABLE match_players ENABLE ROW LEVEL SECURITY; GRANT SELECT ON players,match_players TO authenticated;
    CREATE FUNCTION current_user_business_access_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM profiles p WHERE p.id=auth.uid() AND p.is_active IS TRUE AND p.membership_status='APPROVED' AND p.must_change_password IS NOT TRUE) $$;
    REVOKE ALL ON FUNCTION current_user_business_access_active() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION current_user_business_access_active() TO authenticated;
    CREATE FUNCTION update_player(uuid,text,text,text,text,text,date,date,text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_status text; BEGIN IF NOT current_user_business_access_active() THEN RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'; END IF; UPDATE players SET status = v_status WHERE false; INSERT INTO audit_logs(action,table_name,record_id,reason) VALUES('UPDATE_PLAYER','players',gen_random_uuid(),'PLAYER_WRITE_API_V1'); RETURN '{{}}'; END $$;
    CREATE FUNCTION get_admin_member_promotion_preview(uuid,uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_match_players bigint; v_temp players%rowtype; BEGIN IF NOT current_user_business_access_active() THEN RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'; END IF; SELECT count(*) INTO v_match_players FROM match_players WHERE player_id = v_temp.id; RETURN jsonb_build_object('counts',jsonb_build_array(v_match_players),'matches',0,'ratings',0,'links',0,'blocked',false); END $$;
    CREATE FUNCTION promote_guest_player_to_member(uuid,uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE v_business_count bigint; BEGIN IF NOT current_user_business_access_active() THEN RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'; END IF; SELECT count(*) INTO v_business_count FROM match_players; IF v_business_count<0 THEN RAISE EXCEPTION 'TEMP_PLAYER_HAS_BUSINESS_DATA'; END IF; UPDATE profiles set player_id = null WHERE false; INSERT INTO audit_logs(action,reason) VALUES('PROMOTE_GUEST_TO_MEMBER','ADMIN_CONFIRMED_EXISTING_GUEST_AS_MEMBER'); RETURN '{{}}'; END $$;
    INSERT INTO players(id,full_name,player_type,current_rating) VALUES('{temp}','Temp','CLUB',4.1),('{guest}','Guest','GUEST',5.25),('{anchor}','Anchor','CLUB',4);
    INSERT INTO profiles(id,full_name,role,is_active,membership_status,must_change_password,can_manage_members,player_id) VALUES
      ('{admin}','Admin','ADMIN',true,'APPROVED',false,false,NULL),('{manager}','Manager','MEMBER',true,'APPROVED',false,true,NULL),('{normal}','Normal','MEMBER',true,'APPROVED',false,false,NULL),('{forced}','Forced','ADMIN',true,'APPROVED',true,false,NULL),('{profile}','Target','MEMBER',true,'APPROVED',false,false,'{temp}');
    """)
    for migration in migrations: run(migration.read_text(encoding="utf8"))
    def ctx(actor): return f"SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{actor}',false); "
    def preview(actor=admin,p=profile,g=guest): return json.loads(run(ctx(actor)+f"SELECT get_admin_member_promotion_preview('{p}','{g}');").splitlines()[-1])
    def promote(actor=admin,p=profile,g=guest): return run(ctx(actor)+f"SELECT promote_guest_player_to_member('{p}','{g}');").splitlines()[-1]
    def clear_refs():
        run("TRUNCATE match_players,rating_events,rating_adjustments,rating_adjustment_events,fund_contributions,fund_payments,fund_transactions,tournament_registrations,tournament_payments,awards;")

    x=preview(); assert x['blocked'] is False and x['counts']==[0]*10 and x['inventory_version']=='PLAYER-LIFECYCLE01A'
    run(f"INSERT INTO audit_logs(user_id,action,table_name,record_id) VALUES('{admin}','UPDATE_PLAYER','players','{temp}');")
    assert preview()['blocked'] is False
    print('PASS zero-reference and audit-only preview preserve old eligibility')

    cases=[
      ("INSERT INTO match_players(player_id) VALUES('{p}')",0),
      ("INSERT INTO match_players(player_id,partner_player_id) VALUES('{a}','{p}')",0),
      ("INSERT INTO tournament_registrations(player_id) VALUES('{p}')",7),
      ("INSERT INTO tournament_registrations(player_id,partner_player_id) VALUES('{a}','{p}')",7),
      ("INSERT INTO rating_events(player_id) VALUES('{p}')",1),
      ("INSERT INTO rating_adjustments(player_id) VALUES('{p}')",2),
      ("INSERT INTO rating_adjustment_events(player_id) VALUES('{p}')",3),
      ("INSERT INTO fund_contributions(player_id) VALUES('{p}')",4),
      ("INSERT INTO fund_payments(player_id) VALUES('{p}')",5),
      ("INSERT INTO fund_transactions(player_id) VALUES('{p}')",6),
      ("INSERT INTO tournament_payments(player_id) VALUES('{p}')",8),
      ("INSERT INTO awards(player_id) VALUES('{p}')",9),
    ]
    for sql,index in cases:
        clear_refs(); run(sql.format(p=temp,a=anchor)); x=preview(); assert x['blocked'] is True and x['counts'][index]==1,(sql,x)
    print('PASS preview authoritative primary/partner/rating/fund/tournament/award inventory')

    clear_refs(); run(f"INSERT INTO match_players(player_id,partner_player_id) VALUES('{anchor}','{temp}');")
    fail(ctx(admin)+f"SELECT promote_guest_player_to_member('{profile}','{guest}');",'TEMP_PLAYER_HAS_BUSINESS_DATA')
    assert run(f"SELECT player_id='{temp}' FROM profiles WHERE id='{profile}';")=='t'
    print('PASS mutation recomputes after preview and blocks partner-only reference')

    clear_refs(); run(f"INSERT INTO match_players(player_id) VALUES('{guest}'); INSERT INTO rating_events(player_id) VALUES('{guest}');")
    before=run(f"SELECT initial_rating||'|'||current_rating FROM players WHERE id='{guest}';")
    result=promote(manager); assert '"ok": true' in result
    assert run(f"SELECT player_id='{guest}' FROM profiles WHERE id='{profile}';")=='t'
    assert run(f"SELECT status FROM players WHERE id='{temp}';")=='INACTIVE'
    assert run(f"SELECT player_type FROM players WHERE id='{guest}';")=='CLUB'
    assert run(f"SELECT initial_rating||'|'||current_rating FROM players WHERE id='{guest}';")==before
    assert run(f"SELECT count(*) FROM match_players WHERE player_id='{guest}';")=='1' and run(f"SELECT count(*) FROM rating_events WHERE player_id='{guest}';")=='1'
    print('PASS delegated mutation / Guest identity, rating, history / profile relink / temp INACTIVE')

    # New isolated pairs for authorization and atomic rollback.
    run(f"INSERT INTO players(id,full_name,player_type) VALUES('{uid(20)}','T2','CLUB'),('{uid(21)}','G2','GUEST'),('{uid(22)}','T3','CLUB'),('{uid(23)}','G3','GUEST'); INSERT INTO profiles(id,full_name,role,is_active,membership_status,player_id) VALUES('{uid(24)}','P2','MEMBER',true,'APPROVED','{uid(20)}'),('{uid(25)}','P3','MEMBER',true,'APPROVED','{uid(22)}');")
    fail(ctx(normal)+f"SELECT promote_guest_player_to_member('{uid(24)}','{uid(21)}');",'MEMBER_MANAGEMENT_PERMISSION_REQUIRED')
    fail(ctx(forced)+f"SELECT promote_guest_player_to_member('{uid(24)}','{uid(21)}');",'BUSINESS_ACCESS_REQUIRED')
    run("CREATE FUNCTION fail_promotion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PROMOTE_GUEST_TO_MEMBER' THEN RAISE EXCEPTION 'INJECTED_ROLLBACK'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_promotion_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_promotion_audit();")
    fail(ctx(admin)+f"SELECT promote_guest_player_to_member('{uid(25)}','{uid(23)}');",'INJECTED_ROLLBACK')
    assert run(f"SELECT player_id='{uid(22)}' FROM profiles WHERE id='{uid(25)}';")=='t'
    assert run(f"SELECT status FROM players WHERE id='{uid(22)}';")=='ACTIVE' and run(f"SELECT player_type FROM players WHERE id='{uid(23)}';")=='GUEST'
    run("DROP TRIGGER fail_promotion_audit ON audit_logs;")
    print('PASS unauthorized/forced reject and late failure atomic rollback')

    # Actual preview -> committed partner reference -> promotion race.
    assert preview(admin,uid(25),uid(23))['blocked'] is False
    command=[psql,"-X","-w","-h","127.0.0.1","-p","55439","-U","postgres","-d",db,"-At","-v","ON_ERROR_STOP=1"]
    writer=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8',env=env)
    writer.stdin.write(f"BEGIN; INSERT INTO match_players(player_id,partner_player_id) VALUES('{anchor}','{uid(22)}'); SELECT 'REF_LOCKED'; SELECT pg_sleep(1); COMMIT;\n"); writer.stdin.close()
    while writer.stdout.readline().strip()!='REF_LOCKED':
        if writer.poll() is not None: raise AssertionError(writer.stderr.read())
    started=time.monotonic(); fail(ctx(admin)+f"SELECT promote_guest_player_to_member('{uid(25)}','{uid(23)}');",'TEMP_PLAYER_HAS_BUSINESS_DATA'); elapsed=time.monotonic()-started
    assert writer.wait(timeout=5)==0 and elapsed>=0.8
    print(f'PASS concurrent reference after preview: mutation waits {elapsed:.3f}s then blocks')
    print('PLAYER-LIFECYCLE01D LOCAL TESTS PASS')
finally:
    if created: run(f"DROP DATABASE {db} WITH (FORCE)","postgres")
