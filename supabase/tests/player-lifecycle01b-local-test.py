"""Disposable localhost PLAYER-LIFECYCLE01B PostgreSQL test matrix.

Synthetic schema only. It never connects to Supabase or production.
"""
from pathlib import Path
import os
import subprocess
import time


repo = Path(__file__).resolve().parents[2]
migration_a = repo / "supabase/migrations/202610030001_player_lifecycle01a_reference_inventory.sql"
migration_b = repo / "supabase/migrations/202610030002_player_lifecycle01b_status_transition.sql"
psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
database = "player_lifecycle01b_" + str(time.time_ns())
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


def uid(number):
    return f"00000000-0000-0000-0000-{number:012d}"


admin, manager, normal, forced = uid(1), uid(2), uid(3), uid(4)
target, other = uid(10), uid(11)
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

        CREATE TABLE public.players(
          id uuid PRIMARY KEY,
          full_name text NOT NULL,
          player_type text NOT NULL DEFAULT 'CLUB'
            CHECK (player_type = ANY (ARRAY['CLUB'::text, 'GUEST'::text])),
          phone text,
          email text,
          initial_rating numeric NOT NULL DEFAULT 4,
          current_rating numeric NOT NULL DEFAULT 4,
          status text NOT NULL DEFAULT 'ACTIVE'
            CONSTRAINT players_status_check
            CHECK (status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])),
          joined_at date,
          date_of_birth date,
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
          player_id uuid REFERENCES public.players(id) ON DELETE SET NULL
        );
        CREATE TABLE public.match_players(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
          partner_player_id uuid
        );
        CREATE TABLE public.rating_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT);
        CREATE TABLE public.rating_adjustments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT);
        CREATE TABLE public.rating_adjustment_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT);
        CREATE TABLE public.fund_contributions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT);
        CREATE TABLE public.fund_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT);
        CREATE TABLE public.fund_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid REFERENCES public.players(id));
        CREATE TABLE public.tournament_registrations(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
          partner_player_id uuid REFERENCES public.players(id) ON DELETE RESTRICT
        );
        CREATE TABLE public.tournament_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT);
        CREATE TABLE public.awards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT);
        CREATE TABLE public.audit_logs(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid,
          action text NOT NULL,
          table_name text NOT NULL,
          record_id uuid NOT NULL,
          old_data jsonb,
          new_data jsonb,
          reason text,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON public.players, public.match_players TO authenticated;

        CREATE FUNCTION public.current_user_business_access_active()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
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

        CREATE FUNCTION public.update_player(uuid,text,text,text,text,text,date,date,text)
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
        DECLARE v_status text;
        BEGIN
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED';
          END IF;
          UPDATE public.players SET status = v_status WHERE false;
          INSERT INTO public.audit_logs(action,table_name,record_id,reason)
            VALUES('UPDATE_PLAYER','players',gen_random_uuid(),'PLAYER_WRITE_API_V1');
          RETURN '{{}}'::jsonb;
        END $$;

        INSERT INTO public.players(id, full_name, initial_rating, current_rating)
        VALUES ('{target}', 'Target', 4.25, 4.75), ('{other}', 'Other', 4, 4);
        INSERT INTO public.profiles(
          id, role, is_active, membership_status,
          must_change_password, can_manage_members
        ) VALUES
          ('{admin}', 'ADMIN', true, 'APPROVED', false, false),
          ('{manager}', 'MEMBER', true, 'APPROVED', false, true),
          ('{normal}', 'MEMBER', true, 'APPROVED', false, false),
          ('{forced}', 'ADMIN', true, 'APPROVED', true, false);
        """
    )
    run(migration_a.read_text(encoding="utf8"))
    run(migration_b.read_text(encoding="utf8"))

    def context(user_id):
        return (
            "SET ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{user_id}',false); "
        )

    def transition(user_id, status, reason="fixture reason"):
        output = run(
            context(user_id)
            + f"SELECT set_player_lifecycle_status('{target}','{status}','{reason}');"
        )
        return output.splitlines()[-1]

    result = transition(admin, "INACTIVE", "  planned pause  ")
    assert '"changed": true' in result and '"old_status": "ACTIVE"' in result
    assert run(f"SELECT status FROM players WHERE id='{target}';") == "INACTIVE"
    assert run(
        f"SELECT user_id='{admin}' AND table_name='players' AND record_id='{target}' "
        "AND old_data->>'status'='ACTIVE' AND new_data->>'status'='INACTIVE' "
        "AND reason='planned pause' AND created_at IS NOT NULL "
        "FROM audit_logs WHERE action='PLAYER_STATUS_CHANGED';"
    ) == "t"
    print("PASS ACTIVE -> INACTIVE / trimmed reason / audit contract")

    result = transition(manager, "ACTIVE", "return to play")
    assert '"changed": true' in result and '"old_status": "INACTIVE"' in result
    assert run(f"SELECT status FROM players WHERE id='{target}';") == "ACTIVE"
    print("PASS delegated manager INACTIVE -> ACTIVE")

    before = run("SELECT count(*) FROM audit_logs WHERE action='PLAYER_STATUS_CHANGED';")
    result = transition(admin, "ACTIVE", "same status")
    assert '"changed": false' in result
    assert run("SELECT count(*) FROM audit_logs WHERE action='PLAYER_STATUS_CHANGED';") == before
    print("PASS same-status deterministic no-op / no audit append")

    fail(context(admin) + f"SELECT set_player_lifecycle_status('{target}','PAUSED','x');", "PLAYER_STATUS_INVALID")
    fail(context(admin) + f"SELECT set_player_lifecycle_status('{target}','INACTIVE','   ');", "REASON_REQUIRED_MAX_1000")
    fail(context(admin) + f"SELECT set_player_lifecycle_status('{uid(999)}','INACTIVE','x');", "PLAYER_NOT_FOUND")
    fail(context(normal) + f"SELECT set_player_lifecycle_status('{target}','INACTIVE','x');", "MEMBER_MANAGEMENT_PERMISSION_REQUIRED")
    fail(context(forced) + f"SELECT set_player_lifecycle_status('{target}','INACTIVE','x');", "BUSINESS_ACCESS_REQUIRED")
    print("PASS invalid status / empty reason / nonexistent / unauthorized / forced-password")

    run(
        f"UPDATE players SET status='ACTIVE' WHERE id='{target}'; "
        f"UPDATE profiles SET player_id='{target}' WHERE id='{normal}'; "
        f"INSERT INTO rating_events(player_id) VALUES('{target}'); "
        f"INSERT INTO match_players(player_id,partner_player_id) VALUES('{other}','{target}');"
    )
    preserved = run(
        f"SELECT concat_ws('|',initial_rating,current_rating,full_name,player_type,updated_at) "
        f"FROM players WHERE id='{target}';"
    )
    transition(admin, "INACTIVE", "has history")
    assert run("SELECT count(*) FROM rating_events;") == "1"
    assert run("SELECT count(*) FROM match_players;") == "1"
    assert run(f"SELECT player_id='{target}' FROM profiles WHERE id='{normal}';") == "t"
    assert run(
        f"SELECT concat_ws('|',initial_rating,current_rating,full_name,player_type,updated_at) "
        f"FROM players WHERE id='{target}';"
    ) == preserved
    assert int(run(f"SELECT player_reference_snapshot('{target}')->>'reference_total';")) >= 3
    print("PASS references do not block INACTIVE / history, rating, profile link preserved")

    update_call = (
        f"SELECT update_player('{target}','Renamed','CLUB',NULL,NULL,"
        "'{status}',NULL,NULL,NULL);"
    )
    fail(context(admin) + update_call.format(status="ACTIVE"), "PLAYER_STATUS_CHANGE_REQUIRES_LIFECYCLE_RPC")
    assert run(f"SELECT status FROM players WHERE id='{target}';") == "INACTIVE"
    run(context(admin) + update_call.format(status="INACTIVE"))
    assert run(f"SELECT full_name||'|'||status FROM players WHERE id='{target}';") == "Renamed|INACTIVE"
    assert run(
        "SELECT reason FROM audit_logs WHERE action='UPDATE_PLAYER' "
        "ORDER BY created_at DESC LIMIT 1;"
    ) == "PLAYER_WRITE_API_V2_METADATA_ONLY"
    print("PASS update_player metadata compatibility / lifecycle bypass blocked")

    # Two same-target writers serialize on FOR UPDATE. The second sees the
    # committed state and returns a no-op, leaving exactly one transition audit.
    run(f"UPDATE players SET status='ACTIVE' WHERE id='{target}'; DELETE FROM audit_logs WHERE action='PLAYER_STATUS_CHANGED';")
    command = [psql, "-X", "-w", "-h", "127.0.0.1", "-p", "55439",
               "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1"]
    first = subprocess.Popen(
        command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf8", env=env,
    )
    first.stdin.write(
        "BEGIN; " + context(admin)
        + f"SELECT set_player_lifecycle_status('{target}','INACTIVE','first'); "
        + "SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;\n"
    )
    first.stdin.close()
    while first.stdout.readline().strip() != "LOCKED":
        if first.poll() is not None:
            raise AssertionError(first.stderr.read())
    started = time.monotonic()
    second = transition(manager, "INACTIVE", "second")
    elapsed = time.monotonic() - started
    assert first.wait(timeout=5) == 0, first.stderr.read()
    assert elapsed >= 0.8, elapsed
    assert '"changed": false' in second
    assert run("SELECT count(*) FROM audit_logs WHERE action='PLAYER_STATUS_CHANGED';") == "1"
    print(f"PASS concurrent transitions serialized ({elapsed:.3f}s) / one audit")

    assert run(
        "SELECT has_function_privilege('authenticated',"
        "'public.set_player_lifecycle_status(uuid,text,text)','EXECUTE');"
    ) == "t"
    assert run(
        "SELECT has_function_privilege('anon',"
        "'public.set_player_lifecycle_status(uuid,text,text)','EXECUTE');"
    ) == "f"
    assert run(
        "SELECT has_table_privilege('authenticated','public.players','UPDATE');"
    ) == "f"
    assert run(
        "SELECT has_function_privilege('authenticated',"
        "'public.update_player(uuid,text,text,text,text,text,date,date,text)','EXECUTE');"
    ) == "t"
    assert run(
        "SELECT has_function_privilege('anon',"
        "'public.update_player(uuid,text,text,text,text,text,date,date,text)','EXECUTE');"
    ) == "f"
    print("PASS RPC grants / update_player authenticated-only / no direct players UPDATE grant")

    print("PLAYER-LIFECYCLE01B LOCAL TESTS PASS")
finally:
    if created:
        run(f"DROP DATABASE {database} WITH (FORCE)", "postgres")
