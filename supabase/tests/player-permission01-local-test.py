"""PLAYER-PERMISSION01 disposable localhost PostgreSQL authorization tests.

Uses only 127.0.0.1:55439 and creates a temporary database.
Does not connect to Supabase production.
"""

from pathlib import Path
import os
import subprocess
import time

repo = Path(__file__).resolve().parents[2]

psql = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
database = "player_permission01_" + str(time.time_ns())

migrations = [
    repo / "supabase/migrations/202610030006_player_permission01a_capability_schema.sql",
    repo / "supabase/migrations/202610030007_player_permission01b_account_capability_reset.sql",
    repo / "supabase/migrations/202610030008_player_permission01c_player_rpc_authorization.sql",
    repo / "supabase/migrations/202610030009_player_permission01d_player_management_directory.sql",
]

env = dict(
    os.environ,
    PGCLIENTENCODING="UTF8",
    PGCONNECT_TIMEOUT="3",
)


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
    assert result.returncode != 0, (
        "expected failure",
        expected,
        result.stdout,
        result.stderr,
    )
    assert expected in result.stderr, (
        expected,
        result.stdout,
        result.stderr,
    )


def uid(number):
    return f"00000000-0000-0000-0000-{number:012d}"


admin = uid(1)
member_only = uid(2)
player_only = uid(3)
lifecycle_only = uid(4)
member_player = uid(5)
player_lifecycle = uid(6)
normal = uid(7)
forced = uid(8)

target_player = uid(100)
guest_player = uid(101)

created = False

try:
    run(f"CREATE DATABASE {database}", "postgres")
    created = True

    # Minimal production-contract fixture.
    run(
        f"""
        CREATE SCHEMA auth;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname='anon'
          ) THEN
            CREATE ROLE anon;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname='authenticated'
          ) THEN
            CREATE ROLE authenticated;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname='service_role'
          ) THEN
            CREATE ROLE service_role;
          END IF;
        END $$;

        CREATE FUNCTION auth.uid()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        AS $$
          SELECT nullif(
            current_setting('request.jwt.claim.sub', true),
            ''
          )::uuid
        $$;

        GRANT USAGE ON SCHEMA auth
        TO anon, authenticated, service_role;

        CREATE TABLE public.players(
          id uuid PRIMARY KEY,
          full_name text NOT NULL,
          player_type text NOT NULL DEFAULT 'CLUB',
          phone text,
          email text,
          initial_rating numeric NOT NULL DEFAULT 4,
          current_rating numeric NOT NULL DEFAULT 4,
          status text NOT NULL DEFAULT 'ACTIVE',
          joined_at date,
          date_of_birth date,
          notes text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE public.profiles(
          id uuid PRIMARY KEY,
          full_name text,
          login_name text,
          role text NOT NULL,
          is_active boolean NOT NULL DEFAULT true,
          membership_status text NOT NULL DEFAULT 'APPROVED',
          must_change_password boolean NOT NULL DEFAULT false,
          can_collect_tournament_fee boolean NOT NULL DEFAULT false,
          can_approve_matches boolean NOT NULL DEFAULT false,
          can_manage_tournaments boolean NOT NULL DEFAULT false,
          can_manage_fund boolean NOT NULL DEFAULT false,
          can_manage_members boolean NOT NULL DEFAULT false,
          can_adjust_rating boolean NOT NULL DEFAULT false,
          can_collect_fund boolean NOT NULL DEFAULT false,
          can_view_audit boolean NOT NULL DEFAULT false,
          player_id uuid REFERENCES public.players(id),
          membership_reviewed_by uuid,
          membership_reviewed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
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

        CREATE FUNCTION public.current_user_business_access_active()
        RETURNS boolean
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT EXISTS(
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_active IS TRUE
              AND p.membership_status = 'APPROVED'
              AND p.must_change_password IS NOT TRUE
          )
        $$;

        REVOKE ALL
        ON FUNCTION public.current_user_business_access_active()
        FROM PUBLIC, anon, service_role;

        GRANT EXECUTE
        ON FUNCTION public.current_user_business_access_active()
        TO authenticated;

        CREATE FUNCTION public.get_admin_member_permissions(
          p_limit integer DEFAULT 100,
          p_offset integer DEFAULT 0
        )
        RETURNS TABLE(
          profile_id uuid,
          full_name text,
          login_name text,
          player_id uuid,
          is_active boolean,
          can_collect_tournament_fee boolean,
          can_approve_matches boolean,
          can_manage_tournaments boolean,
          can_manage_fund boolean,
          can_manage_members boolean,
          can_adjust_rating boolean,
          can_collect_fund boolean,
          can_view_audit boolean
        )
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
          RETURN QUERY
          SELECT
            p.id,
            p.full_name,
            p.login_name,
            p.player_id,
            p.is_active,
            p.can_collect_tournament_fee,
            p.can_approve_matches,
            p.can_manage_tournaments,
            p.can_manage_fund,
            p.can_manage_members,
            p.can_adjust_rating,
            p.can_collect_fund,
            p.can_view_audit
          FROM public.profiles p
          WHERE p.role='MEMBER';
        END
        $$;

        CREATE FUNCTION public.admin_update_member_permissions(
          p_profile_id uuid,
          p_capabilities jsonb,
          p_reason text
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
          RETURN '{{"success":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public.get_admin_member_lifecycle(
          p_limit integer DEFAULT 100,
          p_offset integer DEFAULT 0
        )
        RETURNS TABLE(
          profile_id uuid,
          full_name text,
          login_name text,
          is_active boolean,
          player_id uuid,
          player_status text,
          player_type text,
          delegated_permissions_count integer,
          membership_status text
        )
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
          RETURN QUERY
          SELECT
            p.id,
            p.full_name,
            p.login_name,
            p.is_active,
            p.player_id,
            player.status,
            player.player_type,
            0::integer,
            p.membership_status
          FROM public.profiles p
          LEFT JOIN public.players player
            ON player.id=p.player_id
          WHERE p.role='MEMBER';
        END
        $$;

        CREATE FUNCTION public.admin_set_member_account_active(
          uuid,boolean,text
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
          RETURN '{{"success":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public._review_member_signup(
          uuid,text,text
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
          RETURN '{{"success":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public.admin_approve_member_signup(
          p_profile_id uuid
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN public._review_member_signup(
            p_profile_id,
            'APPROVED',
            NULL
          );
        END
        $$;

        CREATE FUNCTION public.admin_reject_member_signup(
          p_profile_id uuid,
          p_reason text
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN public._review_member_signup(
            p_profile_id,
            'REJECTED',
            p_reason
          );
        END
        $$;

        REVOKE ALL
        ON FUNCTION public._review_member_signup(uuid,text,text)
        FROM PUBLIC, anon, authenticated, service_role;

        REVOKE ALL
        ON FUNCTION public.admin_approve_member_signup(uuid)
        FROM PUBLIC, anon, service_role;

        REVOKE ALL
        ON FUNCTION public.admin_reject_member_signup(uuid,text)
        FROM PUBLIC, anon, service_role;

        GRANT EXECUTE
        ON FUNCTION public.admin_approve_member_signup(uuid)
        TO authenticated;

        GRANT EXECUTE
        ON FUNCTION public.admin_reject_member_signup(uuid,text)
        TO authenticated;

        CREATE FUNCTION public.create_player(
          text,text,text,text,numeric,date,date,text
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE p public.profiles%rowtype;
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          SELECT * INTO p
          FROM public.profiles
          WHERE id=auth.uid();

          IF NOT (
            upper(coalesce(p.role,''))='ADMIN'
            OR coalesce(p.can_manage_members, false)
          ) THEN
            RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN '{{"ok":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public.update_player(
          uuid,text,text,text,text,text,date,date,text
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE p public.profiles%rowtype;
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          SELECT * INTO p
          FROM public.profiles
          WHERE id=auth.uid();

          IF NOT (
            upper(coalesce(p.role,''))='ADMIN'
            OR coalesce(p.can_manage_members, false)
          ) THEN
            RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN '{{"ok":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public.get_player_lifecycle_preview(uuid)
        RETURNS jsonb
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE p public.profiles%rowtype;
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          SELECT * INTO p
          FROM public.profiles
          WHERE id=auth.uid();

          IF NOT (
            upper(coalesce(p.role,''))='ADMIN'
            OR coalesce(p.can_manage_members, false)
          ) THEN
            RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN '{{"ok":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public.set_player_lifecycle_status(
          uuid,text,text
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE p public.profiles%rowtype;
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          SELECT * INTO p
          FROM public.profiles
          WHERE id=auth.uid();

          IF NOT (
            upper(coalesce(p.role,''))='ADMIN'
            OR coalesce(p.can_manage_members, false)
          ) THEN
            RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN '{{"ok":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public.get_admin_member_promotion_candidates()
        RETURNS SETOF public.profiles
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE v_actor_profile public.profiles%rowtype;
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          SELECT * INTO v_actor_profile
          FROM public.profiles
          WHERE id=auth.uid();

          IF upper(coalesce(v_actor_profile.role,'')) <> 'ADMIN'
             AND coalesce(v_actor_profile.can_manage_members, false) = false THEN
            RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN QUERY
          SELECT *
          FROM public.profiles
          WHERE role='MEMBER';
        END
        $$;

        CREATE FUNCTION public.get_admin_member_promotion_preview(
          uuid,uuid
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE v_actor_profile public.profiles%rowtype;
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          SELECT * INTO v_actor_profile
          FROM public.profiles
          WHERE id=auth.uid();

          IF upper(coalesce(v_actor_profile.role,'')) <> 'ADMIN'
             AND coalesce(v_actor_profile.can_manage_members, false) = false THEN
            RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN '{{"ok":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public.promote_guest_player_to_member(uuid,uuid)
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE p public.profiles%rowtype;
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          SELECT * INTO p
          FROM public.profiles
          WHERE id=auth.uid();

          IF NOT (
            upper(coalesce(p.role,''))='ADMIN'
            OR coalesce(p.can_manage_members, false)
          ) THEN
            RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN '{{"ok":true}}'::jsonb;
        END
        $$;

        CREATE FUNCTION public.get_member_management_players()
        RETURNS SETOF public.players
        LANGUAGE plpgsql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        DECLARE
          v_profile public.profiles%rowtype;
        BEGIN
          -- ACC07B business access gate
          IF NOT public.current_user_business_access_active() THEN
            RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          SELECT * INTO v_profile
          FROM public.profiles
          WHERE id=auth.uid();

          IF NOT (
            upper(coalesce(v_profile.role,''))='ADMIN'
            OR coalesce(v_profile.can_manage_members, false)
          ) THEN
            RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
              USING ERRCODE='42501';
          END IF;

          RETURN QUERY
          SELECT p.*
          FROM public.players p;
        END
        $$;

        INSERT INTO public.players(
          id,full_name,player_type
        ) VALUES
          ('{target_player}','Target','CLUB'),
          ('{guest_player}','Guest','GUEST');

        INSERT INTO public.profiles(
          id,
          full_name,
          login_name,
          role,
          is_active,
          membership_status,
          must_change_password,
          can_manage_members
        ) VALUES
          ('{admin}','Admin','admin','ADMIN',true,'APPROVED',false,false),
          ('{member_only}','Member Only','memberonly','MEMBER',true,'APPROVED',false,true),
          ('{player_only}','Player Only','playeronly','MEMBER',true,'APPROVED',false,false),
          ('{lifecycle_only}','Lifecycle Only','lifeonly','MEMBER',true,'APPROVED',false,false),
          ('{member_player}','Member Player','memberplayer','MEMBER',true,'APPROVED',false,true),
          ('{player_lifecycle}','Player Lifecycle','playerlife','MEMBER',true,'APPROVED',false,false),
          ('{normal}','Normal','normal','MEMBER',true,'APPROVED',false,false),
          ('{forced}','Forced','forced','MEMBER',true,'APPROVED',true,false);
        """
    )

    # PLAYER-PERMISSION01A adds the new columns and permission-admin contract.
    run(migrations[0].read_text(encoding="utf8"))

    # New capabilities must be forward-only defaults: no legacy backfill.
    assert (
        run(
            """
            SELECT bool_and(
              NOT can_manage_players
              AND NOT can_manage_player_lifecycle
            )
            FROM public.profiles;
            """
        )
        == "t"
    )
    print("PASS 01A new capabilities default false / no backfill")

    # ADMIN remains role-based and may manage both new delegated capabilities.
    admin_ctx = (
        "RESET ROLE; "
        "SET ROLE authenticated; "
        f"SELECT set_config('request.jwt.claim.sub','{admin}',false); "
    )

    directory = run(
        admin_ctx
        + """
          SELECT
            can_manage_players::text
            || '|'
            || can_manage_player_lifecycle::text
          FROM public.get_admin_member_permissions()
          WHERE profile_id = '"""
        + member_only
        + """';
        """
    )
    directory = directory.splitlines()[-1]
    assert directory == "false|false", directory
    grant_result = run(
        admin_ctx
        + """
          SELECT public.admin_update_member_permissions(
            '"""
        + member_only
        + """',
            '{"can_manage_players":true,
              "can_manage_player_lifecycle":true}'::jsonb,
            'PLAYER-PERMISSION01 fixture grant'
          );
        """
    )
    assert '"changed": true' in grant_result

    assert (
        run(
            f"""
            SELECT can_manage_players
                   AND can_manage_player_lifecycle
            FROM public.profiles
            WHERE id='{member_only}';
            """
        )
        == "t"
    )

    audit_before = run(
        f"""
        SELECT count(*)
        FROM public.audit_logs
        WHERE action='UPDATE_MEMBER_PERMISSIONS'
          AND record_id='{member_only}';
        """
    )

    noop_result = run(
        admin_ctx
        + """
          SELECT public.admin_update_member_permissions(
            '"""
        + member_only
        + """',
            '{"can_manage_players":true,
              "can_manage_player_lifecycle":true}'::jsonb,
            'PLAYER-PERMISSION01 fixture noop'
          );
        """
    )
    assert '"changed": false' in noop_result

    audit_after = run(
        f"""
        SELECT count(*)
        FROM public.audit_logs
        WHERE action='UPDATE_MEMBER_PERMISSIONS'
          AND record_id='{member_only}';
        """
    )
    assert audit_after == audit_before

    run(
        f"""
        UPDATE public.profiles
        SET is_active=false
        WHERE id='{member_only}';
        """
    )

    fail(
        admin_ctx
        + """
          SELECT public.admin_update_member_permissions(
            '"""
        + member_only
        + """',
            '{"can_manage_players":true}'::jsonb,
            'inactive grant'
          );
        """,
        "INACTIVE_TARGET_REVOKE_ONLY",
    )

    revoke_result = run(
        admin_ctx
        + """
          SELECT public.admin_update_member_permissions(
            '"""
        + member_only
        + """',
            '{"can_manage_players":false,
              "can_manage_player_lifecycle":false}'::jsonb,
            'inactive revoke'
          );
        """
    )
    assert '"changed": true' in revoke_result

    run(
        f"""
        UPDATE public.profiles
        SET is_active=true
        WHERE id='{member_only}';
        """
    )

    assert (
        run(
            f"""
            SELECT NOT can_manage_players
                   AND NOT can_manage_player_lifecycle
            FROM public.profiles
            WHERE id='{member_only}';
            """
        )
        == "t"
    )

    print("PASS 01A admin directory / grant / noop / inactive revoke-only")

    run(
        f"""
        UPDATE public.profiles
        SET can_manage_players=true
        WHERE id IN (
          '{player_only}',
          '{member_player}',
          '{player_lifecycle}'
        );

        UPDATE public.profiles
        SET can_manage_player_lifecycle=true
        WHERE id IN (
          '{lifecycle_only}',
          '{player_lifecycle}'
        );
        """
    )

    # PLAYER-PERMISSION01B account lifecycle / signup reset convergence.
    run(migrations[1].read_text(encoding="utf8"))

    # Lifecycle directory count must include both new Player capabilities.
    run(
        f"""
        UPDATE public.profiles
        SET
          can_manage_players=true,
          can_manage_player_lifecycle=true
        WHERE id='{normal}';
        """
    )

    lifecycle_count = run(
        admin_ctx
        + """
          SELECT delegated_permissions_count
          FROM public.get_admin_member_lifecycle()
          WHERE profile_id = '"""
        + normal
        + """';
        """
    ).splitlines()[-1]

    assert lifecycle_count == "2", lifecycle_count

    # Deactivation must clear both new capabilities.
    lifecycle_result = run(
        admin_ctx
        + """
          SELECT public.admin_set_member_account_active(
            '"""
        + normal
        + """',
            false,
            'PLAYER-PERMISSION01 lifecycle reset'
          );
        """
    )
    assert '"changed": true' in lifecycle_result

    assert (
        run(
            f"""
            SELECT
              NOT is_active
              AND NOT can_manage_players
              AND NOT can_manage_player_lifecycle
            FROM public.profiles
            WHERE id='{normal}';
            """
        )
        == "t"
    )

    # Signup review must also reset both capabilities.
    pending = uid(9)

    run(
        f"""
        INSERT INTO public.profiles(
          id,
          full_name,
          login_name,
          role,
          is_active,
          membership_status,
          must_change_password,
          can_manage_members,
          can_manage_players,
          can_manage_player_lifecycle
        ) VALUES (
          '{pending}',
          'Pending',
          'pending',
          'MEMBER',
          false,
          'PENDING',
          false,
          true,
          true,
          true
        );
        """
    )

    review_result = run(
        admin_ctx
        + """
          SELECT public.admin_approve_member_signup(
            '"""
        + pending
        + """'
          );
        """
    )
    assert '"changed": true' in review_result

    assert (
        run(
            f"""
            SELECT
              membership_status='APPROVED'
              AND is_active
              AND NOT can_manage_members
              AND NOT can_manage_players
              AND NOT can_manage_player_lifecycle
            FROM public.profiles
            WHERE id='{pending}';
            """
        )
        == "t"
    )

    print("PASS 01B lifecycle count / deactivate reset / signup reset")

    # Account lifecycle and signup review remain ADMIN-only.
    delegated_ctx = (
        "RESET ROLE; "
        "SET ROLE authenticated; "
        f"SELECT set_config('request.jwt.claim.sub','{member_player}',false); "
    )

    fail(
        delegated_ctx
        + f"""
          SELECT public.admin_set_member_account_active(
            '{player_only}',
            false,
            'delegated forbidden'
          );
        """,
        "ADMIN_REQUIRED",
    )

    pending_denied = uid(10)

    run(
        f"""
        INSERT INTO public.profiles(
          id,
          full_name,
          login_name,
          role,
          is_active,
          membership_status,
          must_change_password,
          can_manage_members,
          can_manage_players,
          can_manage_player_lifecycle
        ) VALUES (
          '{pending_denied}',
          'Pending Denied',
          'pendingdenied',
          'MEMBER',
          false,
          'PENDING',
          false,
          false,
          false,
          false
        );
        """
    )

    fail(
        delegated_ctx
        + f"""
          SELECT public.admin_approve_member_signup(
            '{pending_denied}'
          );
        """,
        "ADMIN_REQUIRED",
    )

    fail(
        admin_ctx
        + f"""
          SELECT public._review_member_signup(
            '{pending_denied}',
            'APPROVED',
            NULL
          );
        """,
        "permission denied",
    )

    print("PASS 01B account lifecycle/signup remain ADMIN-only / internal review hidden")

    # Apply RPC authorization split and management-directory split.
    run(migrations[2].read_text(encoding="utf8"))
    run(migrations[3].read_text(encoding="utf8"))

    def ctx(actor):
        return (
            "RESET ROLE; "
            "SET ROLE authenticated; "
            f"SELECT set_config('request.jwt.claim.sub','{actor}',false); "
        )

    def ok(actor, expression):
        result = run(ctx(actor) + f"SELECT {expression};")
        assert result != "", (actor, expression)

    def denied(actor, expression, code):
        fail(ctx(actor) + f"SELECT {expression};", code)

    create_call = (
        "create_player("
        "'New Player','CLUB',NULL,NULL,4,NULL,NULL,NULL)"
    )
    update_call = (
        f"update_player("
        f"'{target_player}','Target','CLUB','ACTIVE',"
        "NULL,NULL,NULL,NULL,NULL)"
    )
    lifecycle_preview = (
        f"get_player_lifecycle_preview('{target_player}')"
    )
    lifecycle_set = (
        f"set_player_lifecycle_status("
        f"'{target_player}','INACTIVE','fixture')"
    )
    promotion_candidates = (
        "(SELECT count(*) FROM "
        "get_admin_member_promotion_candidates())"
    )
    promotion_preview = (
        f"get_admin_member_promotion_preview("
        f"'{member_player}','{guest_player}')"
    )
    promotion_mutation = (
        f"promote_guest_player_to_member("
        f"'{member_player}','{guest_player}')"
    )
    management_directory = (
        "(SELECT count(*) FROM "
        "get_member_management_players())"
    )

    # A. member-only
    denied(
        member_only,
        create_call,
        "PLAYER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    denied(
        member_only,
        update_call,
        "PLAYER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    denied(
        member_only,
        lifecycle_preview,
        "PLAYER_LIFECYCLE_PERMISSION_REQUIRED",
    )
    denied(
        member_only,
        promotion_candidates,
        "MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    denied(
        member_only,
        management_directory,
        "MEMBER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    print("PASS A member-only")

    # B. player-only
    ok(player_only, create_call)
    ok(player_only, update_call)
    denied(
        player_only,
        lifecycle_preview,
        "PLAYER_LIFECYCLE_PERMISSION_REQUIRED",
    )
    denied(
        player_only,
        promotion_candidates,
        "MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    ok(player_only, management_directory)
    print("PASS B player-only")

    # C. lifecycle-only
    denied(
        lifecycle_only,
        create_call,
        "PLAYER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    ok(lifecycle_only, lifecycle_preview)
    ok(lifecycle_only, lifecycle_set)
    denied(
        lifecycle_only,
        promotion_candidates,
        "MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    ok(lifecycle_only, management_directory)
    print("PASS C lifecycle-only")

    # D. member + player
    ok(member_player, create_call)
    ok(member_player, update_call)
    denied(
        member_player,
        lifecycle_preview,
        "PLAYER_LIFECYCLE_PERMISSION_REQUIRED",
    )
    ok(member_player, promotion_candidates)
    ok(member_player, promotion_preview)
    ok(member_player, promotion_mutation)
    ok(member_player, management_directory)
    print("PASS D member+player")

    # E. player + lifecycle
    ok(player_lifecycle, create_call)
    ok(player_lifecycle, update_call)
    ok(player_lifecycle, lifecycle_preview)
    ok(player_lifecycle, lifecycle_set)
    denied(
        player_lifecycle,
        promotion_candidates,
        "MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED",
    )
    ok(player_lifecycle, management_directory)
    print("PASS E player+lifecycle")

    # F. ADMIN: delegated columns remain false but role grants all.
    assert (
        run(
            f"""
            SELECT
              NOT can_manage_members
              AND NOT can_manage_players
              AND NOT can_manage_player_lifecycle
            FROM public.profiles
            WHERE id='{admin}';
            """
        )
        == "t"
    )

    ok(admin, create_call)
    ok(admin, update_call)
    ok(admin, lifecycle_preview)
    ok(admin, lifecycle_set)
    ok(admin, promotion_candidates)
    ok(admin, promotion_preview)
    ok(admin, promotion_mutation)
    ok(admin, management_directory)
    print("PASS F ADMIN role fallback")

    # Forced-password/business gate must still dominate delegated rights.
    run(
        f"""
        UPDATE public.profiles
        SET
          can_manage_members=true,
          can_manage_players=true,
          can_manage_player_lifecycle=true
        WHERE id='{forced}';
        """
    )

    permission_directory = "get_admin_member_permissions()"
    permission_mutation = (
        f"admin_update_member_permissions("
        f"'{member_only}',"
        "'{\"can_manage_players\":false}'::jsonb,"
        "'forced-password gate regression')"
    )
    member_lifecycle_directory = "get_admin_member_lifecycle()"
    account_lifecycle_mutation = (
        f"admin_set_member_account_active("
        f"'{normal}',false,"
        "'forced-password gate regression')"
    )

    for expression in (
        create_call,
        lifecycle_preview,
        promotion_candidates,
        management_directory,
        permission_directory,
        permission_mutation,
        member_lifecycle_directory,
        account_lifecycle_mutation,
    ):
        denied(
            forced,
            expression,
            "BUSINESS_ACCESS_REQUIRED",
        )

    print("PASS ACC07B business gate preserved")

    # ACL checks.
    for signature in (
        "create_player(text,text,text,text,numeric,date,date,text)",
        "update_player(uuid,text,text,text,text,text,date,date,text)",
        "get_player_lifecycle_preview(uuid)",
        "set_player_lifecycle_status(uuid,text,text)",
        "get_admin_member_promotion_candidates()",
        "get_admin_member_promotion_preview(uuid,uuid)",
        "promote_guest_player_to_member(uuid,uuid)",
        "get_member_management_players()",
    ):
        assert (
            run(
                "SELECT "
                f"has_function_privilege("
                f"'authenticated','public.{signature}','EXECUTE') "
                "AND NOT "
                f"has_function_privilege("
                f"'anon','public.{signature}','EXECUTE') "
                "AND NOT "
                f"has_function_privilege("
                f"'service_role','public.{signature}','EXECUTE');"
            )
            == "t"
        ), signature

    print("PASS authenticated-only RPC ACLs")
    print("PLAYER-PERMISSION01 LOCAL TESTS PASS")

finally:
    if created:
        run(
            f"DROP DATABASE {database} WITH (FORCE)",
            "postgres",
        )