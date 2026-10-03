"""Disposable localhost RATING-INITIAL01B PostgreSQL test matrix.

Synthetic schema only. It never connects to Supabase or production.
"""
from pathlib import Path
import os
import subprocess
import time


repo = Path(__file__).resolve().parents[2]
migration = repo / "supabase/migrations/202610030005_rating_initial01b_pre_history_edit.sql"
psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
database = "rating_initial01b_" + str(time.time_ns())
env = dict(os.environ, PGCLIENTENCODING="UTF8", PGCONNECT_TIMEOUT="3")


def call(sql, target=None, timeout=45):
    return subprocess.run(
        [psql, "-X", "-w", "-h", "127.0.0.1", "-p", "55439",
         "-U", "postgres", "-d", target or database, "-At",
         "-v", "ON_ERROR_STOP=1"],
        input=sql, encoding="utf8", capture_output=True, env=env, timeout=timeout,
    )


def run(sql, target=None):
    result = call(sql, target)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def fail(sql, expected):
    result = call(sql)
    assert result.returncode != 0 and expected in result.stderr, (
        result.stdout, result.stderr,
    )
    return result


def uid(number):
    return f"00000000-0000-0000-0000-{number:012d}"


admin, manager, normal, forced = uid(1), uid(2), uid(3), uid(4)
target, other = uid(10), uid(11)
created = False


try:
    source = migration.read_text(encoding="utf8")
    assert not source.startswith("\ufeff") and "\ufffd" not in source
    for forbidden in (
        "CREATE OR REPLACE FUNCTION public.create_player",
        "CREATE OR REPLACE FUNCTION public.handle_new_member_signup",
        "CREATE OR REPLACE FUNCTION public.promote_guest_player_to_member",
        "CREATE OR REPLACE FUNCTION public.rebuild_ratings_active",
        "CREATE OR REPLACE FUNCTION public.record_rating_adjustment_active",
        "CREATE OR REPLACE FUNCTION public.correct_rating_adjustment_active",
    ):
        assert forbidden not in source

    run(f"CREATE DATABASE {database}", "postgres")
    created = True
    run(
        f"""
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

        CREATE TABLE public.players(
          id uuid PRIMARY KEY,
          full_name text NOT NULL,
          player_type text NOT NULL DEFAULT 'CLUB',
          initial_rating numeric NOT NULL DEFAULT 4
            CHECK (initial_rating >= 2 AND initial_rating <= 8),
          current_rating numeric NOT NULL DEFAULT 4
            CHECK (current_rating >= 2 AND current_rating <= 8),
          status text NOT NULL DEFAULT 'ACTIVE',
          notes text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE public.profiles(
          id uuid PRIMARY KEY,
          role text NOT NULL,
          is_active boolean NOT NULL,
          membership_status text NOT NULL,
          must_change_password boolean NOT NULL DEFAULT false,
          can_manage_members boolean NOT NULL DEFAULT false,
          player_id uuid REFERENCES public.players(id)
        );
        CREATE TABLE public.rating_settings(
          id bigint PRIMARY KEY,
          algorithm_version text NOT NULL,
          initial_rating numeric NOT NULL,
          min_rating numeric NOT NULL,
          max_rating numeric NOT NULL,
          is_active boolean NOT NULL
        );
        CREATE TABLE public.rating_match_weights(
          match_type text PRIMARY KEY,
          weight numeric NOT NULL
        );
        CREATE TABLE public.matches(
          id uuid PRIMARY KEY,
          status text NOT NULL,
          match_type text NOT NULL
        );
        CREATE TABLE public.match_players(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          match_id uuid NOT NULL REFERENCES public.matches(id),
          player_id uuid NOT NULL REFERENCES public.players(id),
          partner_player_id uuid REFERENCES public.players(id)
        );
        CREATE TABLE public.rating_events(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          player_id uuid NOT NULL REFERENCES public.players(id)
        );
        CREATE TABLE public.rating_adjustments(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          player_id uuid NOT NULL REFERENCES public.players(id)
        );
        CREATE TABLE public.audit_logs(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid,
          action text NOT NULL,
          table_name text,
          record_id uuid,
          old_data jsonb,
          new_data jsonb,
          reason text,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.rating_events ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.rating_match_weights ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON public.players, public.rating_events,
          public.rating_match_weights, public.matches, public.match_players
          TO authenticated;

        CREATE FUNCTION public.current_user_business_access_active()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path TO 'public', 'pg_temp' AS $$
          SELECT EXISTS(
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active IS TRUE
              AND p.membership_status = 'APPROVED'
              AND p.must_change_password IS NOT TRUE
          )
        $$;
        REVOKE ALL ON FUNCTION public.current_user_business_access_active()
          FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.current_user_business_access_active()
          TO authenticated;

        CREATE FUNCTION public._rebuild_ratings_internal(text, uuid)
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
        SET search_path TO 'public', 'pg_temp' AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(726184501);
          RETURN '{{}}'::jsonb;
        END $$;

        CREATE FUNCTION public.test_engine_initial(uuid)
        RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
        SET search_path TO 'public', 'pg_temp' AS $$
        DECLARE v_rating numeric;
        BEGIN
          PERFORM pg_advisory_xact_lock(726184501);
          SELECT initial_rating INTO v_rating FROM public.players WHERE id=$1;
          RETURN v_rating;
        END $$;

        INSERT INTO public.rating_settings
          (id,algorithm_version,initial_rating,min_rating,max_rating,is_active)
        VALUES (3,'V1.1',4,2,8,true);
        INSERT INTO public.rating_match_weights(match_type,weight)
        VALUES ('CLUB_RATED',0.9),('TRAINING',0);
        INSERT INTO public.players(id,full_name,initial_rating,current_rating,notes)
        VALUES
          ('{target}','Target',4,4,'preserve me'),
          ('{other}','Other',4,4,'other');
        INSERT INTO public.profiles(
          id,role,is_active,membership_status,must_change_password,
          can_manage_members,player_id
        ) VALUES
          ('{admin}','ADMIN',true,'APPROVED',false,false,NULL),
          ('{manager}','MEMBER',true,'APPROVED',false,true,NULL),
          ('{normal}','MEMBER',true,'APPROVED',false,false,'{target}'),
          ('{forced}','ADMIN',true,'APPROVED',true,false,NULL);
        """
    )
    run(source)
    run(source)
    print("PASS forward-only migration is repeatable on matching contract")

    def context(user_id):
        return (
            "SET ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{user_id}',false); "
        )

    def edit(user_id, rating, reason="fixture reason", player=target):
        value = "NULL" if rating is None else str(rating)
        output = run(
            context(user_id)
            + f"SELECT set_player_initial_rating_before_history('{player}',{value},'{reason}');"
        )
        return output.splitlines()[-1]

    def clear_history():
        run("TRUNCATE rating_events,match_players,matches CASCADE;")

    def add_match(number, status, match_type="CLUB_RATED", player=target):
        match_id = uid(100 + number)
        run(
            f"INSERT INTO matches(id,status,match_type) VALUES"
            f"('{match_id}','{status}','{match_type}');"
            f"INSERT INTO match_players(match_id,player_id) VALUES"
            f"('{match_id}','{player}');"
        )
        return match_id

    assert run(f"SELECT player_has_approved_rated_history('{target}');") == "f"
    add_match(1, "APPROVED")
    assert run(f"SELECT player_has_approved_rated_history('{target}');") == "t"
    clear_history()
    add_match(2, "APPROVED", "TRAINING")
    assert run(f"SELECT player_has_approved_rated_history('{target}');") == "f"
    clear_history()
    partner_match = uid(199)
    run(
        f"INSERT INTO matches(id,status,match_type) VALUES"
        f"('{partner_match}','APPROVED','CLUB_RATED');"
        f"INSERT INTO match_players(match_id,player_id,partner_player_id) VALUES"
        f"('{partner_match}','{other}','{target}');"
    )
    assert run(f"SELECT player_has_approved_rated_history('{target}');") == "f"
    for index, status in enumerate(("PENDING", "INVALID", "VOIDED"), start=3):
        clear_history()
        add_match(index, status)
        assert run(f"SELECT player_has_approved_rated_history('{target}');") == "f"
    clear_history()
    run(f"INSERT INTO rating_events(player_id) VALUES('{target}');")
    assert run(f"SELECT player_has_approved_rated_history('{target}');") == "t"
    run("UPDATE rating_match_weights SET weight=0 WHERE match_type='CLUB_RATED';")
    assert run(f"SELECT player_has_approved_rated_history('{target}');") == "t"
    run("UPDATE rating_match_weights SET weight=0.9 WHERE match_type='CLUB_RATED';")
    clear_history()
    print("PASS authoritative history eligibility matrix")

    before_profile = run(f"SELECT player_id FROM profiles WHERE id='{normal}';")
    result = edit(admin, 4.75, "  corrected intake assessment  ")
    assert '"changed": true' in result and '"new_initial_rating": 4.75' in result
    assert run(f"SELECT initial_rating||'|'||current_rating FROM players WHERE id='{target}';") == "4.75|4.75"
    assert run(f"SELECT notes||'|'||status FROM players WHERE id='{target}';") == "preserve me|ACTIVE"
    assert run(f"SELECT player_id FROM profiles WHERE id='{normal}';") == before_profile
    assert run("SELECT count(*) FROM rating_events;") == "0"
    assert run("SELECT count(*) FROM rating_adjustments;") == "0"
    assert run(
        f"SELECT user_id='{admin}' AND table_name='players' AND record_id='{target}' "
        "AND old_data->>'initial_rating'='4' "
        "AND old_data->>'current_rating'='4' "
        "AND new_data->>'initial_rating'='4.75' "
        "AND new_data->>'current_rating'='4.75' "
        "AND new_data->>'rating_settings_version'='V1.1' "
        "AND new_data->>'changed_at' IS NOT NULL "
        "AND reason='corrected intake assessment' AND created_at IS NOT NULL "
        "FROM audit_logs WHERE action='PLAYER_INITIAL_RATING_CHANGED';"
    ) == "t"
    print("PASS atomic mutation / preservation / audit contract")

    audit_count = run("SELECT count(*) FROM audit_logs WHERE action='PLAYER_INITIAL_RATING_CHANGED';")
    result = edit(admin, 4.75, "same value")
    assert '"changed": false' in result
    assert run("SELECT count(*) FROM audit_logs WHERE action='PLAYER_INITIAL_RATING_CHANGED';") == audit_count
    print("PASS same-value no-op / no audit")

    fail(context(manager) + f"SELECT set_player_initial_rating_before_history('{target}',4.5,'x');", "ADMIN_REQUIRED")
    fail(context(normal) + f"SELECT set_player_initial_rating_before_history('{target}',4.5,'x');", "ADMIN_REQUIRED")
    fail(context(forced) + f"SELECT set_player_initial_rating_before_history('{target}',4.5,'x');", "BUSINESS_ACCESS_REQUIRED")
    print("PASS ADMIN-only / delegated rejected / MEMBER rejected / forced-password gate")

    fail(context(admin) + "SELECT set_player_initial_rating_before_history(NULL,4.5,'x');", "PLAYER_ID_REQUIRED")
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{uid(999)}',4.5,'x');", "PLAYER_NOT_FOUND")
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',NULL,'x');", "PLAYER_RATING_REQUIRED")
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',1.99,'x');", "PLAYER_RATING_OUT_OF_RANGE")
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',8.01,'x');", "PLAYER_RATING_OUT_OF_RANGE")
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',4.5,'   ');", "REASON_REQUIRED_MAX_1000")
    long_reason = "x" * 1001
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',4.5,'{long_reason}');", "REASON_REQUIRED_MAX_1000")
    run("UPDATE rating_settings SET min_rating=1;")
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',4.5,'x');", "RATING_ACTIVE_SETTINGS_HARD_RANGE_CONFLICT")
    drift = call(source)
    assert drift.returncode != 0 and "RATING_INITIAL_ACTIVE_SETTINGS_HARD_RANGE_CONFLICT" in drift.stderr
    run("UPDATE rating_settings SET min_rating=2;")
    print("PASS validation / hard-range config fail-closed")

    run(f"UPDATE players SET initial_rating=4.75,current_rating=4.5 WHERE id='{target}';")
    inconsistent = fail(
        context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',4.25,'x');",
        "PLAYER_RATING_STATE_INCONSISTENT",
    )
    assert "old_initial_rating=4.75" in inconsistent.stderr
    assert "old_current_rating=4.5" in inconsistent.stderr
    run(f"UPDATE players SET initial_rating=4,current_rating=4 WHERE id='{target}';")
    add_match(20, "APPROVED")
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',4.25,'x');", "PLAYER_RATING_HISTORY_EXISTS")
    assert run(f"SELECT initial_rating||'|'||current_rating FROM players WHERE id='{target}';") == "4|4"
    clear_history()
    print("PASS inconsistent state and Rated history block without mutation")

    command = [psql, "-X", "-w", "-h", "127.0.0.1", "-p", "55439",
               "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1"]

    locker = subprocess.Popen(
        command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf8", env=env,
    )
    locker.stdin.write("BEGIN; SELECT pg_advisory_xact_lock(726184501); SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;\n")
    locker.stdin.close()
    while locker.stdout.readline().strip() != "LOCKED":
        if locker.poll() is not None:
            raise AssertionError(locker.stderr.read())
    started = time.monotonic()
    edit(admin, 4.25, "wait for engine")
    elapsed = time.monotonic() - started
    assert locker.wait(timeout=5) == 0, locker.stderr.read()
    assert elapsed >= 0.8, elapsed
    print(f"PASS edit waits on engine advisory lock ({elapsed:.3f}s)")

    history_writer = subprocess.Popen(
        command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf8", env=env,
    )
    late_match = uid(130)
    history_writer.stdin.write(
        "BEGIN; SELECT pg_advisory_xact_lock(726184501); "
        f"INSERT INTO matches(id,status,match_type) VALUES('{late_match}','APPROVED','CLUB_RATED'); "
        f"INSERT INTO match_players(match_id,player_id) VALUES('{late_match}','{target}'); "
        "SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;\n"
    )
    history_writer.stdin.close()
    while history_writer.stdout.readline().strip() != "LOCKED":
        if history_writer.poll() is not None:
            raise AssertionError(history_writer.stderr.read())
    started = time.monotonic()
    blocked = call(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',4.5,'late');")
    elapsed = time.monotonic() - started
    assert history_writer.wait(timeout=5) == 0, history_writer.stderr.read()
    assert blocked.returncode != 0 and "PLAYER_RATING_HISTORY_EXISTS" in blocked.stderr
    assert elapsed >= 0.8, elapsed
    clear_history()
    print("PASS committed Rated history is recomputed after lock and blocks edit")

    editor = subprocess.Popen(
        command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf8", env=env,
    )
    editor.stdin.write(
        "BEGIN; " + context(admin)
        + f"SELECT set_player_initial_rating_before_history('{target}',4.5,'edit first'); "
        + "SELECT 'EDITED'; SELECT pg_sleep(1); COMMIT;\n"
    )
    editor.stdin.close()
    while editor.stdout.readline().strip() != "EDITED":
        if editor.poll() is not None:
            raise AssertionError(editor.stderr.read())
    started = time.monotonic()
    engine_value = run(f"SELECT test_engine_initial('{target}');")
    elapsed = time.monotonic() - started
    assert editor.wait(timeout=5) == 0, editor.stderr.read()
    assert engine_value == "4.5" and elapsed >= 0.8, (engine_value, elapsed)
    print("PASS edit commits first; subsequent engine lock observes new initial")

    before = run(f"SELECT initial_rating||'|'||current_rating FROM players WHERE id='{target}';")
    run("CREATE FUNCTION reject_initial_rating_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PLAYER_INITIAL_RATING_CHANGED' THEN RAISE EXCEPTION 'INJECTED_AUDIT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_initial_rating_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_initial_rating_audit();")
    fail(context(admin) + f"SELECT set_player_initial_rating_before_history('{target}',4.75,'rollback');", "INJECTED_AUDIT_FAILURE")
    assert run(f"SELECT initial_rating||'|'||current_rating FROM players WHERE id='{target}';") == before
    run("DROP TRIGGER reject_initial_rating_audit ON audit_logs; DROP FUNCTION reject_initial_rating_audit();")
    print("PASS mutation and audit rollback atomically")

    assert run("SELECT has_function_privilege('authenticated','public.set_player_initial_rating_before_history(uuid,numeric,text)','EXECUTE');") == "t"
    assert run("SELECT has_function_privilege('anon','public.set_player_initial_rating_before_history(uuid,numeric,text)','EXECUTE');") == "f"
    assert run("SELECT has_function_privilege('service_role','public.set_player_initial_rating_before_history(uuid,numeric,text)','EXECUTE');") == "f"
    assert run("SELECT has_function_privilege('authenticated','public.player_has_approved_rated_history(uuid)','EXECUTE');") == "f"
    assert run("SELECT has_table_privilege('authenticated','public.players','UPDATE');") == "f"
    print("PASS helper/RPC grants / no direct players UPDATE")

    run("GRANT UPDATE ON players TO authenticated;")
    drift = call(source)
    assert drift.returncode != 0 and "RATING_INITIAL_DIRECT_PLAYER_UPDATE_GRANT_DETECTED" in drift.stderr
    run("REVOKE UPDATE ON players FROM authenticated;")
    run("CREATE OR REPLACE FUNCTION _rebuild_ratings_internal(text,uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$ BEGIN RETURN '{}'::jsonb; END $$;")
    drift = call(source)
    assert drift.returncode != 0 and "RATING_INITIAL_ENGINE_LOCK_CONTRACT_DRIFT" in drift.stderr
    print("PASS migration preflight rejects privilege and engine-lock drift")

    print("RATING-INITIAL01B LOCAL TESTS PASS")
finally:
    if created:
        run(f"DROP DATABASE {database} WITH (FORCE)", "postgres")
