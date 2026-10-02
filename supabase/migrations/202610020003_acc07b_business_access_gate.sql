BEGIN;

-- ACC07B: one authoritative gate for all authenticated business access.
-- Own-profile bootstrap and service-role password recovery do not use this helper.
CREATE OR REPLACE FUNCTION public.current_user_business_access_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active IS TRUE
          AND p.membership_status = 'APPROVED'
          AND p.must_change_password IS NOT TRUE
    );
$function$;

REVOKE ALL ON FUNCTION public.current_user_business_access_active()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_business_access_active()
TO authenticated;

COMMENT ON FUNCTION public.current_user_business_access_active() IS
    'ACC07B authoritative authenticated business gate: active APPROVED profile with completed forced-password flow.';

-- Preserve each policy's restrictive mode, command and role list; replace only
-- its USING/WITH CHECK expression. profiles own-row bootstrap is intentionally
-- not part of this inventory.
DO $policy$
DECLARE
    v_table text;
    v_policy_count integer;
    v_permissive boolean;
    v_command "char";
    v_roles oid[];
    v_using text;
    v_with_check text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'leagues',
        'tournaments',
        'fund_obligation_campaigns',
        'tournament_registrations',
        'tournament_payments',
        'rating_settings',
        'fund_rules',
        'rating_match_weights',
        'players',
        'matches',
        'rating_events',
        'fund_payments',
        'fund_transactions',
        'match_players',
        'fund_contributions'
    ] LOOP
        SELECT count(*)
        INTO v_policy_count
        FROM pg_policy pol
        JOIN pg_class cls ON cls.oid = pol.polrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = v_table
          AND pol.polname = 'iam05d_membership_gate';

        IF v_policy_count <> 1 THEN
            RAISE EXCEPTION 'ACC07B_POLICY_CONTRACT_DRIFT: %', v_table;
        END IF;

        SELECT
            pol.polpermissive,
            pol.polcmd,
            pol.polroles,
            pg_get_expr(pol.polqual, pol.polrelid, false),
            pg_get_expr(pol.polwithcheck, pol.polrelid, false)
        INTO v_permissive, v_command, v_roles, v_using, v_with_check
        FROM pg_policy pol
        JOIN pg_class cls ON cls.oid = pol.polrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = v_table
          AND pol.polname = 'iam05d_membership_gate';

        IF v_permissive IS DISTINCT FROM false
           OR v_command IS DISTINCT FROM '*'
           OR v_roles IS DISTINCT FROM ARRAY['authenticated'::regrole::oid]
           OR regexp_replace(
                  replace(coalesce(v_using, ''), 'public.', ''),
                  '\s+', '', 'g'
              ) <> '(SELECTcurrent_user_membership_active()AScurrent_user_membership_active)'
           OR regexp_replace(
                  replace(coalesce(v_with_check, ''), 'public.', ''),
                  '\s+', '', 'g'
              ) <> '(SELECTcurrent_user_membership_active()AScurrent_user_membership_active)'
        THEN
            RAISE EXCEPTION 'ACC07B_POLICY_CONTRACT_DRIFT: %', v_table;
        END IF;

        EXECUTE format(
            'ALTER POLICY iam05d_membership_gate ON public.%I '
            'USING ((SELECT public.current_user_business_access_active())) '
            'WITH CHECK ((SELECT public.current_user_business_access_active()))',
            v_table
        );
    END LOOP;
END;
$policy$;

-- SQL-language authenticated business RPCs from the production inventory.
-- Bodies/signatures are source-synced from pg_get_functiondef; the only new
-- behavior is the leading ACC07B business gate.
CREATE OR REPLACE FUNCTION public.admin_approve_member_signup(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;
    RETURN public._review_member_signup(p_profile_id, 'APPROVED', NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reject_member_signup(
    p_profile_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;
    RETURN public._review_member_signup(p_profile_id, 'REJECTED', p_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_player_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT p.player_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND public.current_user_business_access_active()
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_player_directory()
RETURNS TABLE(
    id uuid,
    full_name text,
    player_type text,
    current_rating numeric,
    status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT p.id, p.full_name, p.player_type, p.current_rating, p.status
    FROM public.players p
    WHERE public.current_user_business_access_active()
    ORDER BY p.full_name, p.id;
$function$;

-- The remaining production RPCs are PL/pgSQL. Preserve their exact live
-- definitions and inject one leading guard. The explicit signature inventory
-- prevents accidentally widening this transformation to bootstrap, signup,
-- trigger or service-role/internal functions.
DO $gate$
DECLARE
    v_signature text;
    v_oid regprocedure;
    v_definition text;
    v_gated_definition text;
    v_language text;
    v_security_definer boolean;
    v_config text[];
    v_business_signatures constant text[] := ARRAY[
        -- ACC07B_INVENTORY_BEGIN
        'admin_create_fund_rule_version(text,numeric,numeric,numeric,date)',
        'admin_create_rating_settings_version(text,numeric,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,numeric)',
        'admin_set_member_account_active(uuid,boolean,text)',
        'admin_set_member_nickname(uuid,text)',
        'admin_update_member_permissions(uuid,jsonb,text)',
        'admin_update_rating_match_weight(text,numeric,text)',
        'approve_match(uuid,text)',
        'approve_match_active(uuid)',
        'cancel_fund_obligation_campaign(uuid,text)',
        'change_tournament_registration_status(uuid,text,text)',
        'change_tournament_status(uuid,text,text)',
        'claim_my_nickname(text)',
        'confirm_match_by_opponent(uuid)',
        'correct_rating_adjustment_active(uuid,text)',
        'create_fund_obligation_campaign(text,text,numeric,date,date,text)',
        'create_my_pending_match(timestamp with time zone,text,text,integer,integer,uuid,uuid,uuid,uuid,text)',
        'create_my_tournament_registration(uuid,text,uuid)',
        'create_pending_match(timestamp with time zone,integer,text,text,integer,integer,uuid,uuid,text)',
        'create_player(text,text,text,text,numeric,date,date,text)',
        'create_replacement_match(uuid)',
        'create_tournament(text,text,date,date,text,text,text,numeric,text)',
        'create_tournament_expense(uuid,numeric,text,text,date)',
        'create_tournament_payment(uuid,numeric,timestamp with time zone,text)',
        'create_tournament_registration(uuid,uuid,text,uuid,numeric)',
        'generate_match_fund(uuid)',
        'get_admin_member_deletion_preview(uuid)',
        'get_admin_member_lifecycle(integer,integer)',
        'get_admin_member_permissions(integer,integer)',
        'get_admin_member_promotion_candidates()',
        'get_admin_member_promotion_preview(uuid,uuid)',
        'get_admin_pending_member_signups(integer,integer)',
        'get_club_fund_summary()',
        'get_fund_collection_balances()',
        'get_fund_management_contributions()',
        'get_fund_management_payments()',
        'get_fund_management_transactions()',
        'get_match_management_matches()',
        'get_match_management_players()',
        'get_member_fund_overview()',
        'get_member_fund_transactions()',
        'get_member_management_players()',
        'get_member_match_players()',
        'get_member_matches()',
        'get_member_rating_events()',
        'get_my_fund_contributions()',
        'get_my_fund_obligations()',
        'get_my_fund_payment_history()',
        'get_my_fund_payments()',
        'get_my_pending_match_confirmations()',
        'get_tournament_finance_summary(uuid)',
        'get_tournament_management_payments()',
        'get_tournament_management_registrations()',
        'promote_guest_player_to_member(uuid,uuid)',
        'rebuild_ratings_active()',
        'record_fund_expense(numeric,text,timestamp with time zone)',
        'record_fund_payment(uuid,numeric,timestamp with time zone,text)',
        'record_member_fund_payment(uuid,numeric,timestamp with time zone,text)',
        'record_rating_adjustment_active(uuid,uuid,numeric,text,timestamp with time zone)',
        'refund_fund_payment(uuid,numeric,text,timestamp with time zone)',
        'refund_tournament_payment(uuid,numeric,text,timestamp with time zone)',
        'reject_match_by_opponent(uuid,text)',
        'reject_pending_match(uuid,text)',
        'resubmit_my_rejected_match(uuid)',
        'reverse_tournament_expense(uuid,text,timestamp with time zone)',
        'set_pending_match_players(uuid,uuid,uuid,uuid,uuid)',
        'set_profile_player_link(uuid,uuid)',
        'settle_tournament(uuid,text)',
        'update_my_member_profile(text,text,date)',
        'update_my_rejected_pending_match(uuid,timestamp with time zone,text,text,integer,integer,uuid,uuid,uuid,uuid,text)',
        'update_pending_match(uuid,timestamp with time zone,integer,text,text,integer,integer,uuid,uuid,text)',
        'update_player(uuid,text,text,text,text,text,date,date,text)',
        'update_tournament(uuid,text,text,date,date,text,text,text,numeric,text)',
        'void_match_active(uuid,text)'
        -- ACC07B_INVENTORY_END
    ];
BEGIN
    FOREACH v_signature IN ARRAY v_business_signatures LOOP
        v_oid := to_regprocedure('public.' || v_signature);

        IF v_oid IS NULL THEN
            RAISE EXCEPTION 'ACC07B_EXPECTED_RPC_MISSING: %', v_signature;
        END IF;

        SELECT
            pg_get_functiondef(proc.oid),
            lang.lanname,
            proc.prosecdef,
            proc.proconfig
        INTO
            v_definition,
            v_language,
            v_security_definer,
            v_config
        FROM pg_proc proc
        JOIN pg_language lang ON lang.oid = proc.prolang
        WHERE proc.oid = v_oid;

        IF v_language <> 'plpgsql'
           OR v_security_definer IS NOT TRUE
           OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
           OR NOT coalesce(v_config, ARRAY[]::text[])
                  @> ARRAY['search_path=public, pg_temp']::text[] THEN
            RAISE EXCEPTION 'ACC07B_RPC_CONTRACT_MISMATCH: %', v_signature;
        END IF;

        -- Idempotent for controlled re-application to the same catalog.
        IF position('-- ACC07B business access gate' IN v_definition) > 0 THEN
            CONTINUE;
        END IF;

        v_gated_definition := regexp_replace(
            v_definition,
            E'(\r?\n[ \t]*begin[ \t]*\r?\n)',
            E'\\1    -- ACC07B business access gate\n'
            '    IF NOT public.current_user_business_access_active() THEN\n'
            '        RAISE EXCEPTION ''BUSINESS_ACCESS_REQUIRED'' USING ERRCODE = ''42501'';\n'
            '    END IF;\n',
            'i'
        );

        IF v_gated_definition = v_definition
           OR position('-- ACC07B business access gate' IN v_gated_definition) = 0 THEN
            RAISE EXCEPTION 'ACC07B_RPC_GATE_INJECTION_FAILED: %', v_signature;
        END IF;

        EXECUTE v_gated_definition;
    END LOOP;
END;
$gate$;

-- Fail closed if the target catalog contains an authenticated SECURITY DEFINER
-- RPC outside the reviewed production inventory. This prevents a newly added
-- business RPC from silently escaping the forced-password gate.
DO $coverage$
DECLARE
    v_ungated text[];
BEGIN
    SELECT array_agg(proc.oid::regprocedure::text ORDER BY proc.oid::regprocedure::text)
    INTO v_ungated
    FROM pg_proc proc
    JOIN pg_namespace ns ON ns.oid = proc.pronamespace
    WHERE ns.nspname = 'public'
      AND proc.prosecdef
      AND has_function_privilege('authenticated', proc.oid, 'EXECUTE')
      AND proc.oid::regprocedure::text NOT IN (
          'current_user_is_admin()',
          'current_user_membership_active()',
          'get_signup_rating_config()',
          'current_user_business_access_active()'
      )
      AND position(
          '-- ACC07B business access gate'
          IN pg_get_functiondef(proc.oid)
      ) = 0
      AND NOT (
          proc.oid::regprocedure::text IN (
              'admin_approve_member_signup(uuid)',
              'admin_reject_member_signup(uuid,text)',
              'current_user_player_id()',
              'get_player_directory()'
          )
          AND position(
              'current_user_business_access_active'
              IN pg_get_functiondef(proc.oid)
          ) > 0
      );

    IF coalesce(cardinality(v_ungated), 0) > 0 THEN
        RAISE EXCEPTION 'ACC07B_UNREVIEWED_AUTHENTICATED_SECURITY_DEFINER_RPCS: %',
            v_ungated;
    END IF;
END;
$coverage$;

COMMENT ON FUNCTION public.get_member_rating_events() IS
    'ACC07B forced-password business gate applied. Existing rating-event data-scope behavior is unchanged and tracked as a separate blocker.';

COMMIT;
