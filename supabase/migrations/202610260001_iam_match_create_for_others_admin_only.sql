-- IAM-MATCH-PERMISSION-P1: replacement creation is ADMIN-only; entry stays CLOSED.
BEGIN;
DO $precondition$ BEGIN
 IF md5(pg_get_functiondef('public.create_replacement_match(uuid)'::regprocedure)) <> '9ffc40a500cb51dad92401c24315460c' THEN RAISE EXCEPTION 'IAM_P1_SOURCE_DRIFT'; END IF;
END $precondition$;
CREATE OR REPLACE FUNCTION public.create_replacement_match(p_voided_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_user_id uuid;
 v_role text;
 v_is_active boolean;
 v_can_approve_matches boolean;

 v_source public.matches%ROWTYPE;
 v_new_match_id uuid;
 v_player_count integer := 0;
BEGIN
 -- ACC07B business access gate
 IF NOT public.current_user_business_access_active() THEN
 RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
 END IF;
 PERFORM pg_advisory_xact_lock(726184501);

 IF p_voided_match_id IS NULL THEN
 RAISE EXCEPTION 'voided_match_id không được NULL';
 END IF;

 v_user_id := auth.uid();

 IF v_user_id IS NULL THEN
 RAISE EXCEPTION
 'Bạn chưa đăng nhập hoặc phiên đăng nhập không hợp lệ';
 END IF;

 SELECT
 role,
 is_active,
 can_approve_matches
 INTO
 v_role,
 v_is_active,
 v_can_approve_matches
 FROM public.profiles
 WHERE id = v_user_id;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Không tìm thấy hồ sơ người dùng';
 END IF;

 IF coalesce(v_is_active, false) = false THEN
 RAISE EXCEPTION 'Tài khoản đã bị vô hiệu hóa';
 END IF;

 IF upper(coalesce(v_role, '')) <> 'ADMIN'
 AND coalesce(v_can_approve_matches, false) = false THEN
 RAISE EXCEPTION 'MATCH_APPROVAL_PERMISSION_REQUIRED';
 END IF;

 -- CLOSED covers delegated MEMBER creation of a replacement Match.
 IF upper(coalesce(v_role, '')) = 'MEMBER' THEN
 RAISE EXCEPTION 'ATHLETE_ENTRY_CLOSED' USING ERRCODE = '42501';
 END IF;

 -- IAM-MATCH-PERMISSION-P1: approval never grants create-for-others authority.
 IF upper(coalesce(v_role, '')) <> 'ADMIN' THEN
 RAISE EXCEPTION 'CREATE_FOR_OTHERS_ADMIN_REQUIRED' USING ERRCODE = '42501';
 END IF;

 SELECT *
 INTO v_source
 FROM public.matches
 WHERE id = p_voided_match_id
 FOR UPDATE;

 IF NOT FOUND THEN
 RAISE EXCEPTION
 'Không tìm thấy trận đấu nguồn: %',
 p_voided_match_id;
 END IF;

 IF v_source.status <> 'VOIDED' THEN
 RAISE EXCEPTION
 'Chỉ trận VOIDED mới được tạo replacement. Trạng thái hiện tại: %',
 v_source.status;
 END IF;

 IF v_source.match_type = 'SELF_REPORTED' THEN
 RAISE EXCEPTION 'SELF_REPORTED_HISTORICAL_ONLY';
 END IF;

 IF EXISTS (
 SELECT 1
 FROM public.matches m
 WHERE m.replaces_match_id = p_voided_match_id
 ) THEN
 RAISE EXCEPTION
 'Trận VOIDED này đã có replacement';
 END IF;

 SELECT count(*)
 INTO v_player_count
 FROM public.match_players mp
 WHERE mp.match_id = p_voided_match_id;

 IF v_player_count <> 4 THEN
 RAISE EXCEPTION 'Trận nguồn không có đúng 4 VĐV';
 END IF;

 IF (
 SELECT count(*)
 FROM public.match_players mp
 WHERE mp.match_id = p_voided_match_id
 AND mp.team = 'A'
 ) <> 2 THEN
 RAISE EXCEPTION 'Trận nguồn không có đúng 2 VĐV đội A';
 END IF;

 IF (
 SELECT count(*)
 FROM public.match_players mp
 WHERE mp.match_id = p_voided_match_id
 AND mp.team = 'B'
 ) <> 2 THEN
 RAISE EXCEPTION 'Trận nguồn không có đúng 2 VĐV đội B';
 END IF;

 INSERT INTO public.matches (
 played_at,
 match_number,
 match_type,
 score_mode,
 team_a_score,
 team_b_score,
 status,
 invalid_reason,
 notes,
 tournament_id,
 league_id,
 created_by,
 created_at,
 updated_at,
 replaces_match_id
 )
 VALUES (
 v_source.played_at,
 v_source.match_number,
 v_source.match_type,
 v_source.score_mode,
 v_source.team_a_score,
 v_source.team_b_score,
 'PENDING',
 NULL,
 CASE
 WHEN v_source.notes IS NULL
 OR btrim(v_source.notes) = ''
 THEN
 'Replacement của trận '
 || p_voided_match_id::text
 ELSE
 v_source.notes
 || E'\nReplacement của trận '
 || p_voided_match_id::text
 END,
 v_source.tournament_id,
 v_source.league_id,
 v_user_id,
 now(),
 now(),
 p_voided_match_id
 )
 RETURNING id INTO v_new_match_id;

 INSERT INTO public.match_players (
 match_id,
 player_id,
 team,
 partner_player_id,
 created_at
 )
 SELECT
 v_new_match_id,
 mp.player_id,
 mp.team,
 mp.partner_player_id,
 now()
 FROM public.match_players mp
 WHERE mp.match_id = p_voided_match_id
 ORDER BY mp.team, mp.player_id;

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
 v_user_id,
 'CREATE_REPLACEMENT_MATCH',
 'matches',
 v_new_match_id,
 jsonb_build_object(
 'source_match_id', p_voided_match_id,
 'source_status', v_source.status
 ),
 jsonb_build_object(
 'replacement_match_id', v_new_match_id,
 'replaces_match_id', p_voided_match_id,
 'match_type', v_source.match_type,
 'tournament_id', v_source.tournament_id,
 'league_id', v_source.league_id,
 'status', 'PENDING',
 'player_count', v_player_count,
 'engine', 'MATCH_REPLACEMENT_P1'
 ),
 'Tạo trận PENDING thay thế cho trận VOIDED',
 now()
 );

 RETURN jsonb_build_object(
 'success', true,
 'source_match_id', p_voided_match_id,
 'replacement_match_id', v_new_match_id,
 'status', 'PENDING',
 'players_cloned', v_player_count,
 'tournament_id', v_source.tournament_id,
 'league_id', v_source.league_id
 );
END;
$function$;
COMMIT;
