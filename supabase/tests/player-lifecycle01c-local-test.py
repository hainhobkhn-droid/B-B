"""Disposable localhost PLAYER-LIFECYCLE01C PostgreSQL/concurrency matrix."""
from pathlib import Path
import os
import subprocess
import time


repo = Path(__file__).resolve().parents[2]
migrations = [
    repo / "supabase/migrations/202610030001_player_lifecycle01a_reference_inventory.sql",
    repo / "supabase/migrations/202610030002_player_lifecycle01b_status_transition.sql",
    repo / "supabase/migrations/202610030003_player_lifecycle01c_conditional_hard_delete.sql",
]
psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
database = "player_lifecycle01c_" + str(time.time_ns())
env = dict(os.environ, PGCLIENTENCODING="UTF8", PGCONNECT_TIMEOUT="3")


def call(sql, target=None, timeout=45):
    return subprocess.run(
        [psql, "-X", "-w", "-h", "127.0.0.1", "-p", "55439",
         "-U", "postgres", "-d", target or database, "-At",
         "-v", "ON_ERROR_STOP=1"], input=sql, encoding="utf8",
        capture_output=True, env=env, timeout=timeout,
    )


def run(sql, target=None):
    result = call(sql, target)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def fail(sql, expected, detail=None):
    result = call(sql)
    assert result.returncode != 0 and expected in result.stderr, (
        result.stdout, result.stderr,
    )
    if detail:
        assert detail in result.stderr, result.stderr


def uid(number):
    return f"00000000-0000-0000-0000-{number:012d}"


admin, manager, normal, forced = uid(1), uid(2), uid(3), uid(4)
anchor = uid(9)
created = False

try:
    run(f"CREATE DATABASE {database}", "postgres")
    created = True
    run(
        f"""
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
        CREATE TABLE players(
          id uuid PRIMARY KEY, full_name text NOT NULL,
          player_type text NOT NULL DEFAULT 'CLUB'
            CHECK(player_type=ANY(ARRAY['CLUB'::text,'GUEST'::text])),
          phone text, email text, initial_rating numeric NOT NULL DEFAULT 4,
          current_rating numeric NOT NULL DEFAULT 4,
          status text NOT NULL DEFAULT 'ACTIVE' CONSTRAINT players_status_check
            CHECK(status=ANY(ARRAY['ACTIVE'::text,'INACTIVE'::text])),
          joined_at date, date_of_birth date, notes text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE profiles(
          id uuid PRIMARY KEY, role text NOT NULL, is_active boolean NOT NULL,
          membership_status text NOT NULL, must_change_password boolean NOT NULL DEFAULT false,
          can_manage_members boolean NOT NULL DEFAULT false,
          player_id uuid REFERENCES players(id) ON DELETE SET NULL
        );
        CREATE TABLE match_players(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,partner_player_id uuid);
        CREATE TABLE rating_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
        CREATE TABLE rating_adjustments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
        CREATE TABLE rating_adjustment_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
        CREATE TABLE fund_contributions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
        CREATE TABLE fund_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
        CREATE TABLE fund_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid REFERENCES players(id));
        CREATE TABLE tournament_registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,partner_player_id uuid REFERENCES players(id) ON DELETE RESTRICT);
        CREATE TABLE tournament_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
        CREATE TABLE awards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT);
        CREATE TABLE audit_logs(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid REFERENCES profiles(id), action text NOT NULL,
          table_name text, record_id uuid, old_data jsonb, new_data jsonb,
          reason text, created_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE players ENABLE ROW LEVEL SECURITY;
        ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON players,match_players TO authenticated;
        CREATE FUNCTION current_user_business_access_active() RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
          SELECT EXISTS(SELECT 1 FROM profiles p WHERE p.id=auth.uid()
            AND p.is_active IS TRUE AND p.membership_status='APPROVED'
            AND p.must_change_password IS NOT TRUE)
        $$;
        REVOKE ALL ON FUNCTION current_user_business_access_active() FROM PUBLIC,anon;
        GRANT EXECUTE ON FUNCTION current_user_business_access_active() TO authenticated;
        CREATE FUNCTION update_player(uuid,text,text,text,text,text,date,date,text)
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
        DECLARE v_status text; BEGIN
          IF NOT current_user_business_access_active() THEN RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'; END IF;
          UPDATE players SET status = v_status WHERE false;
          INSERT INTO audit_logs(action,table_name,record_id,reason) VALUES('UPDATE_PLAYER','players',gen_random_uuid(),'PLAYER_WRITE_API_V1');
          RETURN '{{}}'::jsonb; END $$;
        INSERT INTO players(id,full_name) VALUES('{anchor}','Anchor');
        INSERT INTO profiles(id,role,is_active,membership_status,must_change_password,can_manage_members) VALUES
          ('{admin}','ADMIN',true,'APPROVED',false,false),
          ('{manager}','MEMBER',true,'APPROVED',false,true),
          ('{normal}','MEMBER',true,'APPROVED',false,false),
          ('{forced}','ADMIN',true,'APPROVED',true,false);
        """
    )
    for migration in migrations:
        run(migration.read_text(encoding="utf8"))

    def context(user_id):
        return ("SET ROLE authenticated; "
                f"SELECT set_config('request.jwt.claim.sub','{user_id}',false); ")

    def add_player(number, status="ACTIVE"):
        player_id = uid(number)
        run(f"INSERT INTO players(id,full_name,status,initial_rating,current_rating) VALUES('{player_id}','Player {number}','{status}',4.25,4.75);")
        return player_id

    def delete_sql(player_id, reason="fixture delete", actor=admin):
        return context(actor) + f"SELECT delete_player_if_unreferenced('{player_id}','{reason}');"

    active = add_player(100)
    run(f"INSERT INTO audit_logs(user_id,action,table_name,record_id,reason) VALUES('{admin}','UPDATE_PLAYER','players','{active}','old audit');")
    result = run(delete_sql(active, "  clean duplicate  ")).splitlines()[-1]
    assert '"deleted": true' in result and '"reason": "clean duplicate"' in result
    assert run(f"SELECT count(*) FROM players WHERE id='{active}';") == "0"
    assert run(f"SELECT count(*) FROM audit_logs WHERE record_id='{active}' AND action='UPDATE_PLAYER';") == "1"
    assert run(f"SELECT count(*) FROM audit_logs WHERE record_id='{active}' AND action='PLAYER_HARD_DELETED' AND old_data->>'full_name'='Player 100' AND old_data->>'status'='ACTIVE' AND reason='clean duplicate' AND created_at IS NOT NULL;") == "1"
    tombstone = run(f"SELECT id FROM audit_logs WHERE record_id='{active}' AND action='PLAYER_HARD_DELETED';")
    assert tombstone and tombstone in result

    inactive = add_player(101, "INACTIVE")
    assert '"deleted": true' in run(delete_sql(inactive))
    assert run(f"SELECT count(*) FROM players WHERE id='{inactive}';") == "0"
    assert run(f"SELECT count(*) FROM profiles WHERE id='{admin}';") == "1"
    print("PASS ACTIVE/INACTIVE zero-reference delete / tombstone / old audit/account retained")

    for number, actor, error in [
        (102, manager, "ADMIN_REQUIRED"), (103, normal, "ADMIN_REQUIRED"),
        (104, forced, "BUSINESS_ACCESS_REQUIRED"),
    ]:
        player_id = add_player(number)
        fail(delete_sql(player_id, actor=actor), error)
        assert run(f"SELECT count(*) FROM players WHERE id='{player_id}';") == "1"
    fail(context(admin) + "SELECT delete_player_if_unreferenced(NULL,'x');", "PLAYER_ID_REQUIRED")
    fail(delete_sql(uid(999)), "PLAYER_NOT_FOUND")
    validation = add_player(105)
    fail(delete_sql(validation, "   "), "REASON_REQUIRED_MAX_1000")
    fail(delete_sql(validation, "x" * 1001), "REASON_REQUIRED_MAX_1000")
    print("PASS ADMIN-only / delegated+normal+forced reject / validation")

    cases = [
        (110, "profile_link_count", lambda p: run(f"INSERT INTO profiles(id,role,is_active,membership_status,player_id) VALUES('{uid(210)}','MEMBER',true,'APPROVED','{p}');")),
        (111, "match_players_player_count", lambda p: run(f"INSERT INTO match_players(player_id) VALUES('{p}');")),
        (112, "match_players_partner_count", lambda p: run(f"INSERT INTO match_players(player_id,partner_player_id) VALUES('{anchor}','{p}');")),
        (113, "rating_events_count", lambda p: run(f"INSERT INTO rating_events(player_id) VALUES('{p}');")),
        (114, "rating_adjustments_count", lambda p: run(f"INSERT INTO rating_adjustments(player_id) VALUES('{p}');")),
        (115, "rating_adjustment_events_count", lambda p: run(f"INSERT INTO rating_adjustment_events(player_id) VALUES('{p}');")),
        (116, "fund_contributions_count", lambda p: run(f"INSERT INTO fund_contributions(player_id) VALUES('{p}');")),
        (117, "fund_payments_count", lambda p: run(f"INSERT INTO fund_payments(player_id) VALUES('{p}');")),
        (118, "fund_transactions_count", lambda p: run(f"INSERT INTO fund_transactions(player_id) VALUES('{p}');")),
        (119, "tournament_registrations_player_count", lambda p: run(f"INSERT INTO tournament_registrations(player_id) VALUES('{p}');")),
        (120, "tournament_registrations_partner_count", lambda p: run(f"INSERT INTO tournament_registrations(player_id,partner_player_id) VALUES('{anchor}','{p}');")),
        (121, "tournament_payments_count", lambda p: run(f"INSERT INTO tournament_payments(player_id) VALUES('{p}');")),
        (122, "awards_count", lambda p: run(f"INSERT INTO awards(player_id) VALUES('{p}');")),
    ]
    for number, key, insert in cases:
        player_id = add_player(number)
        insert(player_id)
        fail(delete_sql(player_id), "PLAYER_HAS_REFERENCES", f'"{key}": 1')
        assert run(f"SELECT count(*) FROM players WHERE id='{player_id}';") == "1"
    print("PASS exact blocking inventory, including match/tournament partner-only")

    after_preview = add_player(130)
    assert run(context(admin) + f"SELECT get_player_lifecycle_preview('{after_preview}')->>'reference_total';").splitlines()[-1] == "0"
    run(f"INSERT INTO rating_events(player_id) VALUES('{after_preview}');")
    fail(delete_sql(after_preview), "PLAYER_HAS_REFERENCES", '"rating_events_count": 1')
    assert run("SELECT count(*) FROM rating_events WHERE player_id=" + f"'{after_preview}';") == "1"
    print("PASS preview-zero then new reference -> authoritative recheck blocks")

    command = [psql,"-X","-w","-h","127.0.0.1","-p","55439","-U","postgres","-d",database,"-At","-v","ON_ERROR_STOP=1"]
    raced = add_player(131)
    deleter = subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding="utf8",env=env)
    deleter.stdin.write("BEGIN; " + delete_sql(raced,"race delete") + " SELECT 'DELETED_LOCKED'; SELECT pg_sleep(1); COMMIT;\n")
    deleter.stdin.close()
    while deleter.stdout.readline().strip() != "DELETED_LOCKED":
        if deleter.poll() is not None: raise AssertionError(deleter.stderr.read())
    started = time.monotonic()
    insert_result = call(f"INSERT INTO match_players(player_id,partner_player_id) VALUES('{anchor}','{raced}');")
    elapsed = time.monotonic() - started
    assert deleter.wait(timeout=5) == 0, deleter.stderr.read()
    assert elapsed >= 0.8 and insert_result.returncode != 0
    assert "foreign key constraint" in insert_result.stderr
    assert run(f"SELECT count(*) FROM match_players WHERE partner_player_id='{raced}';") == "0"
    print(f"PASS delete lock vs partner-only insert: waits {elapsed:.3f}s then FK rejects; no orphan")

    double = add_player(132)
    first = subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding="utf8",env=env)
    first.stdin.write("BEGIN; " + delete_sql(double,"first delete") + " SELECT 'FIRST_LOCKED'; SELECT pg_sleep(1); COMMIT;\n")
    first.stdin.close()
    while first.stdout.readline().strip() != "FIRST_LOCKED":
        if first.poll() is not None: raise AssertionError(first.stderr.read())
    started = time.monotonic()
    fail(delete_sql(double,"second delete"), "PLAYER_NOT_FOUND")
    elapsed = time.monotonic() - started
    assert first.wait(timeout=5) == 0, first.stderr.read()
    assert elapsed >= 0.8
    assert run(f"SELECT count(*) FROM audit_logs WHERE record_id='{double}' AND action='PLAYER_HARD_DELETED';") == "1"
    print(f"PASS concurrent double-delete: second waits {elapsed:.3f}s then PLAYER_NOT_FOUND")

    assert run("SELECT has_table_privilege('authenticated','players','DELETE');") == "f"
    assert run("SELECT has_function_privilege('authenticated','public.delete_player_if_unreferenced(uuid,text)','EXECUTE');") == "t"
    assert run("SELECT has_function_privilege('anon','public.delete_player_if_unreferenced(uuid,text)','EXECUTE');") == "f"
    assert run("SELECT count(*) FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] WHERE c.contype='f' AND c.conrelid='match_players'::regclass AND c.confrelid='players'::regclass AND a.attname='partner_player_id' AND c.confdeltype='r';") == "1"
    print("PASS grants / partner FK race guard / no direct authenticated DELETE")
    print("PLAYER-LIFECYCLE01C LOCAL TESTS PASS")
finally:
    if created:
        run(f"DROP DATABASE {database} WITH (FORCE)", "postgres")
