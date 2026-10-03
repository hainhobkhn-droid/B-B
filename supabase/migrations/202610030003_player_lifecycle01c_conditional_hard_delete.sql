-- PLAYER-LIFECYCLE01C: race-safe conditional Player hard delete.
-- No UI, Account hard-delete, Guest promotion, match, rating, or history mutation.

DO $player_lifecycle01c_source_contract$
DECLARE
    v_snapshot_definition text;
    v_status_definition text;
    v_update_definition text;
    v_problem text;
BEGIN
    IF to_regprocedure('public.player_reference_snapshot(uuid)') IS NULL
       OR to_regprocedure('public.get_player_lifecycle_preview(uuid)') IS NULL THEN
        RAISE EXCEPTION 'PLAYER_LIFECYCLE01A_REQUIRED';
    END IF;

    SELECT pg_get_functiondef('public.player_reference_snapshot(uuid)'::regprocedure)
    INTO v_snapshot_definition;

    IF v_snapshot_definition NOT LIKE '%PLAYER-LIFECYCLE01A%'
       OR v_snapshot_definition NOT LIKE '%match_players_partner_count%'
       OR v_snapshot_definition NOT LIKE '%tournament_registrations_partner_count%'
       OR v_snapshot_definition NOT LIKE '%audit_logs_blocking%'
       OR v_snapshot_definition NOT LIKE '%reference_total%' THEN
        RAISE EXCEPTION 'PLAYER_LIFECYCLE01A_SOURCE_CONTRACT_DRIFT';
    END IF;

    IF to_regprocedure(
        'public.set_player_lifecycle_status(uuid,text,text)'
    ) IS NULL OR to_regprocedure(
        'public.update_player(uuid,text,text,text,text,text,date,date,text)'
    ) IS NULL THEN
        RAISE EXCEPTION 'PLAYER_LIFECYCLE01B_REQUIRED';
    END IF;

    SELECT pg_get_functiondef(
        'public.set_player_lifecycle_status(uuid,text,text)'::regprocedure
    ) INTO v_status_definition;
    SELECT pg_get_functiondef(
        'public.update_player(uuid,text,text,text,text,text,date,date,text)'::regprocedure
    ) INTO v_update_definition;

    IF v_status_definition NOT LIKE '%PLAYER_STATUS_CHANGED%'
       OR v_status_definition NOT LIKE '%current_user_business_access_active()%'
       OR v_update_definition NOT LIKE '%PLAYER_STATUS_CHANGE_REQUIRES_LIFECYCLE_RPC%'
       OR v_update_definition NOT LIKE '%PLAYER_WRITE_API_V2_METADATA_ONLY%' THEN
        RAISE EXCEPTION 'PLAYER_LIFECYCLE01B_SOURCE_CONTRACT_DRIFT';
    END IF;

    WITH expected(table_name, column_name) AS (
        VALUES
            ('profiles', 'player_id'),
            ('match_players', 'player_id'),
            ('match_players', 'partner_player_id'),
            ('rating_events', 'player_id'),
            ('rating_adjustments', 'player_id'),
            ('rating_adjustment_events', 'player_id'),
            ('fund_contributions', 'player_id'),
            ('fund_payments', 'player_id'),
            ('fund_transactions', 'player_id'),
            ('tournament_registrations', 'player_id'),
            ('tournament_registrations', 'partner_player_id'),
            ('tournament_payments', 'player_id'),
            ('awards', 'player_id')
    )
    SELECT string_agg(format('%I.%I', e.table_name, e.column_name), ', ')
    INTO v_problem
    FROM expected e
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = e.table_name
     AND c.column_name = e.column_name
     AND c.data_type = 'uuid'
    WHERE c.column_name IS NULL;

    IF v_problem IS NOT NULL THEN
        RAISE EXCEPTION 'PLAYER_REFERENCE_SCHEMA_MISMATCH: %', v_problem;
    END IF;

    IF to_regprocedure('public.current_user_business_access_active()') IS NULL THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_HELPER_REQUIRED';
    END IF;

    IF has_table_privilege('authenticated', 'public.players', 'DELETE') THEN
        RAISE EXCEPTION 'PLAYER_DELETE_GRANT_CONTRACT_DRIFT';
    END IF;

    IF EXISTS (
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
    ) THEN
        RAISE EXCEPTION 'MATCH_PARTNER_FK_SOURCE_CONTRACT_DRIFT';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.match_players mp
        LEFT JOIN public.players p ON p.id = mp.partner_player_id
        WHERE mp.partner_player_id IS NOT NULL
          AND p.id IS NULL
    ) THEN
        RAISE EXCEPTION 'MATCH_PARTNER_ORPHANS_REQUIRE_REPAIR';
    END IF;

    WITH expected(column_name, data_type) AS (
        VALUES
            ('id', 'uuid'),
            ('user_id', 'uuid'),
            ('action', 'text'),
            ('table_name', 'text'),
            ('record_id', 'uuid'),
            ('old_data', 'jsonb'),
            ('new_data', 'jsonb'),
            ('reason', 'text'),
            ('created_at', 'timestamp with time zone')
    )
    SELECT string_agg(format('audit_logs.%I', e.column_name), ', ')
    INTO v_problem
    FROM expected e
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = 'audit_logs'
     AND c.column_name = e.column_name
     AND c.data_type = e.data_type
    WHERE c.column_name IS NULL;

    IF v_problem IS NOT NULL THEN
        RAISE EXCEPTION 'PLAYER_TOMBSTONE_SCHEMA_MISMATCH: %', v_problem;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.conrelid = 'public.audit_logs'::regclass
          AND c.confrelid = 'public.players'::regclass
    ) THEN
        RAISE EXCEPTION 'PLAYER_TOMBSTONE_BLOCKED_BY_AUDIT_FK';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'audit_logs'
          AND c.column_name = 'id'
          AND c.is_nullable = 'NO'
          AND c.column_default IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'audit_logs'
          AND c.column_name = 'action'
          AND c.is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'audit_logs'
          AND c.column_name = 'created_at'
          AND c.is_nullable = 'NO'
          AND c.column_default IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'PLAYER_TOMBSTONE_REQUIRED_DEFAULT_CONTRACT_DRIFT';
    END IF;
END;
$player_lifecycle01c_source_contract$;

-- Production has no FK on this logical reference. Add the missing lock-backed
-- integrity constraint so a partner-only insert cannot race past Player delete.
ALTER TABLE public.match_players
ADD CONSTRAINT match_players_partner_player_id_fkey
FOREIGN KEY (partner_player_id)
REFERENCES public.players(id)
ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.delete_player_if_unreferenced(
    p_player_id uuid,
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
    v_player public.players%rowtype;
    v_snapshot jsonb;
    v_reference_total bigint;
    v_tombstone_id uuid;
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

    v_reason := nullif(btrim(p_reason), '');
    IF v_reason IS NULL OR char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION 'REASON_REQUIRED_MAX_1000' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_player
    FROM public.players p
    WHERE p.id = p_player_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Every reference writer now acquires a key-share lock through its FK,
    -- including match_players.partner_player_id added by this migration.
    v_snapshot := public.player_reference_snapshot(v_player.id);
    v_reference_total := (v_snapshot ->> 'reference_total')::bigint;

    IF v_reference_total <> 0 THEN
        RAISE EXCEPTION 'PLAYER_HAS_REFERENCES'
            USING ERRCODE = '23503', DETAIL = v_snapshot::text;
    END IF;

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
        'PLAYER_HARD_DELETED',
        'players',
        v_player.id,
        jsonb_build_object(
            'player_id', v_player.id,
            'full_name', v_player.full_name,
            'player_type', v_player.player_type,
            'status', v_player.status,
            'initial_rating', v_player.initial_rating,
            'current_rating', v_player.current_rating
        ),
        jsonb_build_object(
            'hard_deleted', true,
            'inventory_version', v_snapshot ->> 'inventory_version',
            'reference_total', v_reference_total
        ),
        v_reason
    )
    RETURNING id INTO v_tombstone_id;

    DELETE FROM public.players
    WHERE id = v_player.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAYER_DELETE_FAILED' USING ERRCODE = 'P0001';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deleted', true,
        'player_id', v_player.id,
        'reason', v_reason,
        'inventory_version', v_snapshot ->> 'inventory_version',
        'tombstone_audit_id', v_tombstone_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_player_if_unreferenced(uuid, text)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.delete_player_if_unreferenced(uuid, text)
TO authenticated;

COMMENT ON FUNCTION public.delete_player_if_unreferenced(uuid, text) IS
'ADMIN-only conditional Player hard delete. Locks the Player, recomputes PLAYER-LIFECYCLE01A inventory, writes a tombstone, then deletes only at reference_total zero.';
