-- PLAYER-LIFECYCLE01D: converge Guest promotion guards on the 01A inventory.
-- ACC05 remains separate because its Account/audit blockers are intentionally wider.

DO $player_lifecycle01d_source_contract$
DECLARE
    v_helper text;
    v_preview text;
    v_promote text;
BEGIN
    IF to_regprocedure('public.player_reference_snapshot(uuid)') IS NULL THEN
        RAISE EXCEPTION 'PLAYER_LIFECYCLE01A_REQUIRED';
    END IF;

    SELECT pg_get_functiondef('public.player_reference_snapshot(uuid)'::regprocedure)
    INTO v_helper;
    IF v_helper NOT LIKE '%PLAYER-LIFECYCLE01A%'
       OR v_helper NOT LIKE '%match_players_partner_count%'
       OR v_helper NOT LIKE '%tournament_registrations_partner_count%'
       OR v_helper NOT LIKE '%audit_logs_blocking%'
       OR v_helper NOT LIKE '%reference_total%' THEN
        RAISE EXCEPTION 'PLAYER_LIFECYCLE01A_SOURCE_CONTRACT_DRIFT';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND c.conrelid = 'public.match_players'::regclass
          AND c.confrelid = 'public.players'::regclass
          AND array_length(c.conkey, 1) = 1
          AND a.attname = 'partner_player_id'
          AND c.confdeltype = 'r'
    ) THEN
        RAISE EXCEPTION 'PLAYER_LIFECYCLE01C_PARTNER_FK_REQUIRED';
    END IF;

    IF to_regprocedure(
        'public.get_admin_member_promotion_preview(uuid,uuid)'
    ) IS NULL OR to_regprocedure(
        'public.promote_guest_player_to_member(uuid,uuid)'
    ) IS NULL THEN
        RAISE EXCEPTION 'PROMOTION_SOURCE_CONTRACT_MISSING';
    END IF;

    SELECT lower(pg_get_functiondef(
        'public.get_admin_member_promotion_preview(uuid,uuid)'::regprocedure
    )) INTO v_preview;
    SELECT lower(pg_get_functiondef(
        'public.promote_guest_player_to_member(uuid,uuid)'::regprocedure
    )) INTO v_promote;

    IF v_preview NOT LIKE '%security definer%'
       OR v_preview NOT LIKE '%current_user_business_access_active()%'
       OR v_preview NOT LIKE '%v_match_players%'
       OR v_preview NOT LIKE '%where player_id = v_temp.id%'
       OR v_preview NOT LIKE '%''counts''%'
       OR v_preview NOT LIKE '%''matches''%'
       OR v_preview NOT LIKE '%''ratings''%'
       OR v_preview NOT LIKE '%''links''%'
       OR v_preview NOT LIKE '%''blocked''%'
       OR v_preview LIKE '%player_reference_snapshot%' THEN
        RAISE EXCEPTION 'PROMOTION_PREVIEW_SOURCE_CONTRACT_DRIFT';
    END IF;

    IF v_promote NOT LIKE '%security definer%'
       OR v_promote NOT LIKE '%current_user_business_access_active()%'
       OR v_promote NOT LIKE '%v_business_count%'
       OR v_promote NOT LIKE '%temp_player_has_business_data%'
       OR v_promote NOT LIKE '%admin_confirmed_existing_guest_as_member%'
       OR v_promote NOT LIKE '%set player_id = null%'
       OR v_promote LIKE '%player_reference_snapshot%' THEN
        RAISE EXCEPTION 'PROMOTION_MUTATION_SOURCE_CONTRACT_DRIFT';
    END IF;
END;
$player_lifecycle01d_source_contract$;

CREATE OR REPLACE FUNCTION public.get_admin_member_promotion_preview(
    p_profile_id uuid,
    p_guest_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid;
    v_actor_profile public.profiles%rowtype;
    v_profile public.profiles%rowtype;
    v_temp public.players%rowtype;
    v_guest public.players%rowtype;
    v_temp_snapshot jsonb;
    v_guest_snapshot jsonb;
    v_temp_business_total bigint;
    v_guest_links bigint;
BEGIN
    v_actor := auth.uid();
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_actor_profile
    FROM public.profiles p WHERE p.id = v_actor;
    IF NOT FOUND
       OR v_actor_profile.is_active IS NOT TRUE
       OR (
           upper(coalesce(v_actor_profile.role, '')) <> 'ADMIN'
           AND coalesce(v_actor_profile.can_manage_members, false) = false
       ) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.role = 'MEMBER'
      AND p.is_active IS TRUE
      AND p.player_id IS NOT NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MEMBER_NOT_ELIGIBLE';
    END IF;

    SELECT * INTO v_temp FROM public.players p WHERE p.id = v_profile.player_id;
    IF NOT FOUND OR v_temp.player_type <> 'CLUB' OR v_temp.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'TEMP_PLAYER_NOT_ELIGIBLE';
    END IF;

    SELECT * INTO v_guest FROM public.players p WHERE p.id = p_guest_player_id;
    IF NOT FOUND
       OR v_guest.player_type <> 'GUEST'
       OR v_guest.status <> 'ACTIVE'
       OR v_guest.id = v_temp.id THEN
        RAISE EXCEPTION 'GUEST_NOT_ELIGIBLE';
    END IF;

    v_temp_snapshot := public.player_reference_snapshot(v_temp.id);
    v_guest_snapshot := public.player_reference_snapshot(v_guest.id);

    -- The target MEMBER's own link to its temp Player is expected and was not
    -- a business blocker in the original promotion contract.
    v_temp_business_total :=
          (v_temp_snapshot ->> 'reference_total')::bigint
        - 1;
    v_guest_links := (v_guest_snapshot ->> 'profile_link_count')::bigint;

    RETURN jsonb_build_object(
        'profile', jsonb_build_object(
            'id', v_profile.id,
            'full_name', v_profile.full_name,
            'player_id', v_profile.player_id
        ),
        'temp', jsonb_build_object(
            'id', v_temp.id,
            'full_name', v_temp.full_name,
            'player_type', v_temp.player_type,
            'status', v_temp.status,
            'current_rating', v_temp.current_rating
        ),
        'target', jsonb_build_object(
            'id', v_guest.id,
            'full_name', v_guest.full_name,
            'player_type', v_guest.player_type,
            'status', v_guest.status,
            'current_rating', v_guest.current_rating
        ),
        'counts', jsonb_build_array(
            (v_temp_snapshot ->> 'match_players_count')::bigint,
            (v_temp_snapshot ->> 'rating_events_count')::bigint,
            (v_temp_snapshot ->> 'rating_adjustments_count')::bigint,
            (v_temp_snapshot ->> 'rating_adjustment_events_count')::bigint,
            (v_temp_snapshot ->> 'fund_contributions_count')::bigint,
            (v_temp_snapshot ->> 'fund_payments_count')::bigint,
            (v_temp_snapshot ->> 'fund_transactions_count')::bigint,
            (v_temp_snapshot ->> 'tournament_registrations_count')::bigint,
            (v_temp_snapshot ->> 'tournament_payments_count')::bigint,
            (v_temp_snapshot ->> 'awards_count')::bigint
        ),
        'matches', (v_guest_snapshot ->> 'match_players_count')::bigint,
        'ratings', (v_guest_snapshot ->> 'rating_events_count')::bigint,
        'links', v_guest_links,
        'blocked', v_guest_links > 0 OR v_temp_business_total > 0,
        'inventory_version', v_temp_snapshot ->> 'inventory_version',
        'temp_reference_summary', v_temp_snapshot
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_guest_player_to_member(
    p_profile_id uuid,
    p_guest_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_profile public.profiles%rowtype;
    v_temp public.players%rowtype;
    v_guest public.players%rowtype;
    v_temp_snapshot jsonb;
    v_guest_snapshot jsonb;
    v_temp_business_total bigint;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_actor_id
          AND p.is_active IS TRUE
          AND (
              upper(coalesce(p.role, '')) = 'ADMIN'
              OR coalesce(p.can_manage_members, false)
          )
    ) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles p
    WHERE p.id = p_profile_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
    IF v_profile.role <> 'MEMBER' THEN RAISE EXCEPTION 'TARGET_PROFILE_MUST_BE_MEMBER'; END IF;
    IF NOT v_profile.is_active THEN RAISE EXCEPTION 'TARGET_PROFILE_INACTIVE'; END IF;
    IF v_profile.player_id IS NULL THEN RAISE EXCEPTION 'TARGET_PROFILE_HAS_NO_TEMP_PLAYER'; END IF;
    IF v_profile.player_id = p_guest_player_id THEN
        RAISE EXCEPTION 'PROFILE_ALREADY_LINKED_TO_TARGET_PLAYER';
    END IF;

    SELECT * INTO v_temp
    FROM public.players p WHERE p.id = v_profile.player_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEMP_PLAYER_NOT_FOUND'; END IF;
    IF v_temp.player_type <> 'CLUB' OR v_temp.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'TEMP_PLAYER_NOT_ACTIVE_CLUB';
    END IF;

    SELECT * INTO v_guest
    FROM public.players p WHERE p.id = p_guest_player_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'GUEST_PLAYER_NOT_FOUND'; END IF;
    IF v_guest.player_type <> 'GUEST' OR v_guest.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'TARGET_PLAYER_NOT_ACTIVE_GUEST';
    END IF;

    v_temp_snapshot := public.player_reference_snapshot(v_temp.id);
    v_guest_snapshot := public.player_reference_snapshot(v_guest.id);
    v_temp_business_total :=
          (v_temp_snapshot ->> 'reference_total')::bigint
        - 1;

    IF (v_guest_snapshot ->> 'profile_link_count')::bigint <> 0 THEN
        RAISE EXCEPTION 'GUEST_PLAYER_ALREADY_LINKED';
    END IF;
    IF v_temp_business_total <> 0 THEN
        RAISE EXCEPTION 'TEMP_PLAYER_HAS_BUSINESS_DATA'
            USING ERRCODE = '23503', DETAIL = v_temp_snapshot::text;
    END IF;

    -- Preserve Guest identity, Rating and all historical rows.
    UPDATE public.players
    SET player_type = 'CLUB', updated_at = now()
    WHERE id = v_guest.id;

    -- Unlink first because profiles.player_id is UNIQUE in production.
    UPDATE public.profiles SET player_id = NULL WHERE id = v_profile.id;
    UPDATE public.players SET status = 'INACTIVE', updated_at = now()
    WHERE id = v_temp.id;
    UPDATE public.profiles SET player_id = v_guest.id WHERE id = v_profile.id;

    INSERT INTO public.audit_logs (
        user_id, action, table_name, record_id, old_data, new_data, reason
    ) VALUES (
        v_actor_id,
        'PROMOTE_GUEST_TO_MEMBER',
        'profiles',
        v_profile.id,
        jsonb_build_object(
            'profile_id', v_profile.id,
            'old_player_id', v_temp.id,
            'old_player_name', v_temp.full_name,
            'guest_player_id', v_guest.id,
            'guest_player_name', v_guest.full_name
        ),
        jsonb_build_object(
            'profile_id', v_profile.id,
            'player_id', v_guest.id,
            'player_type', 'CLUB',
            'preserved_rating', v_guest.current_rating,
            'temporary_player_id', v_temp.id,
            'temporary_player_status', 'INACTIVE',
            'inventory_version', v_temp_snapshot ->> 'inventory_version'
        ),
        'ADMIN_CONFIRMED_EXISTING_GUEST_AS_MEMBER'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'profile_id', v_profile.id,
        'player_id', v_guest.id,
        'temporary_player_id', v_temp.id,
        'rating_preserved', v_guest.current_rating
    );
END;
$function$;

COMMENT ON FUNCTION public.get_admin_member_promotion_preview(uuid, uuid) IS
'Backward-compatible Guest promotion preview using PLAYER-LIFECYCLE01A authoritative inventory, including primary and partner references.';

COMMENT ON FUNCTION public.promote_guest_player_to_member(uuid, uuid) IS
'Guest promotion mutation with transaction-local authoritative Player reference recheck; preserves Guest identity, Rating and history.';
