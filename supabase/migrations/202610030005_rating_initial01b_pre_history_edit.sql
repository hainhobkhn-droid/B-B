-- RATING-INITIAL01B: ADMIN pre-history initial Rating correction.
-- Production catalog verified read-only before authoring on 2026-10-03.
-- No historical correction, rebuild, algorithm, creation-flow, or UI change.

DO $rating_initial01b_source_contract$
DECLARE
    v_engine_definition text;
    v_business_definition text;
    v_problem text;
    v_active_settings bigint;
BEGIN
    WITH expected(table_name, column_name, data_type, nullable) AS (
        VALUES
            ('players', 'id', 'uuid', 'NO'),
            ('players', 'initial_rating', 'numeric', 'NO'),
            ('players', 'current_rating', 'numeric', 'NO'),
            ('profiles', 'id', 'uuid', 'NO'),
            ('profiles', 'role', 'text', 'NO'),
            ('profiles', 'is_active', 'boolean', 'NO'),
            ('rating_settings', 'algorithm_version', 'text', 'NO'),
            ('rating_settings', 'initial_rating', 'numeric', 'NO'),
            ('rating_settings', 'min_rating', 'numeric', 'NO'),
            ('rating_settings', 'max_rating', 'numeric', 'NO'),
            ('rating_settings', 'is_active', 'boolean', 'NO'),
            ('rating_events', 'player_id', 'uuid', 'NO'),
            ('rating_match_weights', 'match_type', 'text', 'NO'),
            ('rating_match_weights', 'weight', 'numeric', 'NO'),
            ('matches', 'id', 'uuid', 'NO'),
            ('matches', 'status', 'text', 'NO'),
            ('matches', 'match_type', 'text', 'NO'),
            ('match_players', 'match_id', 'uuid', 'NO'),
            ('match_players', 'player_id', 'uuid', 'NO'),
            ('audit_logs', 'user_id', 'uuid', 'YES'),
            ('audit_logs', 'action', 'text', 'NO'),
            ('audit_logs', 'table_name', 'text', 'YES'),
            ('audit_logs', 'record_id', 'uuid', 'YES'),
            ('audit_logs', 'old_data', 'jsonb', 'YES'),
            ('audit_logs', 'new_data', 'jsonb', 'YES'),
            ('audit_logs', 'reason', 'text', 'YES'),
            ('audit_logs', 'created_at', 'timestamp with time zone', 'NO')
    )
    SELECT string_agg(format('%I.%I', e.table_name, e.column_name), ', ')
    INTO v_problem
    FROM expected e
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = e.table_name
     AND c.column_name = e.column_name
     AND c.data_type = e.data_type
     AND c.is_nullable = e.nullable
    WHERE c.column_name IS NULL;

    IF v_problem IS NOT NULL THEN
        RAISE EXCEPTION 'RATING_INITIAL_SCHEMA_MISMATCH: %', v_problem;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'public.players'::regclass
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid, true) ~* 'initial_rating[^;]*>= *2'
          AND pg_get_constraintdef(c.oid, true) ~* 'initial_rating[^;]*<= *8'
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'public.players'::regclass
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid, true) ~* 'current_rating[^;]*>= *2'
          AND pg_get_constraintdef(c.oid, true) ~* 'current_rating[^;]*<= *8'
    ) THEN
        RAISE EXCEPTION 'RATING_INITIAL_SCHEMA_MISMATCH: players hard range';
    END IF;

    IF to_regprocedure('public.current_user_business_access_active()') IS NULL THEN
        RAISE EXCEPTION 'RATING_INITIAL_BUSINESS_GATE_MISSING';
    END IF;

    SELECT pg_get_functiondef(
        'public.current_user_business_access_active()'::regprocedure
    ) INTO v_business_definition;

    IF v_business_definition NOT LIKE '%SECURITY DEFINER%'
       OR v_business_definition NOT LIKE '%SET search_path TO ''public'', ''pg_temp''%'
       OR v_business_definition NOT LIKE '%auth.uid()%'
       OR v_business_definition NOT LIKE '%is_active IS TRUE%'
       OR v_business_definition NOT LIKE '%membership_status = ''APPROVED''%'
       OR v_business_definition NOT LIKE '%must_change_password IS NOT TRUE%' THEN
        RAISE EXCEPTION 'RATING_INITIAL_BUSINESS_GATE_CONTRACT_DRIFT';
    END IF;

    IF to_regprocedure('public._rebuild_ratings_internal(text,uuid)') IS NULL THEN
        RAISE EXCEPTION 'RATING_INITIAL_ENGINE_CONTRACT_MISSING';
    END IF;

    SELECT pg_get_functiondef(
        'public._rebuild_ratings_internal(text,uuid)'::regprocedure
    ) INTO v_engine_definition;

    IF v_engine_definition NOT LIKE '%SECURITY DEFINER%'
       OR v_engine_definition NOT LIKE '%SET search_path TO ''public'', ''pg_temp''%'
       OR v_engine_definition NOT LIKE '%pg_advisory_xact_lock(726184501)%' THEN
        RAISE EXCEPTION 'RATING_INITIAL_ENGINE_LOCK_CONTRACT_DRIFT';
    END IF;

    SELECT count(*) INTO v_active_settings
    FROM public.rating_settings
    WHERE is_active IS TRUE;

    IF v_active_settings <> 1 THEN
        RAISE EXCEPTION 'RATING_INITIAL_ACTIVE_SETTINGS_INVALID';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.rating_settings
        WHERE is_active IS TRUE
          AND (
              min_rating < 2 OR max_rating > 8
              OR min_rating >= max_rating
              OR initial_rating < min_rating
              OR initial_rating > max_rating
          )
    ) THEN
        RAISE EXCEPTION 'RATING_INITIAL_ACTIVE_SETTINGS_HARD_RANGE_CONFLICT';
    END IF;

    IF has_table_privilege('authenticated', 'public.players', 'UPDATE') THEN
        RAISE EXCEPTION 'RATING_INITIAL_DIRECT_PLAYER_UPDATE_GRANT_DETECTED';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('players'), ('rating_events'), ('rating_match_weights'),
            ('matches'), ('match_players'), ('audit_logs')
        ) AS expected(table_name)
        WHERE NOT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = expected.table_name
              AND c.relrowsecurity IS TRUE
        )
    ) THEN
        RAISE EXCEPTION 'RATING_INITIAL_RLS_CONTRACT_DRIFT';
    END IF;
END;
$rating_initial01b_source_contract$;

CREATE OR REPLACE FUNCTION public.player_has_approved_rated_history(
    p_player_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT
        EXISTS (
            SELECT 1
            FROM public.rating_events re
            WHERE re.player_id = p_player_id
        )
        OR EXISTS (
            SELECT 1
            FROM public.match_players mp
            JOIN public.matches m ON m.id = mp.match_id
            JOIN public.rating_match_weights w ON w.match_type = m.match_type
            WHERE mp.player_id = p_player_id
              AND m.status = 'APPROVED'
              AND w.weight > 0
        );
$function$;

REVOKE ALL ON FUNCTION public.player_has_approved_rated_history(uuid)
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.player_has_approved_rated_history(uuid) IS
'Internal authoritative Rated-history guard. rating_events always block; otherwise only match_players.player_id in APPROVED matches with current weight > 0 blocks. partner_player_id is intentionally excluded.';

CREATE OR REPLACE FUNCTION public.set_player_initial_rating_before_history(
    p_player_id uuid,
    p_rating numeric,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid;
    v_reason text;
    v_old public.players%rowtype;
    v_new public.players%rowtype;
    v_settings public.rating_settings%rowtype;
    v_settings_count bigint;
    v_changed_at timestamptz := clock_timestamp();
BEGIN
    v_actor := auth.uid();

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_actor
          AND p.is_active IS TRUE
          AND upper(coalesce(p.role, '')) = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF p_player_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_ID_REQUIRED' USING ERRCODE = '22023';
    END IF;

    IF p_rating IS NULL OR p_rating::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'PLAYER_RATING_REQUIRED' USING ERRCODE = '22023';
    END IF;

    v_reason := nullif(btrim(p_reason), '');
    IF v_reason IS NULL OR char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION 'REASON_REQUIRED_MAX_1000' USING ERRCODE = '22023';
    END IF;

    -- This order is shared with the authoritative Rating engine.
    PERFORM pg_advisory_xact_lock(726184501);

    SELECT * INTO v_old
    FROM public.players p
    WHERE p.id = p_player_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*) INTO v_settings_count
    FROM public.rating_settings s
    WHERE s.is_active IS TRUE;

    IF v_settings_count <> 1 THEN
        RAISE EXCEPTION 'RATING_ACTIVE_SETTINGS_INVALID';
    END IF;

    SELECT * INTO v_settings
    FROM public.rating_settings s
    WHERE s.is_active IS TRUE;

    IF v_settings.min_rating < 2 OR v_settings.max_rating > 8
       OR v_settings.min_rating >= v_settings.max_rating
       OR v_settings.initial_rating < v_settings.min_rating
       OR v_settings.initial_rating > v_settings.max_rating THEN
        RAISE EXCEPTION 'RATING_ACTIVE_SETTINGS_HARD_RANGE_CONFLICT';
    END IF;

    IF p_rating < v_settings.min_rating OR p_rating > v_settings.max_rating
       OR p_rating < 2 OR p_rating > 8 THEN
        RAISE EXCEPTION 'PLAYER_RATING_OUT_OF_RANGE' USING ERRCODE = '22023';
    END IF;

    -- Recompute only after both the global Rating lock and Player row lock.
    IF public.player_has_approved_rated_history(v_old.id) THEN
        RAISE EXCEPTION 'PLAYER_RATING_HISTORY_EXISTS' USING ERRCODE = '55000';
    END IF;

    IF v_old.initial_rating IS DISTINCT FROM v_old.current_rating THEN
        RAISE EXCEPTION 'PLAYER_RATING_STATE_INCONSISTENT'
            USING ERRCODE = '55000',
                  DETAIL = format(
                      'player_id=%s old_initial_rating=%s old_current_rating=%s',
                      v_old.id, v_old.initial_rating, v_old.current_rating
                  );
    END IF;

    IF v_old.initial_rating = p_rating THEN
        RETURN jsonb_build_object(
            'success', true,
            'changed', false,
            'player_id', v_old.id,
            'old_initial_rating', v_old.initial_rating,
            'old_current_rating', v_old.current_rating,
            'new_initial_rating', v_old.initial_rating,
            'new_current_rating', v_old.current_rating,
            'rating_settings_version', v_settings.algorithm_version,
            'reason', v_reason
        );
    END IF;

    UPDATE public.players
    SET initial_rating = p_rating,
        current_rating = p_rating,
        updated_at = v_changed_at
    WHERE id = v_old.id
    RETURNING * INTO v_new;

    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason,
        created_at
    ) VALUES (
        v_actor,
        'PLAYER_INITIAL_RATING_CHANGED',
        'players',
        v_new.id,
        jsonb_build_object(
            'player_id', v_old.id,
            'initial_rating', v_old.initial_rating,
            'current_rating', v_old.current_rating,
            'rating_settings_version', v_settings.algorithm_version
        ),
        jsonb_build_object(
            'player_id', v_new.id,
            'initial_rating', v_new.initial_rating,
            'current_rating', v_new.current_rating,
            'rating_settings_version', v_settings.algorithm_version,
            'changed_at', v_changed_at
        ),
        v_reason,
        v_changed_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'changed', true,
        'player_id', v_new.id,
        'old_initial_rating', v_old.initial_rating,
        'old_current_rating', v_old.current_rating,
        'new_initial_rating', v_new.initial_rating,
        'new_current_rating', v_new.current_rating,
        'rating_settings_version', v_settings.algorithm_version,
        'reason', v_reason
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_player_initial_rating_before_history(
    uuid, numeric, text
)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.set_player_initial_rating_before_history(
    uuid, numeric, text
)
TO authenticated;

COMMENT ON FUNCTION public.set_player_initial_rating_before_history(
    uuid, numeric, text
) IS
'ADMIN-only atomic initial/current Rating correction for a Player with no authoritative Rated history. Same-value calls are successful no-ops without audit.';
