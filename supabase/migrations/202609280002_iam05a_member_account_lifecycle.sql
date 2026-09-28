BEGIN;

-- IAM05A — MEMBER account lifecycle.
--
-- profiles.is_active = account authorization state.
-- players.status      = player participation state.
--
-- This migration intentionally does NOT mutate players.status and does NOT
-- hard-delete profiles/players.
--
-- Account lifecycle is ADMIN-only. can_manage_members is not sufficient
-- because account activation/deactivation is IAM authority.
--
-- Deactivate/reactivate always clears delegated capabilities on a real state
-- transition. Reactivation never restores old delegated privileges.

CREATE OR REPLACE FUNCTION public.get_admin_member_lifecycle(
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    profile_id uuid,
    full_name text,
    login_name text,
    is_active boolean,
    player_id uuid,
    player_status text,
    player_type text,
    delegated_permissions_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active IS TRUE
          AND upper(coalesce(p.role, '')) = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_limit IS NULL
       OR p_limit < 1
       OR p_limit > 200
       OR p_offset IS NULL
       OR p_offset < 0 THEN
        RAISE EXCEPTION 'INVALID_PAGINATION'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        profile.id,
        profile.full_name,
        profile.login_name,
        profile.is_active,
        profile.player_id,
        player.status,
        player.player_type,
        (
            coalesce(profile.can_collect_tournament_fee, false)::integer +
            coalesce(profile.can_approve_matches, false)::integer +
            coalesce(profile.can_manage_tournaments, false)::integer +
            coalesce(profile.can_manage_fund, false)::integer +
            coalesce(profile.can_manage_members, false)::integer +
            coalesce(profile.can_adjust_rating, false)::integer +
            coalesce(profile.can_collect_fund, false)::integer +
            coalesce(profile.can_view_audit, false)::integer
        )::integer
    FROM public.profiles profile
    LEFT JOIN public.players player
      ON player.id = profile.player_id
    WHERE upper(coalesce(profile.role, '')) = 'MEMBER'
    ORDER BY profile.full_name NULLS LAST, profile.id
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_set_member_account_active(
    p_profile_id uuid,
    p_is_active boolean,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_old public.profiles%rowtype;
    v_new public.profiles%rowtype;
    v_reason text;
    v_player_status text;
    v_action text;
    v_before_capabilities jsonb;
    v_after_capabilities jsonb;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    -- Keep ADMIN authorization stable until transaction commit.
    PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_actor
      AND p.is_active IS TRUE
      AND upper(coalesce(p.role, '')) = 'ADMIN'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_ID_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_is_active IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_STATE_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_profile_id = v_actor THEN
        RAISE EXCEPTION 'SELF_ACCOUNT_LIFECYCLE_FORBIDDEN'
            USING ERRCODE = '22023';
    END IF;

    v_reason := nullif(btrim(p_reason), '');

    IF v_reason IS NULL
       OR char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION 'REASON_REQUIRED_MAX_1000'
            USING ERRCODE = '22023';
    END IF;

    SELECT p.*
    INTO v_old
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND upper(coalesce(p.role, '')) = 'MEMBER'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_MEMBER_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF v_old.player_id IS NOT NULL THEN
        SELECT player.status
        INTO v_player_status
        FROM public.players player
        WHERE player.id = v_old.player_id;
    END IF;

    -- A lifecycle no-op must not unexpectedly alter permissions.
    IF v_old.is_active IS NOT DISTINCT FROM p_is_active THEN
        RETURN jsonb_build_object(
            'success', true,
            'changed', false,
            'profile_id', v_old.id,
            'is_active', v_old.is_active,
            'player_id', v_old.player_id,
            'player_status', v_player_status
        );
    END IF;

    v_before_capabilities := jsonb_build_object(
        'can_collect_tournament_fee', coalesce(v_old.can_collect_tournament_fee, false),
        'can_approve_matches', coalesce(v_old.can_approve_matches, false),
        'can_manage_tournaments', coalesce(v_old.can_manage_tournaments, false),
        'can_manage_fund', coalesce(v_old.can_manage_fund, false),
        'can_manage_members', coalesce(v_old.can_manage_members, false),
        'can_adjust_rating', coalesce(v_old.can_adjust_rating, false),
        'can_collect_fund', coalesce(v_old.can_collect_fund, false),
        'can_view_audit', coalesce(v_old.can_view_audit, false)
    );

    UPDATE public.profiles
    SET
        is_active = p_is_active,

        -- Never carry delegated privileges through a lifecycle transition.
        can_collect_tournament_fee = false,
        can_approve_matches = false,
        can_manage_tournaments = false,
        can_manage_fund = false,
        can_manage_members = false,
        can_adjust_rating = false,
        can_collect_fund = false,
        can_view_audit = false,

        updated_at = now()
    WHERE id = p_profile_id
    RETURNING *
    INTO v_new;

    v_after_capabilities := jsonb_build_object(
        'can_collect_tournament_fee', coalesce(v_new.can_collect_tournament_fee, false),
        'can_approve_matches', coalesce(v_new.can_approve_matches, false),
        'can_manage_tournaments', coalesce(v_new.can_manage_tournaments, false),
        'can_manage_fund', coalesce(v_new.can_manage_fund, false),
        'can_manage_members', coalesce(v_new.can_manage_members, false),
        'can_adjust_rating', coalesce(v_new.can_adjust_rating, false),
        'can_collect_fund', coalesce(v_new.can_collect_fund, false),
        'can_view_audit', coalesce(v_new.can_view_audit, false)
    );

    v_action :=
        CASE
            WHEN p_is_active
                THEN 'REACTIVATE_MEMBER_ACCOUNT'
            ELSE 'DEACTIVATE_MEMBER_ACCOUNT'
        END;

    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    VALUES (
        v_actor,
        v_action,
        'profiles',
        p_profile_id,
        jsonb_build_object(
            'profile_id', v_old.id,
            'is_active', v_old.is_active,
            'player_id', v_old.player_id,
            'player_status', v_player_status,
            'capabilities', v_before_capabilities
        ),
        jsonb_build_object(
            'profile_id', v_new.id,
            'is_active', v_new.is_active,
            'player_id', v_new.player_id,
            'player_status', v_player_status,
            'capabilities', v_after_capabilities
        ),
        v_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'changed', true,
        'action', v_action,
        'profile_id', v_new.id,
        'is_active', v_new.is_active,
        'player_id', v_new.player_id,
        'player_status', v_player_status,
        'capabilities_revoked', true
    );
END;
$function$;


REVOKE ALL
ON FUNCTION public.get_admin_member_lifecycle(integer, integer)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_admin_member_lifecycle(integer, integer)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_admin_member_lifecycle(integer, integer)
TO authenticated;


REVOKE ALL
ON FUNCTION public.admin_set_member_account_active(uuid, boolean, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.admin_set_member_account_active(uuid, boolean, text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.admin_set_member_account_active(uuid, boolean, text)
TO authenticated;


COMMENT ON FUNCTION public.get_admin_member_lifecycle(integer, integer) IS
    'IAM05A: active ADMIN-only MEMBER account lifecycle directory; account and Player states remain distinct.';

COMMENT ON FUNCTION public.admin_set_member_account_active(uuid, boolean, text) IS
    'IAM05A: active ADMIN-only MEMBER deactivate/reactivate; lifecycle transition revokes delegated capabilities, preserves Player and business history, and writes atomic audit.';

COMMIT;