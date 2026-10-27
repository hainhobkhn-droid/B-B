-- Restore native MEMBER self-entry only; explicit delegation and four-eyes preserved.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_my_pending_match(p_played_at timestamp with time zone, p_match_type text, p_score_mode text, p_team_a_score integer, p_team_b_score integer, p_team_a_player_1 uuid, p_team_a_player_2 uuid, p_team_b_player_1 uuid, p_team_b_player_2 uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_actor uuid;
 v_profile_role text;
 v_profile_active boolean;
 v_my_player_id uuid;
 v_can_create_for_others boolean;

 v_match_id uuid;
 v_match_number integer;

 v_found_count integer;
 v_active_count integer;
 v_distinct_count integer;
BEGIN
 -- ACC07B business access gate
 IF NOT public.current_user_business_access_active() THEN
 RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
 END IF;
 PERFORM pg_advisory_xact_lock(726184501);

 v_actor := auth.uid();

 IF v_actor IS NULL THEN
 RAISE EXCEPTION 'AUTH_REQUIRED';
 END IF;

 SELECT
 p.role,
 p.is_active,
 p.player_id,
 p.can_create_matches_for_others
 INTO
 v_profile_role,
 v_profile_active,
 v_my_player_id,
 v_can_create_for_others
 FROM public.profiles p
 WHERE p.id = v_actor FOR SHARE;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'PROFILE_NOT_FOUND';
 END IF;

 IF coalesce(v_profile_active, false) = false THEN
 RAISE EXCEPTION 'ACCOUNT_INACTIVE';
 END IF;

 IF upper(coalesce(v_profile_role, '')) <> 'MEMBER' THEN
 RAISE EXCEPTION 'MEMBER_ROLE_REQUIRED';
 END IF;

 -- SELF-CREATE-R1: native MEMBER self-entry is enabled.
 -- The existing four-slot self-participation guard below still applies unless
 -- the independent can_create_matches_for_others capability is explicitly true.

 IF NOT coalesce(v_can_create_for_others,false) AND v_my_player_id IS NULL THEN
 RAISE EXCEPTION 'PLAYER_LINK_REQUIRED';
 END IF;

 IF NOT coalesce(v_can_create_for_others,false) AND NOT EXISTS (
 SELECT 1
 FROM public.players p
 WHERE p.id = v_my_player_id
 AND p.status = 'ACTIVE'
 AND p.player_type = 'CLUB'
 ) THEN
 RAISE EXCEPTION 'MEMBER_PLAYER_INVALID';
 END IF;

 IF p_played_at IS NULL THEN
 RAISE EXCEPTION 'PLAYED_AT_REQUIRED';
 END IF;

 IF p_match_type IS NULL
 OR btrim(p_match_type) = '' THEN
 RAISE EXCEPTION 'MATCH_TYPE_REQUIRED';
 END IF;

 -- P1: MEMBER không được tạo Competition / SELF_REPORTED.
 IF p_match_type NOT IN (
 'CLUB_RATED',
 'FRIENDLY_RATED',
 'TRAINING'
 ) THEN
 RAISE EXCEPTION
 'MEMBER_MATCH_TYPE_NOT_ALLOWED: %',
 p_match_type;
 END IF;

 IF p_score_mode NOT IN (
 'POINTS',
 'RESULT'
 ) THEN
 RAISE EXCEPTION
 'INVALID_SCORE_MODE: %',
 p_score_mode;
 END IF;

 IF p_team_a_score IS NULL
 OR p_team_b_score IS NULL THEN
 RAISE EXCEPTION 'SCORE_REQUIRED';
 END IF;

 IF p_team_a_score < 0
 OR p_team_b_score < 0 THEN
 RAISE EXCEPTION 'NEGATIVE_SCORE_NOT_ALLOWED';
 END IF;

 IF p_score_mode = 'POINTS'
 AND (p_team_a_score + p_team_b_score) <= 0 THEN
 RAISE EXCEPTION 'POINTS_SCORE_MUST_HAVE_RESULT';
 END IF;

 IF p_score_mode = 'RESULT'
 AND p_team_a_score = 0
 AND p_team_b_score = 0 THEN
 RAISE EXCEPTION 'RESULT_SCORE_MUST_HAVE_WINNER';
 END IF;

 IF p_score_mode = 'RESULT'
 AND (
 p_team_a_score NOT IN (0, 1)
 OR p_team_b_score NOT IN (0, 1)
 ) THEN
 RAISE EXCEPTION 'RESULT_SCORE_MUST_BE_0_OR_1';
 END IF;

 IF p_team_a_player_1 IS NULL
 OR p_team_a_player_2 IS NULL
 OR p_team_b_player_1 IS NULL
 OR p_team_b_player_2 IS NULL THEN
 RAISE EXCEPTION 'FOUR_PLAYERS_REQUIRED';
 END IF;

 SELECT count(DISTINCT x)
 INTO v_distinct_count
 FROM unnest(
 ARRAY[
 p_team_a_player_1,
 p_team_a_player_2,
 p_team_b_player_1,
 p_team_b_player_2
 ]::uuid[]
 ) AS t(x);

 IF v_distinct_count <> 4 THEN
 RAISE EXCEPTION 'PLAYERS_MUST_BE_DISTINCT';
 END IF;

 IF NOT coalesce(v_can_create_for_others,false) AND NOT (
 v_my_player_id = p_team_a_player_1
 OR v_my_player_id = p_team_a_player_2
 OR v_my_player_id = p_team_b_player_1
 OR v_my_player_id = p_team_b_player_2
 ) THEN
 RAISE EXCEPTION 'MEMBER_MUST_PARTICIPATE';
 END IF;

 SELECT count(*)
 INTO v_found_count
 FROM public.players p
 WHERE p.id = ANY(
 ARRAY[
 p_team_a_player_1,
 p_team_a_player_2,
 p_team_b_player_1,
 p_team_b_player_2
 ]::uuid[]
 );

 IF v_found_count <> 4 THEN
 RAISE EXCEPTION 'PLAYER_NOT_FOUND';
 END IF;

 SELECT count(*)
 INTO v_active_count
 FROM public.players p
 WHERE p.id = ANY(
 ARRAY[
 p_team_a_player_1,
 p_team_a_player_2,
 p_team_b_player_1,
 p_team_b_player_2
 ]::uuid[]
 )
 AND p.status = 'ACTIVE';

 IF v_active_count <> 4 THEN
 RAISE EXCEPTION 'ALL_PLAYERS_MUST_BE_ACTIVE';
 END IF;

 SELECT coalesce(max(m.match_number), 0) + 1
 INTO v_match_number
 FROM public.matches m
 WHERE m.match_number IS NOT NULL;

 INSERT INTO public.matches (
 played_at,
 match_number,
 match_type,
 score_mode,
 team_a_score,
 team_b_score,
 status,
 invalid_reason,
 tournament_id,
 league_id,
 notes,
 created_by,
 created_at,
 updated_at,
 replaces_match_id
 )
 VALUES (
 p_played_at,
 v_match_number,
 p_match_type,
 p_score_mode,
 p_team_a_score,
 p_team_b_score,
 'PENDING',
 NULL,
 NULL,
 NULL,
 nullif(btrim(p_notes), ''),
 v_actor,
 now(),
 now(),
 NULL
 )
 RETURNING id
 INTO v_match_id;

 INSERT INTO public.match_players (
 match_id,
 player_id,
 team,
 partner_player_id,
 created_at
 )
 VALUES
 (
 v_match_id,
 p_team_a_player_1,
 'A',
 p_team_a_player_2,
 now()
 ),
 (
 v_match_id,
 p_team_a_player_2,
 'A',
 p_team_a_player_1,
 now()
 ),
 (
 v_match_id,
 p_team_b_player_1,
 'B',
 p_team_b_player_2,
 now()
 ),
 (
 v_match_id,
 p_team_b_player_2,
 'B',
 p_team_b_player_1,
 now()
 );

 INSERT INTO public.audit_logs (
 user_id,
 action,
 table_name,
 record_id,
 old_data,
 new_data,
 reason,
 created_at
 )
 VALUES (
 v_actor,
 'CREATE_MY_PENDING_MATCH',
 'matches',
 v_match_id,
 NULL,
 jsonb_build_object(
 'match_number', v_match_number,
 'played_at', p_played_at,
 'match_type', p_match_type,
 'score_mode', p_score_mode,
 'team_a_score', p_team_a_score,
 'team_b_score', p_team_b_score,
 'team_a', jsonb_build_array(
 p_team_a_player_1,
 p_team_a_player_2
 ),
 'team_b', jsonb_build_array(
 p_team_b_player_1,
 p_team_b_player_2
 ),
 'member_player_id', v_my_player_id,
 'status', 'PENDING',
 'engine', 'MEMBER_PENDING_MATCH_V1_P1'
 ),
 'Thành viên tạo trận và gửi chờ duyệt',
 now()
 );

 RETURN jsonb_build_object(
 'success', true,
 'match_id', v_match_id,
 'match_number', v_match_number,
 'status', 'PENDING',
 'created_by', v_actor,
 'member_player_id', v_my_player_id,
 'players_set', 4
 );
END;
$function$
;
COMMIT;
