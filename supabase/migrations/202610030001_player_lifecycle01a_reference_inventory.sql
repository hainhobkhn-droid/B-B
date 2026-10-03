-- PLAYER-LIFECYCLE01A: authoritative Player reference inventory and preview.
-- Production catalog verified before authoring on 2026-10-03.

DO $player_lifecycle01a_schema_contract$
DECLARE
    v_problem text;
BEGIN
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
        RAISE EXCEPTION 'PLAYER_REFERENCE_SCHEMA_MISMATCH: missing/non-uuid columns: %',
            v_problem;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conrelid = 'public.players'::regclass
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid, true) =
              'CHECK (status = ANY (ARRAY[''ACTIVE''::text, ''INACTIVE''::text]))'
    ) THEN
        RAISE EXCEPTION 'PLAYER_REFERENCE_SCHEMA_MISMATCH: players.status contract';
    END IF;

    WITH expected(table_name, column_name, delete_action) AS (
        VALUES
            ('profiles', 'player_id', 'n'::"char"),
            ('match_players', 'player_id', 'r'::"char"),
            ('rating_events', 'player_id', 'r'::"char"),
            ('rating_adjustments', 'player_id', 'r'::"char"),
            ('rating_adjustment_events', 'player_id', 'r'::"char"),
            ('fund_contributions', 'player_id', 'r'::"char"),
            ('fund_payments', 'player_id', 'r'::"char"),
            ('fund_transactions', 'player_id', 'a'::"char"),
            ('tournament_registrations', 'player_id', 'r'::"char"),
            ('tournament_registrations', 'partner_player_id', 'r'::"char"),
            ('tournament_payments', 'player_id', 'r'::"char"),
            ('awards', 'player_id', 'r'::"char")
    )
    SELECT string_agg(
        format('%I.%I expected delete action %s',
            e.table_name, e.column_name, e.delete_action),
        ', '
    )
    INTO v_problem
    FROM expected e
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND c.confrelid = 'public.players'::regclass
          AND c.conrelid = format('public.%I', e.table_name)::regclass
          AND array_length(c.conkey, 1) = 1
          AND a.attname = e.column_name
          AND c.confdeltype = e.delete_action
    );

    IF v_problem IS NOT NULL THEN
        RAISE EXCEPTION 'PLAYER_REFERENCE_SCHEMA_MISMATCH: FK contract: %',
            v_problem;
    END IF;

    -- partner_player_id is a production logical reference without an FK today.
    IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND c.confrelid = 'public.players'::regclass
          AND c.conrelid = 'public.match_players'::regclass
          AND array_length(c.conkey, 1) = 1
          AND a.attname = 'partner_player_id'
    ) THEN
        RAISE EXCEPTION
            'PLAYER_REFERENCE_SCHEMA_MISMATCH: match_players.partner_player_id FK contract changed';
    END IF;

    IF to_regprocedure('public.current_user_business_access_active()') IS NULL THEN
        RAISE EXCEPTION
            'PLAYER_REFERENCE_SCHEMA_MISMATCH: business-access helper missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public'
          AND g.table_name IN ('players', 'match_players')
          AND g.grantee = 'authenticated'
          AND g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    ) OR EXISTS (
        SELECT 1
        FROM (VALUES ('players'), ('match_players')) AS t(table_name)
        WHERE NOT EXISTS (
            SELECT 1
            FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name = t.table_name
              AND g.grantee = 'authenticated'
              AND g.privilege_type = 'SELECT'
        )
    ) THEN
        RAISE EXCEPTION
            'PLAYER_REFERENCE_SCHEMA_MISMATCH: direct table grant contract changed';
    END IF;
END;
$player_lifecycle01a_schema_contract$;

CREATE OR REPLACE FUNCTION public.player_reference_snapshot(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_profiles bigint;
    v_match_player bigint;
    v_match_partner bigint;
    v_match_rows bigint;
    v_rating_events bigint;
    v_rating_adjustments bigint;
    v_rating_adjustment_events bigint;
    v_fund_contributions bigint;
    v_fund_payments bigint;
    v_fund_transactions bigint;
    v_tournament_player bigint;
    v_tournament_partner bigint;
    v_tournament_rows bigint;
    v_tournament_payments bigint;
    v_awards bigint;
    v_audit_logs bigint;
    v_reference_total bigint;
BEGIN
    IF p_player_id IS NULL THEN
        RAISE EXCEPTION 'PLAYER_ID_REQUIRED' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.players WHERE id = p_player_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*) INTO v_profiles
    FROM public.profiles x WHERE x.player_id = p_player_id;

    SELECT
        count(*) FILTER (WHERE x.player_id = p_player_id),
        count(*) FILTER (WHERE x.partner_player_id = p_player_id),
        count(*) FILTER (
            WHERE x.player_id = p_player_id
               OR x.partner_player_id = p_player_id
        )
    INTO v_match_player, v_match_partner, v_match_rows
    FROM public.match_players x;

    SELECT count(*) INTO v_rating_events
    FROM public.rating_events x WHERE x.player_id = p_player_id;
    SELECT count(*) INTO v_rating_adjustments
    FROM public.rating_adjustments x WHERE x.player_id = p_player_id;
    SELECT count(*) INTO v_rating_adjustment_events
    FROM public.rating_adjustment_events x WHERE x.player_id = p_player_id;
    SELECT count(*) INTO v_fund_contributions
    FROM public.fund_contributions x WHERE x.player_id = p_player_id;
    SELECT count(*) INTO v_fund_payments
    FROM public.fund_payments x WHERE x.player_id = p_player_id;
    SELECT count(*) INTO v_fund_transactions
    FROM public.fund_transactions x WHERE x.player_id = p_player_id;

    SELECT
        count(*) FILTER (WHERE x.player_id = p_player_id),
        count(*) FILTER (WHERE x.partner_player_id = p_player_id),
        count(*) FILTER (
            WHERE x.player_id = p_player_id
               OR x.partner_player_id = p_player_id
        )
    INTO v_tournament_player, v_tournament_partner, v_tournament_rows
    FROM public.tournament_registrations x;

    SELECT count(*) INTO v_tournament_payments
    FROM public.tournament_payments x WHERE x.player_id = p_player_id;
    SELECT count(*) INTO v_awards
    FROM public.awards x WHERE x.player_id = p_player_id;

    -- Audit metadata is reported, but is not a blocking business reference.
    SELECT count(*) INTO v_audit_logs
    FROM public.audit_logs x
    WHERE x.table_name = 'players'
      AND x.record_id = p_player_id;

    v_reference_total :=
          v_profiles
        + v_match_rows
        + v_rating_events
        + v_rating_adjustments
        + v_rating_adjustment_events
        + v_fund_contributions
        + v_fund_payments
        + v_fund_transactions
        + v_tournament_rows
        + v_tournament_payments
        + v_awards;

    RETURN jsonb_build_object(
        'inventory_version', 'PLAYER-LIFECYCLE01A',
        'profile_link_count', v_profiles,
        'match_players_player_count', v_match_player,
        'match_players_partner_count', v_match_partner,
        'match_players_count', v_match_rows,
        'rating_events_count', v_rating_events,
        'rating_adjustments_count', v_rating_adjustments,
        'rating_adjustment_events_count', v_rating_adjustment_events,
        'fund_contributions_count', v_fund_contributions,
        'fund_payments_count', v_fund_payments,
        'fund_transactions_count', v_fund_transactions,
        'tournament_registrations_player_count', v_tournament_player,
        'tournament_registrations_partner_count', v_tournament_partner,
        'tournament_registrations_count', v_tournament_rows,
        'tournament_payments_count', v_tournament_payments,
        'awards_count', v_awards,
        'audit_log_count', v_audit_logs,
        'audit_logs_blocking', false,
        'reference_total', v_reference_total
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.player_reference_snapshot(uuid)
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.player_reference_snapshot(uuid) IS
'Internal authoritative Player reference inventory. Counts logical partner references and excludes audit metadata from blocking reference_total.';

CREATE OR REPLACE FUNCTION public.get_player_lifecycle_preview(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid;
    v_player public.players%rowtype;
    v_snapshot jsonb;
    v_reference_total bigint;
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

    SELECT * INTO v_player
    FROM public.players p
    WHERE p.id = p_player_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAYER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    v_snapshot := public.player_reference_snapshot(p_player_id);
    v_reference_total := (v_snapshot ->> 'reference_total')::bigint;

    RETURN jsonb_build_object(
        'player_id', v_player.id,
        'current_status', v_player.status,
        'hard_delete_allowed', v_reference_total = 0,
        'recommended_action', CASE
            WHEN v_reference_total = 0 THEN 'HARD_DELETE_PREVIEW_ELIGIBLE'
            ELSE 'INACTIVATE_ONLY'
        END
    ) || v_snapshot;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_player_lifecycle_preview(uuid)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.get_player_lifecycle_preview(uuid)
TO authenticated;

COMMENT ON FUNCTION public.get_player_lifecycle_preview(uuid) IS
'Authenticated read-only Player lifecycle preview for ADMIN or active can_manage_members users. No lifecycle mutation or delete is performed.';
