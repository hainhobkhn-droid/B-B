-- PLAYER-LIFECYCLE01B: explicit ACTIVE <-> INACTIVE Player transitions.
-- No Player delete, UI change, reference-based block, or history mutation.

DO $player_lifecycle01b_source_contract$
DECLARE
    v_update_definition text;
BEGIN
    IF to_regprocedure('public.player_reference_snapshot(uuid)') IS NULL
       OR to_regprocedure('public.get_player_lifecycle_preview(uuid)') IS NULL THEN
        RAISE EXCEPTION 'PLAYER_LIFECYCLE01A_REQUIRED';
    END IF;

    IF to_regprocedure(
        'public.update_player(uuid,text,text,text,text,text,date,date,text)'
    ) IS NULL THEN
        RAISE EXCEPTION 'UPDATE_PLAYER_SOURCE_CONTRACT_MISSING';
    END IF;

    SELECT pg_get_functiondef(
        'public.update_player(uuid,text,text,text,text,text,date,date,text)'::regprocedure
    ) INTO v_update_definition;

    IF v_update_definition NOT LIKE '%SECURITY DEFINER%'
       OR v_update_definition NOT LIKE '%status = v_status%'
       OR v_update_definition NOT LIKE '%''UPDATE_PLAYER''%'
       OR v_update_definition NOT LIKE '%''PLAYER_WRITE_API_V1''%'
       OR v_update_definition NOT LIKE '%current_user_business_access_active()%' THEN
        RAISE EXCEPTION 'UPDATE_PLAYER_SOURCE_CONTRACT_DRIFT';
    END IF;
END;
$player_lifecycle01b_source_contract$;

CREATE OR REPLACE FUNCTION public.set_player_lifecycle_status(
    p_player_id uuid,
    p_status text,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid;
    v_status text;
    v_reason text;
    v_old public.players%rowtype;
    v_new public.players%rowtype;
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
          AND (
              upper(coalesce(p.role, '')) = 'ADMIN'
              OR coalesce(p.can_manage_members, false)
          )
    ) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_player_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_ID_REQUIRED' USING ERRCODE = '22023';
    END IF;

    v_status := upper(btrim(coalesce(p_status, '')));
    IF v_status NOT IN ('ACTIVE', 'INACTIVE') THEN
        RAISE EXCEPTION 'PLAYER_STATUS_INVALID' USING ERRCODE = '22023';
    END IF;

    v_reason := nullif(btrim(p_reason), '');
    IF v_reason IS NULL OR char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION 'REASON_REQUIRED_MAX_1000' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_old
    FROM public.players p
    WHERE p.id = p_player_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF v_old.status = v_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'changed', false,
            'player_id', v_old.id,
            'old_status', v_old.status,
            'new_status', v_old.status,
            'reason', v_reason
        );
    END IF;

    UPDATE public.players
    SET status = v_status
    WHERE id = v_old.id
    RETURNING * INTO v_new;

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
        'PLAYER_STATUS_CHANGED',
        'players',
        v_new.id,
        jsonb_build_object('status', v_old.status),
        jsonb_build_object('status', v_new.status),
        v_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'changed', true,
        'player_id', v_new.id,
        'old_status', v_old.status,
        'new_status', v_new.status,
        'reason', v_reason
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_player_lifecycle_status(uuid, text, text)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.set_player_lifecycle_status(uuid, text, text)
TO authenticated;

COMMENT ON FUNCTION public.set_player_lifecycle_status(uuid, text, text) IS
'Authoritative ACTIVE/INACTIVE Player status transition. Same-status calls are successful no-ops and do not append an audit event.';

-- Keep the existing signature for metadata callers. p_status is now a
-- compatibility assertion and cannot mutate lifecycle state.
CREATE OR REPLACE FUNCTION public.update_player(
    p_player_id uuid,
    p_full_name text,
    p_player_type text,
    p_phone text,
    p_email text,
    p_status text,
    p_joined_at date,
    p_date_of_birth date,
    p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid;
    v_name text;
    v_type text;
    v_asserted_status text;
    v_old public.players%rowtype;
    v_new public.players%rowtype;
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
          AND (
              upper(coalesce(p.role, '')) = 'ADMIN'
              OR coalesce(p.can_manage_members, false)
          )
    ) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_player_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_ID_REQUIRED' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_old
    FROM public.players p
    WHERE p.id = p_player_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    v_asserted_status := upper(btrim(coalesce(p_status, '')));
    IF v_asserted_status NOT IN ('ACTIVE', 'INACTIVE') THEN
        RAISE EXCEPTION 'INVALID_PLAYER_STATUS' USING ERRCODE = '22023';
    END IF;

    IF v_asserted_status <> v_old.status THEN
        RAISE EXCEPTION 'PLAYER_STATUS_CHANGE_REQUIRES_LIFECYCLE_RPC'
            USING ERRCODE = '22023';
    END IF;

    v_name := nullif(btrim(p_full_name), '');
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'PLAYER_NAME_REQUIRED' USING ERRCODE = '22023';
    END IF;

    v_type := upper(btrim(coalesce(p_player_type, '')));
    IF v_type NOT IN ('CLUB', 'GUEST') THEN
        RAISE EXCEPTION 'INVALID_PLAYER_TYPE' USING ERRCODE = '22023';
    END IF;

    IF p_date_of_birth IS NOT NULL AND p_date_of_birth > current_date THEN
        RAISE EXCEPTION 'INVALID_DATE_OF_BIRTH' USING ERRCODE = '22023';
    END IF;

    UPDATE public.players
    SET
        full_name = v_name,
        player_type = v_type,
        phone = nullif(btrim(p_phone), ''),
        email = nullif(btrim(p_email), ''),
        joined_at = p_joined_at,
        date_of_birth = p_date_of_birth,
        notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    WHERE id = v_old.id
    RETURNING * INTO v_new;

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
        'UPDATE_PLAYER',
        'players',
        v_new.id,
        to_jsonb(v_old),
        to_jsonb(v_new),
        'PLAYER_WRITE_API_V2_METADATA_ONLY'
    );

    RETURN jsonb_build_object(
        'success', true,
        'player_id', v_new.id,
        'full_name', v_new.full_name,
        'player_type', v_new.player_type,
        'status', v_new.status,
        'date_of_birth', v_new.date_of_birth
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_player(
    uuid, text, text, text, text, text, date, date, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_player(
    uuid, text, text, text, text, text, date, date, text
) TO authenticated;

COMMENT ON FUNCTION public.update_player(
    uuid, text, text, text, text, text, date, date, text
) IS
'Metadata-only Player update. p_status is retained as a compatibility assertion; lifecycle changes require set_player_lifecycle_status.';
