"""ACC07B disposable PostgreSQL matrix on localhost:55439.

Synthetic catalog only. It never connects to Supabase or production.
"""

from pathlib import Path
import os
import re
import subprocess
import time


repo = Path(__file__).resolve().parents[2]
migration = repo / "supabase/migrations/202610020003_acc07b_business_access_gate.sql"
psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
database = "acc07b_test_" + str(time.time_ns())
env = dict(os.environ, PGCLIENTENCODING="UTF8", PGCONNECT_TIMEOUT="3")


def call(sql, target=None):
    return subprocess.run(
        [
            psql,
            "-X",
            "-w",
            "-h",
            "127.0.0.1",
            "-p",
            "55439",
            "-U",
            "postgres",
            "-d",
            target or database,
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        input=sql,
        encoding="utf8",
        capture_output=True,
        env=env,
        timeout=45,
    )


def run(sql, target=None):
    result = call(sql, target)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def fail(sql, message):
    result = call(sql)
    assert result.returncode != 0 and message in result.stderr, (
        result.stdout,
        result.stderr,
    )


def quoted(value):
    return "'" + value.replace("'", "''") + "'"


def context(profile_id, role="authenticated"):
    return (
        f"SET ROLE {role}; "
        f"SELECT set_config('request.jwt.claim.role','{role}',false); "
        f"SELECT set_config('request.jwt.claim.sub','{profile_id}',false); "
    )


sql_text = migration.read_text(encoding="utf8")
inventory_match = re.search(
    r"-- ACC07B_INVENTORY_BEGIN(.*?)-- ACC07B_INVENTORY_END",
    sql_text,
    re.S,
)
assert inventory_match
business_signatures = re.findall(r"'([^']+\([^']*\))'", inventory_match.group(1))
assert len(business_signatures) == 73

normal = "00000000-0000-0000-0000-000000000001"
forced = "00000000-0000-0000-0000-000000000002"
inactive = "00000000-0000-0000-0000-000000000003"
pending = "00000000-0000-0000-0000-000000000004"
rejected = "00000000-0000-0000-0000-000000000005"
player = "00000000-0000-0000-0000-000000000011"
match_id = "00000000-0000-0000-0000-000000000021"
created = False

try:
    run(f"CREATE DATABASE {database}", "postgres")
    created = True

    run(
        """
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
          SELECT current_setting('request.jwt.claim.role', true)
        $$;
        GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

        CREATE TABLE public.profiles(
          id uuid PRIMARY KEY,
          role text NOT NULL DEFAULT 'MEMBER',
          is_active boolean NOT NULL,
          membership_status text NOT NULL,
          must_change_password boolean,
          player_id uuid
        );
        CREATE TABLE public.players(
          id uuid PRIMARY KEY,
          full_name text,
          player_type text,
          current_rating numeric,
          status text
        );

        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON public.profiles TO authenticated;
        CREATE POLICY profiles_select_own ON public.profiles
          FOR SELECT TO authenticated USING (id = auth.uid());

        CREATE FUNCTION public.current_user_membership_active()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
          SELECT EXISTS(
            SELECT 1 FROM public.profiles p
            WHERE p.id=auth.uid() AND p.is_active IS TRUE
              AND p.membership_status='APPROVED'
          )
        $$;
        REVOKE ALL ON FUNCTION public.current_user_membership_active()
          FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.current_user_membership_active()
          TO authenticated;

        CREATE FUNCTION public.current_user_is_admin()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
          SELECT EXISTS(
            SELECT 1 FROM public.profiles
            WHERE id=auth.uid() AND role='ADMIN' AND is_active IS TRUE
          )
        $$;
        CREATE FUNCTION public.get_signup_rating_config()
        RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
          SELECT '{"initial_rating":4,"min_rating":2,"max_rating":8}'::jsonb
        $$;
        CREATE FUNCTION public.current_user_player_id()
        RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
          SELECT p.player_id FROM public.profiles p
          WHERE p.id=auth.uid() AND p.is_active IS TRUE LIMIT 1
        $$;
        CREATE FUNCTION public.get_player_directory()
        RETURNS TABLE(id uuid,full_name text,player_type text,current_rating numeric,status text)
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
          SELECT p.id,p.full_name,p.player_type,p.current_rating,p.status
          FROM public.players p WHERE public.current_user_membership_active()
        $$;
        CREATE FUNCTION public._review_member_signup(uuid,text,text)
        RETURNS jsonb LANGUAGE sql SECURITY DEFINER
        SET search_path = public, pg_temp AS $$ SELECT '{"success":true}'::jsonb $$;
        REVOKE ALL ON FUNCTION public._review_member_signup(uuid,text,text)
          FROM PUBLIC, anon, authenticated, service_role;
        CREATE FUNCTION public.admin_approve_member_signup(uuid)
        RETURNS jsonb LANGUAGE sql SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
          SELECT public._review_member_signup($1,'APPROVED',NULL)
        $$;
        CREATE FUNCTION public.admin_reject_member_signup(uuid,text)
        RETURNS jsonb LANGUAGE sql SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
          SELECT public._review_member_signup($1,'REJECTED',$2)
        $$;

        REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC, anon;
        REVOKE ALL ON FUNCTION public.get_signup_rating_config() FROM PUBLIC, anon;
        REVOKE ALL ON FUNCTION public.current_user_player_id() FROM PUBLIC, anon;
        REVOKE ALL ON FUNCTION public.get_player_directory() FROM PUBLIC, anon;
        REVOKE ALL ON FUNCTION public.admin_approve_member_signup(uuid) FROM PUBLIC, anon;
        REVOKE ALL ON FUNCTION public.admin_reject_member_signup(uuid,text) FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.current_user_is_admin(),
          public.get_signup_rating_config(), public.current_user_player_id(),
          public.get_player_directory(), public.admin_approve_member_signup(uuid),
          public.admin_reject_member_signup(uuid,text) TO authenticated;
        """
    )

    tables = [
        "leagues",
        "tournaments",
        "fund_obligation_campaigns",
        "tournament_registrations",
        "tournament_payments",
        "rating_settings",
        "fund_rules",
        "rating_match_weights",
        "matches",
        "rating_events",
        "fund_payments",
        "fund_transactions",
        "match_players",
        "fund_contributions",
    ]
    for table in tables:
        run(f"CREATE TABLE public.{table}(id uuid PRIMARY KEY);")

    for table in ["players", *tables]:
        run(
            f"""
            ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;
            GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated;
            CREATE POLICY fixture_allow ON public.{table}
              FOR ALL TO authenticated USING (true) WITH CHECK (true);
            CREATE POLICY iam05d_membership_gate ON public.{table} AS RESTRICTIVE
              FOR ALL TO authenticated
              USING ((SELECT public.current_user_membership_active()))
              WITH CHECK ((SELECT public.current_user_membership_active()));
            """
        )

    for signature in business_signatures:
        run(
            f"""
            CREATE FUNCTION public.{signature}
            RETURNS void LANGUAGE plpgsql SECURITY DEFINER
            SET search_path = public, pg_temp AS $$
            BEGIN
              NULL;
            END
            $$;
            REVOKE ALL ON FUNCTION public.{signature} FROM PUBLIC, anon;
            GRANT EXECUTE ON FUNCTION public.{signature} TO authenticated;
            """
        )

    run(
        """
        CREATE FUNCTION public.get_forced_password_change_readiness_internal(uuid)
        RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
          SELECT jsonb_build_object('ready',true,'profile_id',$1)
        $$;
        CREATE FUNCTION public.complete_forced_password_change_internal(uuid)
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp AS $$
        BEGIN
          IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
          UPDATE public.profiles SET must_change_password=false WHERE id=$1;
          RETURN jsonb_build_object('success',true,'profile_id',$1,'must_change_password',false);
        END $$;
        REVOKE ALL ON FUNCTION public.get_forced_password_change_readiness_internal(uuid),
          public.complete_forced_password_change_internal(uuid)
          FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.get_forced_password_change_readiness_internal(uuid),
          public.complete_forced_password_change_internal(uuid) TO service_role;
        """
    )

    run(
        f"""
        INSERT INTO public.players VALUES
          ('{player}','Player fixture','CLUB',4,'ACTIVE');
        INSERT INTO public.matches VALUES ('{match_id}');
        INSERT INTO public.profiles(id,role,is_active,membership_status,must_change_password,player_id) VALUES
          ('{normal}','MEMBER',true,'APPROVED',false,'{player}'),
          ('{forced}','MEMBER',true,'APPROVED',true,'{player}'),
          ('{inactive}','MEMBER',false,'APPROVED',false,'{player}'),
          ('{pending}','MEMBER',false,'PENDING',false,'{player}'),
          ('{rejected}','MEMBER',false,'REJECTED',false,'{player}');
        """
    )

    policy_target = "players"
    baseline_policy = f"""
        DROP POLICY iam05d_membership_gate ON public.{policy_target};
        CREATE POLICY iam05d_membership_gate ON public.{policy_target} AS RESTRICTIVE
          FOR ALL TO authenticated
          USING ((SELECT public.current_user_membership_active()))
          WITH CHECK ((SELECT public.current_user_membership_active()));
    """

    def assert_policy_drift(mutation, drift_name):
        run(mutation)
        result = call(sql_text)
        assert result.returncode != 0, drift_name
        assert "ACC07B_POLICY_CONTRACT_DRIFT: players" in result.stderr, (
            drift_name,
            result.stdout,
            result.stderr,
        )
        assert run(
            "SELECT to_regprocedure("
            "'public.current_user_business_access_active()') IS NULL"
        ) == "t", drift_name
        assert run(
            """
            SELECT
              pg_get_expr(pol.polqual,pol.polrelid)
                LIKE '%current_user_membership_active%'
              AND pg_get_expr(pol.polqual,pol.polrelid)
                NOT LIKE '%current_user_business_access_active%'
            FROM pg_policy pol
            JOIN pg_class cls ON cls.oid=pol.polrelid
            JOIN pg_namespace ns ON ns.oid=cls.relnamespace
            WHERE ns.nspname='public' AND cls.relname='leagues'
              AND pol.polname='iam05d_membership_gate'
            """
        ) == "t", drift_name
        run(baseline_policy)

    assert_policy_drift(
        f"""
        DROP POLICY iam05d_membership_gate ON public.{policy_target};
        CREATE POLICY iam05d_membership_gate ON public.{policy_target} AS RESTRICTIVE
          FOR SELECT TO authenticated
          USING ((SELECT public.current_user_membership_active()));
        """,
        "policy command drift",
    )
    assert_policy_drift(
        f"ALTER POLICY iam05d_membership_gate ON public.{policy_target} TO anon;",
        "policy role drift",
    )
    assert_policy_drift(
        f"""
        ALTER POLICY iam05d_membership_gate ON public.{policy_target}
          USING (true) WITH CHECK (true);
        """,
        "policy expression drift",
    )
    print("PASS policy contract drift: command, role and expression fail closed with full rollback")

    preserved = {
        name: run(f"SELECT md5(pg_get_functiondef('{name}'::regprocedure))")
        for name in [
            "public.current_user_is_admin()",
            "public.current_user_membership_active()",
            "public.get_signup_rating_config()",
            "public.get_forced_password_change_readiness_internal(uuid)",
            "public.complete_forced_password_change_internal(uuid)",
        ]
    }

    run(sql_text)

    assert run(
        "SELECT has_function_privilege('authenticated',"
        "'public.current_user_business_access_active()','EXECUTE')"
    ) == "t"
    for role in ["anon", "public"]:
        assert run(
            f"SELECT has_function_privilege('{role}',"
            "'public.current_user_business_access_active()','EXECUTE')"
        ) == "f"

    assert run(
        """
        SELECT count(*) FROM pg_policy pol
        JOIN pg_class cls ON cls.oid=pol.polrelid
        JOIN pg_namespace ns ON ns.oid=cls.relnamespace
        WHERE ns.nspname='public' AND pol.polname='iam05d_membership_gate'
          AND pol.polpermissive IS FALSE
          AND pg_get_expr(pol.polqual,pol.polrelid)
              LIKE '%current_user_business_access_active%'
          AND pg_get_expr(pol.polwithcheck,pol.polrelid)
              LIKE '%current_user_business_access_active%'
        """
    ) == "15"

    signature_array = ",".join(quoted(item) for item in business_signatures)
    assert run(
        f"""
        SELECT count(*) FROM unnest(ARRAY[{signature_array}]::text[]) sig
        WHERE position('-- ACC07B business access gate' IN
          pg_get_functiondef(to_regprocedure('public.'||sig))) > 0
        """
    ) == "73"

    for signature in [
        "admin_approve_member_signup(uuid)",
        "admin_reject_member_signup(uuid,text)",
        "current_user_player_id()",
        "get_player_directory()",
    ]:
        assert "current_user_business_access_active" in run(
            f"SELECT pg_get_functiondef('public.{signature}'::regprocedure)"
        )

    for name, before in preserved.items():
        assert run(f"SELECT md5(pg_get_functiondef('{name}'::regprocedure))") == before

    print("PASS inventory: 73 PL/pgSQL + 4 SQL business RPCs gated; bootstrap/service paths unchanged")

    states = [
        (normal, True),
        (forced, False),
        (inactive, False),
        (pending, False),
        (rejected, False),
    ]
    for profile_id, allowed in states:
        prefix = context(profile_id)
        assert run(prefix + "SELECT count(*) FROM public.profiles WHERE id=auth.uid();").splitlines()[-1] == "1"
        business_count = run(prefix + "SELECT count(*) FROM public.matches;").splitlines()[-1]
        assert business_count == ("1" if allowed else "0")
        player_id = run(prefix + "SELECT coalesce(public.current_user_player_id()::text,'<NULL>');").splitlines()[-1]
        assert player_id == (player if allowed else "<NULL>")
        directory_count = run(prefix + "SELECT count(*) FROM public.get_player_directory();").splitlines()[-1]
        assert directory_count == ("1" if allowed else "0")
        if allowed:
            run(prefix + "SELECT public.get_member_matches();")
        else:
            fail(prefix + "SELECT public.get_member_matches();", "BUSINESS_ACCESS_REQUIRED")
            fail(
                prefix
                + "INSERT INTO public.matches VALUES "
                + "('10000000-0000-0000-0000-000000000000');",
                "row-level security policy",
            )

    print("PASS five-state matrix: own bootstrap allowed; direct business read/write and definer RPC gated")

    assert run(
        context(forced, "service_role")
        + f"SELECT public.get_forced_password_change_readiness_internal('{forced}')->>'ready';"
    ).splitlines()[-1] == "true"
    run(
        context(forced, "service_role")
        + f"SELECT public.complete_forced_password_change_internal('{forced}');"
    )
    assert run(
        context(forced) + "SELECT count(*) FROM public.matches;"
    ).splitlines()[-1] == "1"
    run(context(forced) + "SELECT public.get_member_matches();")
    print("PASS service-role readiness/completion preserved; access restored after flag clear")

    rating_definition = run(
        "SELECT pg_get_functiondef('public.get_member_rating_events()'::regprocedure)"
    )
    assert "-- ACC07B business access gate" in rating_definition
    assert "ACC07B forced-password business gate applied" in run(
        "SELECT obj_description('public.get_member_rating_events()'::regprocedure)"
    )
    print("PASS rating-events forced-password gate only; data-scope issue remains explicitly separate")

    print("PASS ACC07B forward-only migration parsed/executed on disposable PostgreSQL")
finally:
    if created:
        run(f"DROP DATABASE {database} WITH (FORCE)", "postgres")
