-- WP-C2 / PLAYER-PERMISSION01: authoritative Guest -> Member candidate read model.
-- Keeps direct players RLS unchanged and leaves promotion preview/mutation authoritative.

BEGIN;

DO $wp_c2_preflight$
DECLARE
    v_column_count integer;
BEGIN
    IF to_regprocedure('public.current_user_business_access_active()') IS NULL THEN
        RAISE EXCEPTION 'WP_C2_BUSINESS_ACCESS_GATE_MISSING';
    END IF;

    IF to_regprocedure('public.promote_guest_player_to_member(uuid,uuid)') IS NULL
       OR to_regprocedure('public.get_admin_member_promotion_preview(uuid,uuid)') IS NULL THEN
        RAISE EXCEPTION 'WP_C2_PROMOTION_CONTRACT_MISSING';
    END IF;

    IF to_regprocedure('public.get_guest_member_promotion_candidates()') IS NOT NULL THEN
        RAISE EXCEPTION 'WP_C2_READ_MODEL_ALREADY_EXISTS';
    END IF;

    SELECT count(*)
    INTO v_column_count
    FROM (
        VALUES
            ('profiles', 'id', 'uuid'),
            ('profiles', 'full_name', 'text'),
            ('profiles', 'role', 'text'),
            ('profiles', 'is_active', 'boolean'),
            ('profiles', 'player_id', 'uuid'),
            ('profiles', 'can_manage_members', 'boolean'),
            ('profiles', 'can_manage_players', 'boolean'),
            ('players', 'id', 'uuid'),
            ('players', 'full_name', 'text'),
            ('players', 'player_type', 'text'),
            ('players', 'status', 'text'),
            ('players', 'current_rating', 'numeric')
    ) expected(table_name, column_name, data_type)
    JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = expected.table_name
     AND c.column_name = expected.column_name
     AND c.data_type = expected.data_type;

    IF v_column_count <> 12 THEN
        RAISE EXCEPTION 'WP_C2_SCHEMA_CONTRACT_DRIFT: expected 12 columns, found %',
            v_column_count;
    END IF;
END;
$wp_c2_preflight$;

CREATE FUNCTION public.get_guest_member_promotion_candidates()
RETURNS TABLE (
    candidate_kind text,
    profile_id uuid,
    profile_full_name text,
    player_id uuid,
    player_full_name text,
    player_type text,
    status text,
    current_rating numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles actor_profile
        WHERE actor_profile.id = v_actor_id
          AND (
              upper(coalesce(actor_profile.role, '')) = 'ADMIN'
              OR (
                  coalesce(actor_profile.can_manage_members, false)
                  AND coalesce(actor_profile.can_manage_players, false)
              )
          )
    ) THEN
        RAISE EXCEPTION 'MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        candidate.candidate_kind,
        candidate.profile_id,
        candidate.profile_full_name,
        candidate.player_id,
        candidate.player_full_name,
        candidate.player_type,
        candidate.status,
        candidate.current_rating
    FROM (
        SELECT
            'MEMBER_TARGET'::text AS candidate_kind,
            member_profile.id AS profile_id,
            member_profile.full_name AS profile_full_name,
            linked_player.id AS player_id,
            linked_player.full_name AS player_full_name,
            linked_player.player_type,
            linked_player.status,
            linked_player.current_rating
        FROM public.profiles member_profile
        JOIN public.players linked_player
          ON linked_player.id = member_profile.player_id
        WHERE member_profile.role = 'MEMBER'
          AND member_profile.is_active IS TRUE
          AND linked_player.player_type = 'CLUB'
          AND linked_player.status = 'ACTIVE'

        UNION ALL

        SELECT
            'GUEST_SOURCE'::text AS candidate_kind,
            NULL::uuid AS profile_id,
            NULL::text AS profile_full_name,
            guest_player.id AS player_id,
            guest_player.full_name AS player_full_name,
            guest_player.player_type,
            guest_player.status,
            guest_player.current_rating
        FROM public.players guest_player
        WHERE guest_player.player_type = 'GUEST'
          AND guest_player.status = 'ACTIVE'
          AND NOT EXISTS (
              SELECT 1
              FROM public.profiles linked_profile
              WHERE linked_profile.player_id = guest_player.id
          )
    ) candidate
    ORDER BY
        CASE candidate.candidate_kind
            WHEN 'MEMBER_TARGET' THEN 1
            ELSE 2
        END,
        coalesce(candidate.profile_full_name, candidate.player_full_name),
        candidate.player_id;
END;
$function$;

REVOKE ALL
ON FUNCTION public.get_guest_member_promotion_candidates()
FROM PUBLIC, anon, service_role;

GRANT EXECUTE
ON FUNCTION public.get_guest_member_promotion_candidates()
TO authenticated;

COMMENT ON FUNCTION public.get_guest_member_promotion_candidates() IS
'WP-C2 authoritative minimal candidate read model for Guest-to-Member promotion. Requires active ADMIN or both can_manage_members and can_manage_players; preview and mutation remain final authority.';

COMMIT;
