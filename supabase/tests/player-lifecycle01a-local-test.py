"""Disposable localhost PLAYER-LIFECYCLE01A PostgreSQL test matrix.

Synthetic schema only. It never connects to Supabase or production.
"""
from pathlib import Path
import os
import subprocess
import time


repo = Path(__file__).resolve().parents[2]
migration = repo / "supabase/migrations/202610030001_player_lifecycle01a_reference_inventory.sql"
psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
database = "player_lifecycle01a_" + str(time.time_ns())
env = dict(os.environ, PGCLIENTENCODING="UTF8", PGCONNECT_TIMEOUT="3")


def call(sql, target=None):
    return subprocess.run(
        [psql, "-X", "-w", "-h", "127.0.0.1", "-p", "55439",
         "-U", "postgres", "-d", target or database, "-At",
         "-v", "ON_ERROR_STOP=1"],
        input=sql, encoding="utf8", capture_output=True, env=env, timeout=45,
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


admin = uid(1)
manager = uid(2)
normal = uid(3)
forced = uid(4)
target = uid(10)
other = uid(11)
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
          initial_rating numeric NOT NULL DEFAULT 4,
          current_rating numeric NOT NULL DEFAULT 4,
          status text NOT NULL DEFAULT 'ACTIVE'
            CONSTRAINT players_status_check
            CHECK (status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text]))
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
          table_name text NOT NULL,
          record_id uuid NOT NULL
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

        INSERT INTO public.players(id, full_name) VALUES
          ('{target}', 'Target'), ('{other}', 'Other');
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
    run(migration.read_text(encoding="utf8"))

    def as_user(user_id, sql):
        return run(
            f"SET ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{user_id}',false); {sql}"
        ).splitlines()[-1]

    assert as_user(
        admin,
        f"SELECT get_player_lifecycle_preview('{target}')->>'reference_total';",
    ) == "0"
    assert as_user(
        manager,
        f"SELECT get_player_lifecycle_preview('{target}')->>'hard_delete_allowed';",
    ) == "true"
    print("PASS empty inventory / ADMIN and delegated manager preview")

    fail(
        f"SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{normal}',false); "
        f"SELECT get_player_lifecycle_preview('{target}');",
        "MEMBER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    fail(
        f"SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{forced}',false); "
        f"SELECT get_player_lifecycle_preview('{target}');",
        "BUSINESS_ACCESS_REQUIRED",
    )
    fail(
        f"SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{admin}',false); "
        f"SELECT get_player_lifecycle_preview('{uid(999)}');",
        "PLAYER_NOT_FOUND",
    )
    print("PASS unauthorized / forced-password / nonexistent Player")

    run(f"INSERT INTO profiles VALUES('{uid(20)}','MEMBER',true,'APPROVED',false,false,'{target}');")
    assert run(f"SELECT player_reference_snapshot('{target}')->>'profile_link_count';") == "1"

    run(f"INSERT INTO match_players(player_id) VALUES('{target}');")
    run(f"INSERT INTO match_players(player_id,partner_player_id) VALUES('{other}','{target}');")
    assert run(f"SELECT player_reference_snapshot('{target}')->>'match_players_player_count';") == "1"
    assert run(f"SELECT player_reference_snapshot('{target}')->>'match_players_partner_count';") == "1"
    assert run(f"SELECT player_reference_snapshot('{target}')->>'match_players_count';") == "2"

    run(f"INSERT INTO tournament_registrations(player_id) VALUES('{target}');")
    run(f"INSERT INTO tournament_registrations(player_id,partner_player_id) VALUES('{other}','{target}');")
    assert run(f"SELECT player_reference_snapshot('{target}')->>'tournament_registrations_player_count';") == "1"
    assert run(f"SELECT player_reference_snapshot('{target}')->>'tournament_registrations_partner_count';") == "1"
    assert run(f"SELECT player_reference_snapshot('{target}')->>'tournament_registrations_count';") == "2"

    for table in ["rating_events", "rating_adjustments", "rating_adjustment_events",
                  "fund_contributions", "fund_payments", "fund_transactions",
                  "tournament_payments", "awards"]:
        run(f"INSERT INTO {table}(player_id) VALUES('{target}');")

    snapshot = run(
        f"SELECT concat_ws('|',"
        f"player_reference_snapshot('{target}')->>'rating_events_count',"
        f"player_reference_snapshot('{target}')->>'rating_adjustments_count',"
        f"player_reference_snapshot('{target}')->>'rating_adjustment_events_count',"
        f"player_reference_snapshot('{target}')->>'fund_contributions_count',"
        f"player_reference_snapshot('{target}')->>'fund_payments_count',"
        f"player_reference_snapshot('{target}')->>'fund_transactions_count',"
        f"player_reference_snapshot('{target}')->>'tournament_payments_count',"
        f"player_reference_snapshot('{target}')->>'awards_count');"
    )
    assert snapshot == "1|1|1|1|1|1|1|1", snapshot
    assert run(f"SELECT player_reference_snapshot('{target}')->>'reference_total';") == "13"
    print("PASS profile / match primary+partner / tournament primary+partner / rating / fund / awards")

    # One row occupying both slots is one referenced row in reference_total.
    run(f"INSERT INTO match_players(player_id,partner_player_id) VALUES('{target}','{target}');")
    run(f"INSERT INTO tournament_registrations(player_id,partner_player_id) VALUES('{target}','{target}');")
    assert run(f"SELECT player_reference_snapshot('{target}')->>'match_players_count';") == "3"
    assert run(f"SELECT player_reference_snapshot('{target}')->>'tournament_registrations_count';") == "3"
    assert run(f"SELECT player_reference_snapshot('{target}')->>'reference_total';") == "15"
    print("PASS duplicate slot references counted by referenced row, without total double-count")

    run(f"INSERT INTO audit_logs(table_name,record_id) VALUES('players','{target}'),('players','{target}');")
    assert run(f"SELECT player_reference_snapshot('{target}')->>'audit_log_count';") == "2"
    assert run(f"SELECT player_reference_snapshot('{target}')->>'reference_total';") == "15"
    assert run(f"SELECT player_reference_snapshot('{target}')->>'audit_logs_blocking';") == "false"
    print("PASS audit metadata reported separately and non-blocking")

    helper_acl = run(
        "SELECT coalesce(array_to_string(proacl,','),'') FROM pg_proc "
        "WHERE oid='public.player_reference_snapshot(uuid)'::regprocedure;"
    )
    assert not any(item.startswith("=X/") for item in helper_acl.split(",")), helper_acl
    for role in ["anon", "authenticated", "service_role"]:
        assert run(
            f"SELECT has_function_privilege('{role}',"
            "'public.player_reference_snapshot(uuid)','EXECUTE');"
        ) == "f"
    assert run(
        "SELECT has_function_privilege('authenticated',"
        "'public.get_player_lifecycle_preview(uuid)','EXECUTE');"
    ) == "t"
    assert run(
        "SELECT has_function_privilege('anon',"
        "'public.get_player_lifecycle_preview(uuid)','EXECUTE');"
    ) == "f"
    print("PASS helper isolation and preview grants")

    print("PLAYER-LIFECYCLE01A LOCAL TESTS PASS")
finally:
    if created:
        run(f"DROP DATABASE {database} WITH (FORCE)", "postgres")
