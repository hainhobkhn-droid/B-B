BEGIN;

-- IAM05E — Safe MEMBER hard-delete.
--
-- Lifecycle-only account audit does not by itself block hard-delete.
-- Business/history references and all non-whitelisted audit remain blockers.
-- Preview is active-ADMIN-only.
-- Mutation RPC is service_role-only and re-checks all blockers server-side.

CREATE OR REPLACE FUNCTION public.get_member_hard_delete_snapshot(
    p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_profile public.profiles%rowtype;
    v_player public.players%rowtype;

    v_match_players bigint := 0;
    v_rating_events bigint := 0;
    v_rating_adjustments bigint := 0;
    v_rating_adjustment_events bigint := 0;
    v_fund_contributions bigint := 0;
    v_fund_payments bigint := 0;
    v_fund_transactions bigint := 0;
    v_tournament_registrations bigint := 0;
    v_tournament_payments bigint := 0;
    v_awards bigint := 0;

    v_audit_logs_blocking bigint := 0;
    v_audit_logs_ignored_lifecycle bigint := 0;

    v_fund_obligation_campaigns bigint := 0;
    v_fund_payments_confirmed bigint := 0;
    v_fund_transactions_created bigint := 0;
    v_leagues_created bigint := 0;
    v_matches_created bigint := 0;
    v_matches_opponent_confirmed bigint := 0;
    v_matches_opponent_rejected bigint := 0;
    v_rating_adjustments_created bigint := 0;
    v_tournament_expense_reversals_created bigint := 0;
    v_tournament_expenses_created bigint := 0;
    v_tournament_payment_refunds_created bigint := 0;
    v_tournament_payments_confirmed bigint := 0;
    v_tournaments_created bigint := 0;

    v_player_reference_total bigint := 0;
    v_profile_reference_total bigint := 0;
    v_reference_total bigint := 0;
BEGIN
    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_ID_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    SELECT p.*
    INTO v_profile
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND upper(coalesce(p.role, '')) = 'MEMBER';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_MEMBER_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF v_profile.player_id IS NOT NULL THEN
        SELECT p.*
        INTO v_player
        FROM public.players p
        WHERE p.id = v_profile.player_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'LINKED_PLAYER_NOT_FOUND'
                USING ERRCODE = '23503';
        END IF;

        SELECT count(*) INTO v_match_players
        FROM public.match_players x
        WHERE x.player_id = v_player.id
           OR x.partner_player_id = v_player.id;

        SELECT count(*) INTO v_rating_events
        FROM public.rating_events x
        WHERE x.player_id = v_player.id;

        SELECT count(*) INTO v_rating_adjustments
        FROM public.rating_adjustments x
        WHERE x.player_id = v_player.id;

        SELECT count(*) INTO v_rating_adjustment_events
        FROM public.rating_adjustment_events x
        WHERE x.player_id = v_player.id;

        SELECT count(*) INTO v_fund_contributions
        FROM public.fund_contributions x
        WHERE x.player_id = v_player.id;

        SELECT count(*) INTO v_fund_payments
        FROM public.fund_payments x
        WHERE x.player_id = v_player.id;

        SELECT count(*) INTO v_fund_transactions
        FROM public.fund_transactions x
        WHERE x.player_id = v_player.id;

        SELECT count(*) INTO v_tournament_registrations
        FROM public.tournament_registrations x
        WHERE x.player_id = v_player.id
           OR x.partner_player_id = v_player.id;

        SELECT count(*) INTO v_tournament_payments
        FROM public.tournament_payments x
        WHERE x.player_id = v_player.id;

        SELECT count(*) INTO v_awards
        FROM public.awards x
        WHERE x.player_id = v_player.id;
    END IF;

    SELECT count(*)
    INTO v_audit_logs_ignored_lifecycle
    FROM public.audit_logs x
    WHERE x.table_name = 'profiles'
      AND x.record_id = v_profile.id
      AND x.action IN (
          'AUTO_PROVISION_MEMBER',
          'APPROVE_MEMBER_SIGNUP',
          'REJECT_MEMBER_SIGNUP',
          'DEACTIVATE_MEMBER_ACCOUNT',
          'REACTIVATE_MEMBER_ACCOUNT',
          'UPDATE_MEMBER_PERMISSIONS'
      );

    SELECT count(*)
    INTO v_audit_logs_blocking
    FROM public.audit_logs x
    WHERE (
            x.user_id = v_profile.id
            OR (
                x.table_name = 'profiles'
                AND x.record_id = v_profile.id
            )
          )
      AND NOT (
            x.table_name = 'profiles'
            AND x.record_id = v_profile.id
            AND x.action IN (
                'AUTO_PROVISION_MEMBER',
                'APPROVE_MEMBER_SIGNUP',
                'REJECT_MEMBER_SIGNUP',
                'DEACTIVATE_MEMBER_ACCOUNT',
                'REACTIVATE_MEMBER_ACCOUNT',
                'UPDATE_MEMBER_PERMISSIONS'
            )
          );

    SELECT count(*) INTO v_fund_obligation_campaigns
    FROM public.fund_obligation_campaigns x
    WHERE x.created_by = v_profile.id;

    SELECT count(*) INTO v_fund_payments_confirmed
    FROM public.fund_payments x
    WHERE x.confirmed_by = v_profile.id;

    SELECT count(*) INTO v_fund_transactions_created
    FROM public.fund_transactions x
    WHERE x.created_by = v_profile.id;

    SELECT count(*) INTO v_leagues_created
    FROM public.leagues x
    WHERE x.created_by = v_profile.id;

    SELECT count(*) INTO v_matches_created
    FROM public.matches x
    WHERE x.created_by = v_profile.id;

    SELECT count(*) INTO v_matches_opponent_confirmed
    FROM public.matches x
    WHERE x.opponent_confirmed_by = v_profile.id;

    SELECT count(*) INTO v_matches_opponent_rejected
    FROM public.matches x
    WHERE x.opponent_rejected_by = v_profile.id;

    SELECT count(*) INTO v_rating_adjustments_created
    FROM public.rating_adjustments x
    WHERE x.created_by = v_profile.id;

    SELECT count(*) INTO v_tournament_expense_reversals_created
    FROM public.tournament_expense_reversals x
    WHERE x.created_by = v_profile.id;

    SELECT count(*) INTO v_tournament_expenses_created
    FROM public.tournament_expenses x
    WHERE x.created_by = v_profile.id;

    SELECT count(*) INTO v_tournament_payment_refunds_created
    FROM public.tournament_payment_refunds x
    WHERE x.created_by = v_profile.id;

    SELECT count(*) INTO v_tournament_payments_confirmed
    FROM public.tournament_payments x
    WHERE x.confirmed_by = v_profile.id;

    SELECT count(*) INTO v_tournaments_created
    FROM public.tournaments x
    WHERE x.created_by = v_profile.id;

    v_player_reference_total :=
          v_match_players
        + v_rating_events
        + v_rating_adjustments
        + v_rating_adjustment_events
        + v_fund_contributions
        + v_fund_payments
        + v_fund_transactions
        + v_tournament_registrations
        + v_tournament_payments
        + v_awards;

    v_profile_reference_total :=
          v_audit_logs_blocking
        + v_fund_obligation_campaigns
        + v_fund_payments_confirmed
        + v_fund_transactions_created
        + v_leagues_created
        + v_matches_created
        + v_matches_opponent_confirmed
        + v_matches_opponent_rejected
        + v_rating_adjustments_created
        + v_tournament_expense_reversals_created
        + v_tournament_expenses_created
        + v_tournament_payment_refunds_created
        + v_tournament_payments_confirmed
        + v_tournaments_created;

    v_reference_total :=
        v_player_reference_total + v_profile_reference_total;

    RETURN jsonb_build_object(
        'profile',
        jsonb_build_object(
            'id', v_profile.id,
            'full_name', v_profile.full_name,
            'login_name', v_profile.login_name,
            'is_active', v_profile.is_active,
            'membership_status', v_profile.membership_status,
            'player_id', v_profile.player_id
        ),

        'player',
        CASE
            WHEN v_profile.player_id IS NULL THEN NULL
            ELSE jsonb_build_object(
                'id', v_player.id,
                'full_name', v_player.full_name,
                'player_type', v_player.player_type,
                'status', v_player.status,
                'initial_rating', v_player.initial_rating,
                'current_rating', v_player.current_rating
            )
        END,

        'player_references',
        jsonb_build_object(
            'match_players', v_match_players,
            'rating_events', v_rating_events,
            'rating_adjustments', v_rating_adjustments,
            'rating_adjustment_events', v_rating_adjustment_events,
            'fund_contributions', v_fund_contributions,
            'fund_payments', v_fund_payments,
            'fund_transactions', v_fund_transactions,
            'tournament_registrations', v_tournament_registrations,
            'tournament_payments', v_tournament_payments,
            'awards', v_awards,
            'total', v_player_reference_total
        ),

        'profile_references',
        jsonb_build_object(
            'audit_logs', v_audit_logs_blocking,
            'fund_obligation_campaigns_created', v_fund_obligation_campaigns,
            'fund_payments_confirmed', v_fund_payments_confirmed,
            'fund_transactions_created', v_fund_transactions_created,
            'leagues_created', v_leagues_created,
            'matches_created', v_matches_created,
            'matches_opponent_confirmed', v_matches_opponent_confirmed,
            'matches_opponent_rejected', v_matches_opponent_rejected,
            'rating_adjustments_created', v_rating_adjustments_created,
            'tournament_expense_reversals_created', v_tournament_expense_reversals_created,
            'tournament_expenses_created', v_tournament_expenses_created,
            'tournament_payment_refunds_created', v_tournament_payment_refunds_created,
            'tournament_payments_confirmed', v_tournament_payments_confirmed,
            'tournaments_created', v_tournaments_created,
            'total', v_profile_reference_total
        ),

        'ignored_lifecycle_audit_logs',
        v_audit_logs_ignored_lifecycle,

        'reference_total',
        v_reference_total,

        'has_business_or_audit_history',
        (v_reference_total > 0),

        'hard_delete_allowed',
        (v_reference_total = 0),

        'recommended_action',
        CASE
            WHEN v_reference_total = 0
                THEN 'HARD_DELETE_CANDIDATE'
            ELSE 'DEACTIVATE_ONLY'
        END
    );
END;
$function$;


REVOKE ALL
ON FUNCTION public.get_member_hard_delete_snapshot(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_member_hard_delete_snapshot(uuid)
FROM anon;

REVOKE ALL
ON FUNCTION public.get_member_hard_delete_snapshot(uuid)
FROM authenticated;


CREATE OR REPLACE FUNCTION public.get_admin_member_deletion_preview(
    p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_actor uuid := auth.uid();
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_actor
          AND p.is_active IS TRUE
          AND upper(coalesce(p.role, '')) = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    RETURN public.get_member_hard_delete_snapshot(p_profile_id);
END;
$function$;


REVOKE ALL
ON FUNCTION public.get_admin_member_deletion_preview(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_admin_member_deletion_preview(uuid)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_admin_member_deletion_preview(uuid)
TO authenticated;


COMMENT ON FUNCTION public.get_member_hard_delete_snapshot(uuid) IS
    'IAM05E internal helper: calculates MEMBER hard-delete blockers; ignores only account-lifecycle Profile audit rows and performs no mutation.';

COMMENT ON FUNCTION public.get_admin_member_deletion_preview(uuid) IS
    'IAM05E: active ADMIN-only read-only MEMBER deletion safety preview; account-lifecycle audit does not by itself block hard-delete.';


CREATE OR REPLACE FUNCTION public.admin_hard_delete_member_public(
    p_profile_id uuid,
    p_actor_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_reason text;
    v_profile public.profiles%rowtype;
    v_player_id uuid;
    v_snapshot jsonb;
    v_reference_total bigint;
    v_deleted_audit_logs bigint := 0;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'ACTOR_ID_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.profiles p
    WHERE p.id = p_actor_id
      AND p.is_active IS TRUE
      AND upper(coalesce(p.role, '')) = 'ADMIN'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_ID_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_profile_id = p_actor_id THEN
        RAISE EXCEPTION 'SELF_HARD_DELETE_FORBIDDEN'
            USING ERRCODE = '22023';
    END IF;

    v_reason := nullif(btrim(p_reason), '');

    IF v_reason IS NULL
       OR char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION 'REASON_REQUIRED_MAX_1000'
            USING ERRCODE = '22023';
    END IF;

    SELECT p.*
    INTO v_profile
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND upper(coalesce(p.role, '')) = 'MEMBER'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_MEMBER_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    v_player_id := v_profile.player_id;

    IF v_player_id IS NOT NULL THEN
        PERFORM 1
        FROM public.players p
        WHERE p.id = v_player_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'LINKED_PLAYER_NOT_FOUND'
                USING ERRCODE = '23503';
        END IF;
    END IF;

    v_snapshot :=
        public.get_member_hard_delete_snapshot(p_profile_id);

    v_reference_total :=
        coalesce((v_snapshot ->> 'reference_total')::bigint, 0);

    IF v_reference_total <> 0 THEN
        RAISE EXCEPTION 'MEMBER_HAS_REFERENCES'
            USING ERRCODE = '23503',
                  DETAIL = v_snapshot::text;
    END IF;

    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    VALUES (
        p_actor_id,
        'HARD_DELETE_MEMBER_ACCOUNT',
        'profiles',
        p_profile_id,
        jsonb_build_object(
            'profile_id', v_profile.id,
            'full_name', v_profile.full_name,
            'login_name', v_profile.login_name,
            'player_id', v_profile.player_id,
            'is_active', v_profile.is_active,
            'membership_status', v_profile.membership_status
        ),
        jsonb_build_object(
            'hard_deleted', true
        ),
        v_reason
    );

    WITH deleted AS (
        DELETE FROM public.audit_logs x
        WHERE x.table_name = 'profiles'
          AND x.record_id = p_profile_id
          AND x.action IN (
              'AUTO_PROVISION_MEMBER',
              'APPROVE_MEMBER_SIGNUP',
              'REJECT_MEMBER_SIGNUP',
              'DEACTIVATE_MEMBER_ACCOUNT',
              'REACTIVATE_MEMBER_ACCOUNT',
              'UPDATE_MEMBER_PERMISSIONS'
          )
        RETURNING 1
    )
    SELECT count(*)
    INTO v_deleted_audit_logs
    FROM deleted;

    DELETE FROM public.profiles
    WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROFILE_DELETE_FAILED'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_player_id IS NOT NULL THEN
        DELETE FROM public.players
        WHERE id = v_player_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PLAYER_DELETE_FAILED'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'profile_id', p_profile_id,
        'player_id', v_player_id,
        'deleted_lifecycle_audit_logs', v_deleted_audit_logs
    );
END;
$function$;


REVOKE ALL
ON FUNCTION public.admin_hard_delete_member_public(uuid, uuid, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.admin_hard_delete_member_public(uuid, uuid, text)
FROM anon;

REVOKE ALL
ON FUNCTION public.admin_hard_delete_member_public(uuid, uuid, text)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_hard_delete_member_public(uuid, uuid, text)
TO service_role;


COMMENT ON FUNCTION public.admin_hard_delete_member_public(uuid, uuid, text) IS
    'IAM05E internal service-role cleanup: re-validates active ADMIN actor and all MEMBER blockers, preserves a tombstone audit, then atomically deletes lifecycle audit, Profile and linked Player.';

COMMIT;