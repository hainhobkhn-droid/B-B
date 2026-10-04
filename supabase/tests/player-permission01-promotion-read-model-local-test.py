"""WP-C2 disposable PostgreSQL authorization and data-scope regression.

Uses only 127.0.0.1:55439 and creates a temporary database.
Does not connect to Supabase production.
"""

from pathlib import Path
import os
import subprocess
import time


repo = Path(__file__).resolve().parents[2]
psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
database = "wp_c2_promotion_read_" + str(time.time_ns())
migration = repo / (
    "supabase/migrations/"
    "202610040002_player_permission01_promotion_read_model.sql"
)

env = dict(os.environ, PGCLIENTENCODING="UTF8", PGCONNECT_TIMEOUT="3")


def call(sql, target=None):
    return subprocess.run(
        [
            psql, "-X", "-w", "-h", "127.0.0.1", "-p", "55439",
            "-U", "postgres", "-d", target or database, "-At",
            "-v", "ON_ERROR_STOP=1",
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
    assert result.returncode != 0, (expected, result.stdout, result.stderr)
    assert expected in result.stderr, (expected, result.stdout, result.stderr)


def uid(number):
    return f"00000000-0000-0000-0000-{number:012d}"


admin = uid(1)
both = uid(2)
members_only = uid(3)
players_only = uid(4)
lifecycle_only = uid(5)
normal = uid(6)
inactive = uid(7)
forced = uid(8)

admin_player = uid(101)
both_player = uid(102)
target_player = uid(103)
inactive_target_player = uid(104)
guest = uid(105)
linked_guest = uid(106)
inactive_guest = uid(107)

target_profile = uid(201)
linked_guest_profile = uid(202)

created = False

try:
    run(f"CREATE DATABASE {database}", "postgres")
    created = True

    run(
        f"""
        CREATE SCHEMA auth;

        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
            CREATE ROLE anon;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
            CREATE ROLE authenticated;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
            CREATE ROLE service_role;
          END IF;
        END $$;

        CREATE FUNCTION auth.uid()
        RETURNS uuid LANGUAGE sql STABLE
        AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;

        GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

        CREATE TABLE public.players(
          id uuid PRIMARY KEY,
          full_name text NOT NULL,
          player_type text NOT NULL,
          status text NOT NULL,
          current_rating numeric NOT NULL DEFAULT 4
        );

        CREATE TABLE public.profiles(
          id uuid PRIMARY KEY,
          full_name text,
          role text NOT NULL,
          is_active boolean NOT NULL,
          membership_status text NOT NULL,
          must_change_password boolean NOT NULL DEFAULT false,
          can_manage_members boolean NOT NULL DEFAULT false,
          can_manage_players boolean NOT NULL DEFAULT false,
          can_manage_player_lifecycle boolean NOT NULL DEFAULT false,
          player_id uuid UNIQUE REFERENCES public.players(id)
        );

        CREATE FUNCTION public.current_user_business_access_active()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id=auth.uid()
              AND p.is_active IS TRUE
              AND p.membership_status='APPROVED'
              AND p.must_change_password IS NOT TRUE
          )
        $$;

        CREATE FUNCTION public.current_user_is_admin()
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id=auth.uid() AND upper(p.role)='ADMIN'
          )
        $$;

        CREATE FUNCTION public.current_user_player_id()
        RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT p.player_id FROM public.profiles p WHERE p.id=auth.uid()
        $$;

        CREATE FUNCTION public.get_admin_member_promotion_preview(uuid,uuid)
        RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$ SELECT '{{"ok":true}}'::jsonb $$;

        CREATE FUNCTION public.promote_guest_player_to_member(
          p_profile_id uuid,
          p_guest_player_id uuid
        ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE target_profile public.profiles%rowtype;
        DECLARE source_guest public.players%rowtype;
        BEGIN
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE='42501';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.profiles actor
            WHERE actor.id=auth.uid()
              AND (upper(actor.role)='ADMIN' OR (
                actor.can_manage_members AND actor.can_manage_players
              ))
          ) THEN
            RAISE EXCEPTION 'MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;
          SELECT * INTO target_profile FROM public.profiles
          WHERE id=p_profile_id AND role='MEMBER' AND is_active IS TRUE;
          IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_ELIGIBLE'; END IF;
          SELECT * INTO source_guest FROM public.players
          WHERE id=p_guest_player_id AND player_type='GUEST' AND status='ACTIVE';
          IF NOT FOUND THEN RAISE EXCEPTION 'GUEST_NOT_ELIGIBLE'; END IF;
          IF EXISTS (SELECT 1 FROM public.profiles WHERE player_id=source_guest.id) THEN
            RAISE EXCEPTION 'GUEST_PLAYER_ALREADY_LINKED';
          END IF;
          RETURN jsonb_build_object('ok', true);
        END
        $$;

        INSERT INTO public.players(id,full_name,player_type,status,current_rating) VALUES
          ('{admin_player}','Admin Player','CLUB','ACTIVE',4),
          ('{both_player}','Both Player','CLUB','ACTIVE',4),
          ('{target_player}','Eligible Member Player','CLUB','ACTIVE',4.25),
          ('{inactive_target_player}','Inactive Member Player','CLUB','INACTIVE',4),
          ('{guest}','Eligible Guest','GUEST','ACTIVE',5.1),
          ('{linked_guest}','Linked Guest','GUEST','ACTIVE',4.8),
          ('{inactive_guest}','Inactive Guest','GUEST','INACTIVE',3.9);

        INSERT INTO public.profiles(
          id,full_name,role,is_active,membership_status,must_change_password,
          can_manage_members,can_manage_players,can_manage_player_lifecycle,player_id
        ) VALUES
          ('{admin}','Admin','ADMIN',true,'APPROVED',false,false,false,false,'{admin_player}'),
          ('{both}','Both','MEMBER',true,'APPROVED',false,true,true,false,'{both_player}'),
          ('{members_only}','Members only','MEMBER',true,'APPROVED',false,true,false,false,NULL),
          ('{players_only}','Players only','MEMBER',true,'APPROVED',false,false,true,false,NULL),
          ('{lifecycle_only}','Lifecycle only','MEMBER',true,'APPROVED',false,false,false,true,NULL),
          ('{normal}','Normal','MEMBER',true,'APPROVED',false,false,false,false,NULL),
          ('{inactive}','Inactive','MEMBER',false,'APPROVED',false,true,true,false,NULL),
          ('{forced}','Forced','MEMBER',true,'APPROVED',true,true,true,false,NULL),
          ('{target_profile}','Eligible Target','MEMBER',true,'APPROVED',false,false,false,false,'{target_player}'),
          ('{uid(203)}','Inactive Player Target','MEMBER',true,'APPROVED',false,false,false,false,'{inactive_target_player}'),
          ('{linked_guest_profile}','Linked Guest Profile','MEMBER',true,'APPROVED',false,false,false,false,'{linked_guest}');

        ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON public.players TO authenticated;
        CREATE POLICY iam05d_membership_gate ON public.players
          AS RESTRICTIVE FOR ALL TO authenticated
          USING ((SELECT public.current_user_business_access_active()))
          WITH CHECK ((SELECT public.current_user_business_access_active()));
        CREATE POLICY players_select_scoped ON public.players
          FOR SELECT TO authenticated
          USING (public.current_user_is_admin() OR id=public.current_user_player_id());
        """
    )

    before = run(
        """
        SELECT md5(
          pg_get_functiondef(
            'public.promote_guest_player_to_member(uuid,uuid)'::regprocedure
          ) || coalesce((
            SELECT string_agg(policyname || ':' || permissive || ':' || cmd || ':' ||
                              roles::text || ':' || coalesce(qual,'') || ':' ||
                              coalesce(with_check,''), '|' ORDER BY policyname)
            FROM pg_policies
            WHERE schemaname='public' AND tablename='players'
          ), '')
        );
        """
    )

    run(migration.read_text(encoding="utf8"))

    after = run(
        """
        SELECT md5(
          pg_get_functiondef(
            'public.promote_guest_player_to_member(uuid,uuid)'::regprocedure
          ) || coalesce((
            SELECT string_agg(policyname || ':' || permissive || ':' || cmd || ':' ||
                              roles::text || ':' || coalesce(qual,'') || ':' ||
                              coalesce(with_check,''), '|' ORDER BY policyname)
            FROM pg_policies
            WHERE schemaname='public' AND tablename='players'
          ), '')
        );
        """
    )
    assert before == after
    print("PASS direct players RLS and promotion mutation unchanged")

    def ctx(actor):
        return (
            "RESET ROLE; SET ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{actor}',false); "
        )

    read_count = "SELECT count(*) FROM public.get_guest_member_promotion_candidates();"
    assert run(ctx(admin) + read_count).splitlines()[-1] == "3"
    assert run(ctx(both) + read_count).splitlines()[-1] == "3"
    print("PASS ADMIN and BOTH-cap MEMBER candidate read")

    rows = run(
        ctx(both)
        + """
        SELECT candidate_kind || ':' || coalesce(profile_full_name, player_full_name)
        FROM public.get_guest_member_promotion_candidates()
        ORDER BY candidate_kind;
        """
    ).splitlines()
    assert rows[-3:] == [
        "GUEST_SOURCE:Eligible Guest",
        "MEMBER_TARGET:Both",
        "MEMBER_TARGET:Eligible Target",
    ], rows

    guest_row = run(
        ctx(both)
        + """
        SELECT player_type || ':' || status || ':' || current_rating
        FROM public.get_guest_member_promotion_candidates()
        WHERE candidate_kind='GUEST_SOURCE';
        """
    ).splitlines()[-1]
    assert guest_row == "GUEST:ACTIVE:5.1"
    print("PASS eligible rows and minimal projection")

    for actor, label in (
        (members_only, "members-only"),
        (players_only, "players-only"),
        (lifecycle_only, "lifecycle-only"),
        (normal, "normal MEMBER"),
    ):
        fail(ctx(actor) + read_count, "MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED")
        print(f"PASS {label} denied")

    fail(ctx(inactive) + read_count, "BUSINESS_ACCESS_REQUIRED")
    fail(ctx(forced) + read_count, "BUSINESS_ACCESS_REQUIRED")
    print("PASS inactive and forced-password actors denied")

    direct = run(ctx(both) + "SELECT string_agg(full_name, ',') FROM public.players;")
    assert direct.splitlines()[-1] == "Both Player", direct
    print("PASS delegated direct players SELECT remains own-player scoped")

    fail(
        ctx(both)
        + f"SELECT public.promote_guest_player_to_member('{target_profile}','{linked_guest}');",
        "GUEST_PLAYER_ALREADY_LINKED",
    )
    fail(
        ctx(both)
        + f"SELECT public.promote_guest_player_to_member('{target_profile}','{inactive_guest}');",
        "GUEST_NOT_ELIGIBLE",
    )
    assert (
        run(
            ctx(both)
            + f"SELECT public.promote_guest_player_to_member('{target_profile}','{guest}');"
        ).splitlines()[-1]
        == '{"ok": true}'
    )
    print("PASS promotion mutation remains final authority")

    acl = run(
        """
        SELECT
          has_function_privilege(
            'authenticated',
            'public.get_guest_member_promotion_candidates()',
            'EXECUTE'
          )
          AND NOT has_function_privilege(
            'anon',
            'public.get_guest_member_promotion_candidates()',
            'EXECUTE'
          )
          AND NOT has_function_privilege(
            'service_role',
            'public.get_guest_member_promotion_candidates()',
            'EXECUTE'
          );
        """
    )
    assert acl == "t"
    print("PASS least-privilege function ACL")
    print("WP-C2 PROMOTION READ MODEL LOCAL TESTS PASS")

finally:
    if created:
        run(f"DROP DATABASE {database} WITH (FORCE)", "postgres")
