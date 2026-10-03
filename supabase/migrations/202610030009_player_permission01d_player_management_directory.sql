-- ============================================================
-- PLAYER-PERMISSION01D — PLAYER MANAGEMENT DIRECTORY AUTH
-- ============================================================
-- Aligns the full Player management dataset with the dedicated
-- Player capabilities instead of can_manage_members.
--
-- Preserve the live ACC07B business-access gate and all other
-- production behavior by patching the current catalog definition.
-- ============================================================

BEGIN;

DO $player_permission01d$
DECLARE
    v_oid regprocedure;
    v_definition text;
    v_updated text;
    v_old_auth constant text :=
        'OR coalesce(v_profile.can_manage_members, false)';
    v_occurrences integer;
BEGIN
    v_oid := to_regprocedure(
        'public.get_member_management_players()'
    );

    IF v_oid IS NULL THEN
        RAISE EXCEPTION
            'PLAYER_PERMISSION01D_RPC_MISSING: get_member_management_players()';
    END IF;

    SELECT pg_get_functiondef(v_oid)
    INTO v_definition;

    IF position(
        '-- ACC07B business access gate'
        IN v_definition
    ) = 0
       OR position(
           'current_user_business_access_active()'
           IN v_definition
       ) = 0 THEN
        RAISE EXCEPTION
            'PLAYER_PERMISSION01D_ACC07B_GATE_MISSING';
    END IF;

    IF position(
        'coalesce(v_profile.can_manage_players, false)'
        IN v_definition
    ) > 0
       OR position(
           'coalesce(v_profile.can_manage_player_lifecycle, false)'
           IN v_definition
       ) > 0 THEN
        RAISE EXCEPTION
            'PLAYER_PERMISSION01D_UNEXPECTED_PREPATCH_STATE';
    END IF;

    v_occurrences :=
        (
            length(v_definition)
            - length(
                replace(
                    v_definition,
                    v_old_auth,
                    ''
                )
            )
        ) / nullif(length(v_old_auth), 0);

    IF v_occurrences <> 1 THEN
        RAISE EXCEPTION
            'PLAYER_PERMISSION01D_AUTH_SOURCE_DRIFT: expected 1, found %',
            v_occurrences;
    END IF;

    v_updated := replace(
        v_definition,
        v_old_auth,
        'OR coalesce(v_profile.can_manage_players, false)
        OR coalesce(v_profile.can_manage_player_lifecycle, false)'
    );

    IF v_updated = v_definition THEN
        RAISE EXCEPTION
            'PLAYER_PERMISSION01D_AUTH_PATCH_FAILED';
    END IF;

    IF position(
        '-- ACC07B business access gate'
        IN v_updated
    ) = 0
       OR position(
           'current_user_business_access_active()'
           IN v_updated
       ) = 0 THEN
        RAISE EXCEPTION
            'PLAYER_PERMISSION01D_BUSINESS_GATE_LOST';
    END IF;

    EXECUTE v_updated;
END;
$player_permission01d$;

REVOKE ALL
ON FUNCTION public.get_member_management_players()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_member_management_players()
FROM anon;

REVOKE ALL
ON FUNCTION public.get_member_management_players()
FROM service_role;

GRANT EXECUTE
ON FUNCTION public.get_member_management_players()
TO authenticated;

COMMENT ON FUNCTION public.get_member_management_players()
IS
    'PLAYER-PERMISSION01D: full Player management directory requires active ADMIN or can_manage_players or can_manage_player_lifecycle; ACC07B business-access gate remains authoritative.';

COMMIT;