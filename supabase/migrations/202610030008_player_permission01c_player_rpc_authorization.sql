-- ============================================================
-- PLAYER-PERMISSION01C — PLAYER RPC AUTHORIZATION SPLIT
-- ============================================================
-- Separates Player management from Member management without
-- rewriting established Player business logic.
--
-- Authorization matrix:
--   ADMIN
--     - bypasses delegated capability requirements
--
--   can_manage_players
--     - create Player
--     - edit Player metadata
--
--   can_manage_player_lifecycle
--     - lifecycle preview
--     - activate/deactivate Player
--
--   can_manage_members + can_manage_players
--     - Guest -> Member promotion candidates
--     - promotion preview
--     - promotion mutation
--
-- Initial Rating correction remains ADMIN-only.
-- Player hard delete remains ADMIN-only.
--
-- Existing ACC07B business-access gating must remain intact.
-- ============================================================

BEGIN;

DO $player_permission01c$
DECLARE
    v_signature text;
    v_oid regprocedure;
    v_definition text;
    v_new_definition text;
    v_old_permission text;
    v_new_permission text;
    v_old_error text;
    v_new_error text;
    v_expected_count integer;
    v_actual_count integer;
BEGIN
    IF to_regprocedure(
        'public.current_user_business_access_active()'
    ) IS NULL THEN
        RAISE EXCEPTION
            'PLAYER_PERMISSION01C_BUSINESS_ACCESS_GATE_MISSING';
    END IF;

    FOREACH v_signature IN ARRAY ARRAY[
        'create_player(text,text,text,text,numeric,date,date,text)',
        'update_player(uuid,text,text,text,text,text,date,date,text)',
        'get_player_lifecycle_preview(uuid)',
        'set_player_lifecycle_status(uuid,text,text)',
        'get_admin_member_promotion_candidates()',
        'get_admin_member_promotion_preview(uuid,uuid)',
        'promote_guest_player_to_member(uuid,uuid)'
    ]
    LOOP
        v_oid := to_regprocedure('public.' || v_signature);

        IF v_oid IS NULL THEN
            RAISE EXCEPTION
                'PLAYER_PERMISSION01C_EXPECTED_RPC_MISSING: %',
                v_signature;
        END IF;

        SELECT pg_get_functiondef(v_oid)
        INTO v_definition;

        IF position(
            'current_user_business_access_active()'
            IN v_definition
        ) = 0 THEN
            RAISE EXCEPTION
                'PLAYER_PERMISSION01C_BUSINESS_GATE_DRIFT: %',
                v_signature;
        END IF;

        -- Preserve/future-proof the ACC07B marker when later migrations
        -- have recreated a gated function without the original injected
        -- marker comment.
        IF position(
            '-- ACC07B business access gate'
            IN v_definition
        ) = 0 THEN
            v_definition := replace(
                v_definition,
                '    IF NOT public.current_user_business_access_active() THEN',
                '    -- ACC07B business access gate' || E'\n' ||
                '    IF NOT public.current_user_business_access_active() THEN'
            );
        END IF;

        v_new_definition := v_definition;

        -- --------------------------------------------------------
        -- Player create / metadata edit
        -- ADMIN OR can_manage_players
        -- --------------------------------------------------------
        IF v_signature IN (
            'create_player(text,text,text,text,numeric,date,date,text)',
            'update_player(uuid,text,text,text,text,text,date,date,text)'
        ) THEN
            v_old_permission :=
                'coalesce(p.can_manage_members, false)';
            v_new_permission :=
                'coalesce(p.can_manage_players, false)';
            v_old_error :=
                'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
            v_new_error :=
                'PLAYER_MANAGEMENT_PERMISSION_REQUIRED';
            v_expected_count := 1;

        -- --------------------------------------------------------
        -- Player lifecycle
        -- ADMIN OR can_manage_player_lifecycle
        -- --------------------------------------------------------
        ELSIF v_signature IN (
            'get_player_lifecycle_preview(uuid)',
            'set_player_lifecycle_status(uuid,text,text)'
        ) THEN
            v_old_permission :=
                'coalesce(p.can_manage_members, false)';
            v_new_permission :=
                'coalesce(p.can_manage_player_lifecycle, false)';
            v_old_error :=
                'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
            v_new_error :=
                'PLAYER_LIFECYCLE_PERMISSION_REQUIRED';
            v_expected_count := 1;

        -- --------------------------------------------------------
        -- Promotion candidates
        -- ADMIN OR (can_manage_members AND can_manage_players)
        -- --------------------------------------------------------
        ELSIF v_signature =
            'get_admin_member_promotion_candidates()'
        THEN
            v_old_permission :=
                'coalesce(v_actor_profile.can_manage_members, false) = false';
            v_new_permission :=
                '(' ||
                'coalesce(v_actor_profile.can_manage_members, false) = false ' ||
                'OR coalesce(v_actor_profile.can_manage_players, false) = false' ||
                ')';
            v_old_error :=
                'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
            v_new_error :=
                'MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED';
            v_expected_count := 1;

        -- --------------------------------------------------------
        -- Promotion preview
        -- ADMIN OR (can_manage_members AND can_manage_players)
        -- --------------------------------------------------------
        ELSIF v_signature =
            'get_admin_member_promotion_preview(uuid,uuid)'
        THEN
            v_old_permission :=
                'coalesce(v_actor_profile.can_manage_members, false) = false';
            v_new_permission :=
                '(' ||
                'coalesce(v_actor_profile.can_manage_members, false) = false ' ||
                'OR coalesce(v_actor_profile.can_manage_players, false) = false' ||
                ')';
            v_old_error :=
                'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
            v_new_error :=
                'MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED';
            v_expected_count := 1;

        -- --------------------------------------------------------
        -- Promotion mutation
        -- ADMIN OR (can_manage_members AND can_manage_players)
        -- --------------------------------------------------------
        ELSIF v_signature =
            'promote_guest_player_to_member(uuid,uuid)'
        THEN
            v_old_permission :=
                'coalesce(p.can_manage_members, false)';
            v_new_permission :=
                '(' ||
                'coalesce(p.can_manage_members, false) ' ||
                'AND coalesce(p.can_manage_players, false)' ||
                ')';
            v_old_error :=
                'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
            v_new_error :=
                'MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED';
            v_expected_count := 1;

        ELSE
            RAISE EXCEPTION
                'PLAYER_PERMISSION01C_UNHANDLED_RPC: %',
                v_signature;
        END IF;

        -- Require the exact old authorization contract before patching.
        v_actual_count :=
            (
                length(v_new_definition)
                - length(
                    replace(
                        v_new_definition,
                        v_old_permission,
                        ''
                    )
                )
            ) / nullif(length(v_old_permission), 0);

        IF v_actual_count <> v_expected_count THEN
            RAISE EXCEPTION
                'PLAYER_PERMISSION01C_PERMISSION_SOURCE_DRIFT: % expected %, found %',
                v_signature,
                v_expected_count,
                v_actual_count;
        END IF;

        IF position(v_old_error IN v_new_definition) = 0 THEN
            RAISE EXCEPTION
                'PLAYER_PERMISSION01C_ERROR_SOURCE_DRIFT: %',
                v_signature;
        END IF;

        v_new_definition := replace(
            v_new_definition,
            v_old_permission,
            v_new_permission
        );

        v_new_definition := replace(
            v_new_definition,
            v_old_error,
            v_new_error
        );

        -- Business gate must survive the authorization rewrite.
        IF position(
            'current_user_business_access_active()'
            IN v_new_definition
        ) = 0
           OR position(
               '-- ACC07B business access gate'
               IN v_new_definition
           ) = 0 THEN
            RAISE EXCEPTION
                'PLAYER_PERMISSION01C_BUSINESS_GATE_LOST: %',
                v_signature;
        END IF;

        EXECUTE v_new_definition;
    END LOOP;
END;
$player_permission01c$;

-- Explicit grants remain authenticated-only.
REVOKE ALL ON FUNCTION public.create_player(
    text, text, text, text, numeric, date, date, text
) FROM PUBLIC, anon, service_role;

REVOKE ALL ON FUNCTION public.update_player(
    uuid, text, text, text, text, text, date, date, text
) FROM PUBLIC, anon, service_role;

REVOKE ALL ON FUNCTION public.get_player_lifecycle_preview(uuid)
FROM PUBLIC, anon, service_role;

REVOKE ALL ON FUNCTION public.set_player_lifecycle_status(
    uuid, text, text
) FROM PUBLIC, anon, service_role;

REVOKE ALL ON FUNCTION public.get_admin_member_promotion_candidates()
FROM PUBLIC, anon, service_role;

REVOKE ALL ON FUNCTION public.get_admin_member_promotion_preview(
    uuid, uuid
) FROM PUBLIC, anon, service_role;

REVOKE ALL ON FUNCTION public.promote_guest_player_to_member(
    uuid, uuid
) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.create_player(
    text, text, text, text, numeric, date, date, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_player(
    uuid, text, text, text, text, text, date, date, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_player_lifecycle_preview(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_player_lifecycle_status(
    uuid, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_member_promotion_candidates()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_member_promotion_preview(
    uuid, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.promote_guest_player_to_member(
    uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.create_player(
    text, text, text, text, numeric, date, date, text
) IS
    'PLAYER-PERMISSION01C: Player creation requires active ADMIN or active can_manage_players; existing business-access gate and Player validation remain authoritative.';

COMMENT ON FUNCTION public.update_player(
    uuid, text, text, text, text, text, date, date, text
) IS
    'PLAYER-PERMISSION01C: metadata-only Player edit requires active ADMIN or active can_manage_players. Lifecycle and Rating mutation remain separate authoritative operations.';

COMMENT ON FUNCTION public.get_player_lifecycle_preview(uuid) IS
    'PLAYER-PERMISSION01C: Player lifecycle preview requires active ADMIN or active can_manage_player_lifecycle. No mutation or delete is performed.';

COMMENT ON FUNCTION public.set_player_lifecycle_status(
    uuid, text, text
) IS
    'PLAYER-PERMISSION01C: ACTIVE/INACTIVE Player lifecycle mutation requires active ADMIN or active can_manage_player_lifecycle; same-state calls remain successful no-ops.';

COMMENT ON FUNCTION public.get_admin_member_promotion_candidates() IS
    'PLAYER-PERMISSION01C: Guest-to-Member promotion candidate access requires active ADMIN or both can_manage_members and can_manage_players.';

COMMENT ON FUNCTION public.get_admin_member_promotion_preview(
    uuid, uuid
) IS
    'PLAYER-PERMISSION01C: Guest-to-Member promotion preview requires active ADMIN or both can_manage_members and can_manage_players; authoritative Player reference inventory is preserved.';

COMMENT ON FUNCTION public.promote_guest_player_to_member(
    uuid, uuid
) IS
    'PLAYER-PERMISSION01C: Guest-to-Member promotion mutation requires active ADMIN or both can_manage_members and can_manage_players; Guest identity, Rating and history preservation remain unchanged.';

COMMIT;