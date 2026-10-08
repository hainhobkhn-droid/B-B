CREATE OR REPLACE FUNCTION public.set_player_initial_rating_before_history(p_player_id uuid, p_rating numeric, p_reason text)
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
$function$
