"""Disposable localhost regression for RATING-SCOPE01.

Synthetic PostgreSQL only. It never connects to Supabase or production.
"""

from pathlib import Path
import ast
import base64
import os
import subprocess
import time


repo = Path(__file__).resolve().parents[2]
migration = (
    repo
    / "supabase/migrations/202610040001_rating_scope01_member_rating_events_own_player.sql"
)
psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
database = "rating_scope01_" + str(time.time_ns())
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


def fail(sql, expected):
    result = call(sql)
    assert result.returncode != 0 and expected in result.stderr, (
        result.stdout,
        result.stderr,
    )


def context(profile_id, role="authenticated"):
    return (
        f"SET ROLE {role}; "
        f"SELECT set_config('request.jwt.claim.role','{role}',false); "
        f"SELECT set_config('request.jwt.claim.sub','{profile_id}',false); "
    )


def uid(number):
    return f"00000000-0000-0000-0000-{number:012d}"


source = migration.read_text(encoding="utf8")
ast.parse(Path(__file__).read_text(encoding="utf8"))
assert not source.startswith("\ufeff") and "\ufffd" not in source
assert "p_player_id" not in source
assert "where re.player_id = public.current_user_player_id()" in source.lower()

member_a = uid(1)
member_b = uid(2)
no_player = uid(3)
forced = uid(4)
inactive = uid(5)
pending = uid(6)
rejected = uid(7)
admin = uid(8)
player_a = uid(101)
player_b = uid(102)
match_1 = uid(201)
match_2 = uid(202)
match_3 = uid(203)
created = False


production_definition_base64 = (
    "Q1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gcHVibGljLmdldF9tZW1iZXJfcmF0aW5nX2V2"
    "ZW50cygpCiBSRVRVUk5TIFRBQkxFKHBsYXllcl9pZCB1dWlkLCBtYXRjaF9pZCB1dWlkLCBh"
    "bGdvcml0aG1fdmVyc2lvbiB0ZXh0LCByYXRpbmdfYmVmb3JlIG51bWVyaWMsIHJhdGluZ19k"
    "ZWx0YSBudW1lcmljLCByYXRpbmdfYWZ0ZXIgbnVtZXJpYywgY3JlYXRlZF9hdCB0aW1lc3Rh"
    "bXAgd2l0aCB0aW1lIHpvbmUpCiBMQU5HVUFHRSBwbHBnc3FsCiBTRUNVUklUWSBERUZJTkVS"
    "CiBTRVQgc2VhcmNoX3BhdGggVE8gJ3B1YmxpYycsICdwZ190ZW1wJwpBUyAkZnVuY3Rpb24k"
    "DQpiZWdpbg0KICAgIC0tIEFDQzA3QiBidXNpbmVzcyBhY2Nlc3MgZ2F0ZQogICAgSUYgTk9U"
    "IHB1YmxpYy5jdXJyZW50X3VzZXJfYnVzaW5lc3NfYWNjZXNzX2FjdGl2ZSgpIFRIRU4KICAg"
    "ICAgICBSQUlTRSBFWENFUFRJT04gJ0JVU0lORVNTX0FDQ0VTU19SRVFVSVJFRCcgVVNJTkcg"
    "RVJSQ09ERSA9ICc0MjUwMSc7CiAgICBFTkQgSUY7CiAgICBpZiBhdXRoLnVpZCgpIGlzIG51"
    "bGwgdGhlbg0KICAgICAgICByYWlzZSBleGNlcHRpb24gJ0FVVEhfUkVRVUlSRUQnOw0KICAg"
    "IGVuZCBpZjsNCg0KICAgIGlmIG5vdCBleGlzdHMgKA0KICAgICAgICBzZWxlY3QgMQ0KICAg"
    "ICAgICBmcm9tIHB1YmxpYy5wcm9maWxlcyBwDQogICAgICAgIHdoZXJlIHAuaWQgPSBhdXRo"
    "LnVpZCgpDQogICAgICAgICAgYW5kIHAuaXNfYWN0aXZlID0gdHJ1ZQ0KICAgICAgICAgIGFu"
    "ZCBwLnJvbGUgPSAnTUVNQkVSJw0KICAgICkgdGhlbg0KICAgICAgICByYWlzZSBleGNlcHRp"
    "b24gJ01FTUJFUl9SRVFVSVJFRCc7DQogICAgZW5kIGlmOw0KDQogICAgcmV0dXJuIHF1ZXJ5"
    "DQogICAgc2VsZWN0DQogICAgICAgIHJlLnBsYXllcl9pZCwNCiAgICAgICAgcmUubWF0Y2hf"
    "aWQsDQogICAgICAgIHJlLmFsZ29yaXRobV92ZXJzaW9uLA0KICAgICAgICByZS5yYXRpbmdf"
    "YmVmb3JlLA0KICAgICAgICByZS5yYXRpbmdfZGVsdGEsDQogICAgICAgIHJlLnJhdGluZ19h"
    "ZnRlciwNCiAgICAgICAgcmUuY3JlYXRlZF9hdA0KICAgIGZyb20gcHVibGljLnJhdGluZ19l"
    "dmVudHMgcmUNCiAgICBvcmRlciBieQ0KICAgICAgICByZS5jcmVhdGVkX2F0IGFzYywNCiAg"
    "ICAgICAgcmUuaWQgYXNjOw0KZW5kOw0KJGZ1bmN0aW9uJAo="
)
production_definition = base64.b64decode(
    production_definition_base64
).decode("utf8")


try:
    run(f"CREATE DATABASE {database}", "postgres")
    created = True

    run(
        f"""
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        GRANT USAGE ON SCHEMA auth TO authenticated, service_role;

        CREATE TABLE public.profiles(
          id uuid PRIMARY KEY,
          role text NOT NULL,
          is_active boolean NOT NULL,
          membership_status text NOT NULL,
          must_change_password boolean,
          player_id uuid
        );
        CREATE TABLE public.rating_events(
          id uuid PRIMARY KEY,
          player_id uuid NOT NULL,
          match_id uuid,
          algorithm_version text NOT NULL,
          rating_before numeric NOT NULL,
          rating_delta numeric NOT NULL,
          rating_after numeric NOT NULL,
          created_at timestamptz NOT NULL
        );

        ALTER TABLE public.rating_events ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON public.rating_events TO authenticated;

        CREATE FUNCTION public.current_user_business_access_active()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path TO 'public', 'pg_temp' AS $$
          SELECT EXISTS(
            SELECT 1 FROM public.profiles p
            WHERE p.id=auth.uid()
              AND p.is_active IS TRUE
              AND p.membership_status='APPROVED'
              AND p.must_change_password IS NOT TRUE
          )
        $$;
        ALTER FUNCTION public.current_user_business_access_active() OWNER TO postgres;
        REVOKE ALL ON FUNCTION public.current_user_business_access_active()
          FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.current_user_business_access_active()
          TO authenticated, service_role;

        CREATE FUNCTION public.current_user_player_id()
        RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path TO 'public', 'pg_temp' AS $$
          SELECT p.player_id
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND public.current_user_business_access_active()
          LIMIT 1
        $$;
        ALTER FUNCTION public.current_user_player_id() OWNER TO postgres;
        REVOKE ALL ON FUNCTION public.current_user_player_id()
          FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.current_user_player_id()
          TO authenticated, service_role;

        CREATE FUNCTION public.current_user_is_admin()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path TO 'public', 'pg_temp' AS $$
          SELECT EXISTS(
            SELECT 1 FROM public.profiles p
            WHERE p.id=auth.uid() AND p.role='ADMIN' AND p.is_active IS TRUE
          )
        $$;
        REVOKE ALL ON FUNCTION public.current_user_is_admin()
          FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.current_user_is_admin()
          TO authenticated;

        CREATE POLICY iam05d_membership_gate
          ON public.rating_events AS RESTRICTIVE
          FOR ALL TO authenticated
          USING ((SELECT public.current_user_business_access_active()))
          WITH CHECK ((SELECT public.current_user_business_access_active()));
        CREATE POLICY rating_events_admin_select
          ON public.rating_events FOR SELECT TO authenticated
          USING (public.current_user_is_admin());

        INSERT INTO public.profiles
          (id,role,is_active,membership_status,must_change_password,player_id)
        VALUES
          ('{member_a}','MEMBER',true,'APPROVED',false,'{player_a}'),
          ('{member_b}','MEMBER',true,'APPROVED',false,'{player_b}'),
          ('{no_player}','MEMBER',true,'APPROVED',false,NULL),
          ('{forced}','MEMBER',true,'APPROVED',true,'{player_a}'),
          ('{inactive}','MEMBER',false,'APPROVED',false,'{player_a}'),
          ('{pending}','MEMBER',false,'PENDING',false,'{player_a}'),
          ('{rejected}','MEMBER',false,'REJECTED',false,'{player_a}'),
          ('{admin}','ADMIN',true,'APPROVED',false,NULL);

        INSERT INTO public.rating_events
          (id,player_id,match_id,algorithm_version,rating_before,
           rating_delta,rating_after,created_at)
        VALUES
          ('{uid(301)}','{player_a}','{match_1}','V1.1',4,0.1,4.1,'2026-01-01'),
          ('{uid(302)}','{player_a}','{match_2}','V1.1',4.1,-0.05,4.05,'2026-01-02'),
          ('{uid(303)}','{player_b}','{match_3}','V1.1',4,0.2,4.2,'2026-01-03');
        """
    )

    run(production_definition)
    run(
        "ALTER FUNCTION public.get_member_rating_events() OWNER TO postgres;"
        "REVOKE ALL ON FUNCTION public.get_member_rating_events() FROM PUBLIC,anon;"
        "GRANT EXECUTE ON FUNCTION public.get_member_rating_events() "
        "TO authenticated,service_role;"
    )
    baseline_hash = run(
        "SELECT md5(pg_get_functiondef("
        "'public.get_member_rating_events()'::regprocedure));"
    )
    assert baseline_hash == "b35ca37f9ec0b2a7a75c33b403cf36ef", baseline_hash

    run(source)
    print("PASS migration applies to exact production definition")

    output_a = run(
        context(member_a)
        + "SELECT player_id||'|'||match_id FROM get_member_rating_events();"
    ).splitlines()
    own_rows_a = [line for line in output_a if line.startswith(player_a)]
    assert len(own_rows_a) == 2
    assert all(player_b not in line for line in output_a)
    assert own_rows_a[0].endswith(match_1) and own_rows_a[1].endswith(match_2)
    print("PASS MEMBER A receives multiple own historical events only")

    output_b = run(
        context(member_b)
        + "SELECT player_id||'|'||match_id FROM get_member_rating_events();"
    ).splitlines()
    own_rows_b = [line for line in output_b if line.startswith(player_b)]
    assert own_rows_b == [f"{player_b}|{match_3}"]
    assert all(player_a not in line for line in output_b)
    print("PASS MEMBER B scope is isolated from MEMBER A")

    assert run(
        context(no_player) + "SELECT count(*) FROM get_member_rating_events();"
    ).splitlines()[-1] == "0"
    print("PASS active MEMBER without a linked Player receives an empty set")

    for profile_id in (forced, inactive, pending, rejected):
        fail(
            context(profile_id) + "SELECT * FROM get_member_rating_events();",
            "BUSINESS_ACCESS_REQUIRED",
        )
    fail(
        context(admin) + "SELECT * FROM get_member_rating_events();",
        "MEMBER_REQUIRED",
    )
    print("PASS ACC07B state gate and MEMBER-specific role contract preserved")

    assert run(
        context(member_a) + "SELECT count(*) FROM public.rating_events;"
    ).splitlines()[-1] == "0"
    assert run(
        context(admin) + "SELECT count(*) FROM public.rating_events;"
    ).splitlines()[-1] == "3"
    print("PASS direct rating_events RLS remains ADMIN-only")

    assert run(
        "SELECT prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp'] "
        "AND pronargs=0 FROM pg_proc WHERE oid="
        "'public.get_member_rating_events()'::regprocedure;"
    ) == "t"
    assert run(
        "SELECT has_function_privilege('authenticated',"
        "'public.get_member_rating_events()','EXECUTE') "
        "AND has_function_privilege('service_role',"
        "'public.get_member_rating_events()','EXECUTE') "
        "AND NOT has_function_privilege('anon',"
        "'public.get_member_rating_events()','EXECUTE') "
        "AND NOT has_function_privilege('public',"
        "'public.get_member_rating_events()','EXECUTE');"
    ) == "t"
    assert run(
        "SELECT count(*) FROM pg_policy pol "
        "JOIN pg_class cls ON cls.oid=pol.polrelid "
        "WHERE cls.oid='public.rating_events'::regclass "
        "AND pol.polname IN ('iam05d_membership_gate',"
        "'rating_events_admin_select');"
    ) == "2"
    print("PASS SECURITY DEFINER, fixed search_path, zero-argument API, ACL and RLS")

    drift = call(
        "CREATE OR REPLACE FUNCTION public.get_member_rating_events() "
        "RETURNS TABLE(player_id uuid,match_id uuid,algorithm_version text,"
        "rating_before numeric,rating_delta numeric,rating_after numeric,"
        "created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER "
        "SET search_path=public,pg_temp AS $$ BEGIN RETURN; END $$;"
        + source
    )
    assert drift.returncode != 0
    assert "RATING_SCOPE01_PRODUCTION_SOURCE_DRIFT" in drift.stderr
    print("PASS source drift fails closed with migration rollback")

    print("PASS RATING-SCOPE01 disposable PostgreSQL regression")
finally:
    if created:
        run(f"DROP DATABASE {database} WITH (FORCE)", "postgres")
