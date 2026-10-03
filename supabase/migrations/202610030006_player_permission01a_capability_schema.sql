-- ============================================================
-- PLAYER-PERMISSION01A — PLAYER CAPABILITY SCHEMA
-- ============================================================
-- Adds delegated Player-management capabilities without granting
-- them to any existing account.
--
-- ADMIN authority remains role-based.
-- can_manage_members remains Member/account scope.
-- ============================================================

BEGIN;

DO $player_permission01a_preflight$
BEGIN
    IF to_regprocedure(
        'public.get_admin_member_permissions(integer,integer)'
    ) IS NULL THEN
        RAISE EXCEPTION 'PLAYER_PERMISSION01A_PERMISSION_DIRECTORY_MISSING';
    END IF;

    IF to_regprocedure(
        'public.admin_update_member_permissions(uuid,jsonb,text)'
    ) IS NULL THEN
        RAISE EXCEPTION 'PLAYER_PERMISSION01A_PERMISSION_UPDATE_MISSING';
    END IF;
END;
$player_permission01a_preflight$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS can_manage_players boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_player_lifecycle boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_manage_players IS
    'Allows an active delegated MEMBER to create Players, edit Player metadata, and participate in Player-side Guest promotion flows. ADMIN authority remains role-based.';

COMMENT ON COLUMN public.profiles.can_manage_player_lifecycle IS
    'Allows an active delegated MEMBER to deactivate/reactivate Players through the authoritative Player lifecycle RPC. Does not allow hard delete or Rating mutation. ADMIN authority remains role-based.';

-- Return shape changes, so PostgreSQL requires recreation rather than
-- CREATE OR REPLACE.
DROP FUNCTION public.get_admin_member_permissions(integer, integer);

CREATE FUNCTION public.get_admin_member_permissions(
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
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
    can_manage_players boolean,
    can_manage_player_lifecycle boolean,
    can_adjust_rating boolean,
    can_collect_fund boolean,
    can_view_audit boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active IS TRUE
          AND p.role = 'ADMIN'
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
        p.id,
        p.full_name,
        p.login_name,
        p.player_id,
        p.is_active,
        coalesce(p.can_collect_tournament_fee, false),
        coalesce(p.can_approve_matches, false),
        coalesce(p.can_manage_tournaments, false),
        coalesce(p.can_manage_fund, false),
        coalesce(p.can_manage_members, false),
        coalesce(p.can_manage_players, false),
        coalesce(p.can_manage_player_lifecycle, false),
        coalesce(p.can_adjust_rating, false),
        coalesce(p.can_collect_fund, false),
        coalesce(p.can_view_audit, false)
    FROM public.profiles p
    WHERE p.role = 'MEMBER'
    ORDER BY p.full_name NULLS LAST, p.id
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_member_permissions(
    p_profile_id uuid,
    p_capabilities jsonb,
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
    v_before jsonb;
    v_after jsonb;
    v_reason text;
    v_allowed constant text[] := ARRAY[
        'can_collect_tournament_fee',
        'can_approve_matches',
        'can_manage_tournaments',
        'can_manage_fund',
        'can_manage_members',
        'can_manage_players',
        'can_manage_player_lifecycle',
        'can_adjust_rating',
        'can_collect_fund',
        'can_view_audit'
    ];
BEGIN
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_actor
      AND p.is_active IS TRUE
      AND p.role = 'ADMIN'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_ID_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_profile_id = v_actor THEN
        RAISE EXCEPTION 'SELF_PERMISSION_CHANGE_FORBIDDEN'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_capabilities) IS DISTINCT FROM 'object'
       OR p_capabilities = '{}'::jsonb THEN
        RAISE EXCEPTION 'CAPABILITY_OBJECT_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_each(p_capabilities) e
        WHERE NOT (e.key = ANY(v_allowed))
           OR jsonb_typeof(e.value) IS DISTINCT FROM 'boolean'
    ) THEN
        RAISE EXCEPTION 'INVALID_CAPABILITY_PATCH'
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
      AND p.role = 'MEMBER'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_MEMBER_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF v_old.is_active IS NOT TRUE
       AND EXISTS (
           SELECT 1
           FROM jsonb_each(p_capabilities) e
           WHERE e.value = 'true'::jsonb
       ) THEN
        RAISE EXCEPTION 'INACTIVE_TARGET_REVOKE_ONLY'
            USING ERRCODE = '22023';
    END IF;

    SELECT jsonb_object_agg(k, to_jsonb(v_old) -> k)
    INTO v_before
    FROM unnest(v_allowed) AS keys(k);

    v_after := v_before || p_capabilities;

    IF v_before = v_after THEN
        RETURN jsonb_build_object(
            'success', true,
            'changed', false,
            'profile_id', p_profile_id,
            'capabilities', v_before
        );
    END IF;

    UPDATE public.profiles
    SET
        can_collect_tournament_fee =
            (v_after ->> 'can_collect_tournament_fee')::boolean,
        can_approve_matches =
            (v_after ->> 'can_approve_matches')::boolean,
        can_manage_tournaments =
            (v_after ->> 'can_manage_tournaments')::boolean,
        can_manage_fund =
            (v_after ->> 'can_manage_fund')::boolean,
        can_manage_members =
            (v_after ->> 'can_manage_members')::boolean,
        can_manage_players =
            (v_after ->> 'can_manage_players')::boolean,
        can_manage_player_lifecycle =
            (v_after ->> 'can_manage_player_lifecycle')::boolean,
        can_adjust_rating =
            (v_after ->> 'can_adjust_rating')::boolean,
        can_collect_fund =
            (v_after ->> 'can_collect_fund')::boolean,
        can_view_audit =
            (v_after ->> 'can_view_audit')::boolean,
        updated_at = now()
    WHERE id = p_profile_id
    RETURNING * INTO v_new;

    SELECT jsonb_object_agg(k, to_jsonb(v_new) -> k)
    INTO v_after
    FROM unnest(v_allowed) AS keys(k);

    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    ) VALUES (
        v_actor,
        'UPDATE_MEMBER_PERMISSIONS',
        'profiles',
        p_profile_id,
        jsonb_build_object(
            'profile_id', p_profile_id,
            'capabilities', v_before
        ),
        jsonb_build_object(
            'profile_id', p_profile_id,
            'capabilities', v_after
        ),
        v_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'changed', true,
        'profile_id', p_profile_id,
        'capabilities', v_after
    );
END;
$function$;

REVOKE ALL ON FUNCTION
    public.get_admin_member_permissions(integer, integer)
FROM PUBLIC, anon, service_role;

REVOKE ALL ON FUNCTION
    public.admin_update_member_permissions(uuid, jsonb, text)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
    public.get_admin_member_permissions(integer, integer)
TO authenticated;

GRANT EXECUTE ON FUNCTION
    public.admin_update_member_permissions(uuid, jsonb, text)
TO authenticated;

COMMENT ON FUNCTION
    public.get_admin_member_permissions(integer, integer)
IS
    'PLAYER-PERMISSION01A: active ADMIN-only MEMBER capability directory including delegated Player-management capabilities.';

COMMENT ON FUNCTION
    public.admin_update_member_permissions(uuid, jsonb, text)
IS
    'PLAYER-PERMISSION01A: active ADMIN-only capability patch including Player management/lifecycle capabilities; inactive targets remain revoke-only; reason and atomic audit required.';

COMMIT;
