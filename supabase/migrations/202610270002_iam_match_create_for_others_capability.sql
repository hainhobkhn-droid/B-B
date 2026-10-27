-- IAM MATCH CREATE-FOR-OTHERS P2: explicit delegation, default false; normal entry stays CLOSED.
BEGIN;
DO $precondition$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attname='can_create_matches_for_others' AND NOT attisdropped) THEN RAISE EXCEPTION 'IAM_CREATE_P2_CAPABILITY_ALREADY_EXISTS'; END IF;
 IF md5(pg_get_functiondef('public.create_my_pending_match(timestamp with time zone,text,text,integer,integer,uuid,uuid,uuid,uuid,text)'::regprocedure))<>'11e6e0c3f542f6d9afea820b25798c31' THEN RAISE EXCEPTION 'IAM_CREATE_P2_SOURCE_DRIFT: create_my_pending_match'; END IF;
 IF md5(pg_get_functiondef('public.create_replacement_match(uuid)'::regprocedure))<>'2c19ab6ed98d5db85e3f53dc9885306d' THEN RAISE EXCEPTION 'IAM_CREATE_P2_SOURCE_DRIFT: create_replacement_match'; END IF;
 IF md5(pg_get_functiondef('public.update_my_rejected_pending_match(uuid,timestamp with time zone,text,text,integer,integer,uuid,uuid,uuid,uuid,text)'::regprocedure))<>'0287d725e000161602ca29ec629370a7' THEN RAISE EXCEPTION 'IAM_CREATE_P2_SOURCE_DRIFT: update_my_rejected_pending_match'; END IF;
 IF md5(pg_get_functiondef('public.get_admin_member_permissions(integer,integer)'::regprocedure))<>'f9bc7141bfeeb2b96d4de40490a34735' THEN RAISE EXCEPTION 'IAM_CREATE_P2_SOURCE_DRIFT: get_admin_member_permissions'; END IF;
 IF md5(pg_get_functiondef('public.admin_update_member_permissions(uuid,jsonb,text)'::regprocedure))<>'af4f00a2a01c1abab59f52ccd7d0e8cd' THEN RAISE EXCEPTION 'IAM_CREATE_P2_SOURCE_DRIFT: admin_update_member_permissions'; END IF;
 IF md5(pg_get_functiondef('public.get_admin_member_lifecycle(integer,integer)'::regprocedure))<>'8fd56dae6f373715e199a802c546516f' THEN RAISE EXCEPTION 'IAM_CREATE_P2_SOURCE_DRIFT: get_admin_member_lifecycle'; END IF;
 IF md5(pg_get_functiondef('public.admin_set_member_account_active(uuid,boolean,text)'::regprocedure))<>'e23ee1bc0901d5e3570225527428015c' THEN RAISE EXCEPTION 'IAM_CREATE_P2_SOURCE_DRIFT: admin_set_member_account_active'; END IF;
 IF md5(pg_get_functiondef('public._review_member_signup(uuid,text,text)'::regprocedure))<>'8c56de511e2bae4c40e6710971f5553b' THEN RAISE EXCEPTION 'IAM_CREATE_P2_SOURCE_DRIFT: _review_member_signup'; END IF;
END $precondition$;
ALTER TABLE public.profiles ADD COLUMN can_create_matches_for_others boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.can_create_matches_for_others IS 'Explicit ADMIN-granted MEMBER creation for other participants, including while normal athlete entry is CLOSED. Independent of approval. Default false; account lifecycle clears it.';
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

 -- IAM-CREATE-P2: normal athlete entry remains CLOSED; explicit delegation only.
 IF NOT coalesce(v_can_create_for_others,false) THEN
 RAISE EXCEPTION 'ATHLETE_ENTRY_CLOSED' USING ERRCODE = '42501';
 END IF;

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
 v_can_create_for_others boolean;

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
 can_create_matches_for_others
 INTO
 v_role,
 v_is_active,
 v_can_create_for_others
 FROM public.profiles
 WHERE id = v_user_id FOR SHARE;

 IF NOT FOUND THEN
 RAISE EXCEPTION 'Không tìm thấy hồ sơ người dùng';
 END IF;

 IF coalesce(v_is_active, false) = false THEN
 RAISE EXCEPTION 'Tài khoản đã bị vô hiệu hóa';
 END IF;

 -- Approval alone never grants creation. Explicit delegated capability works while normal entry is CLOSED.
 IF upper(coalesce(v_role,'')) <> 'ADMIN' AND NOT (
   upper(coalesce(v_role,''))='MEMBER' AND coalesce(v_can_create_for_others,false)
 ) THEN
 RAISE EXCEPTION 'CREATE_FOR_OTHERS_PERMISSION_REQUIRED' USING ERRCODE='42501';
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

 -- Delegated creation follows the existing MEMBER participant/type contract; ADMIN stays unchanged.
 IF upper(coalesce(v_role,''))='MEMBER' AND (
   v_source.match_type NOT IN ('CLUB_RATED','FRIENDLY_RATED','TRAINING')
   OR v_source.tournament_id IS NOT NULL OR v_source.league_id IS NOT NULL
 ) THEN RAISE EXCEPTION 'MEMBER_MATCH_TYPE_NOT_ALLOWED'; END IF;

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

 IF upper(coalesce(v_role,''))='MEMBER' AND (
   SELECT count(DISTINCT mp.player_id)<>4 OR count(*) FILTER(WHERE p.status='ACTIVE')<>4
   FROM public.match_players mp JOIN public.players p ON p.id=mp.player_id
   WHERE mp.match_id=p_voided_match_id
 ) THEN RAISE EXCEPTION 'ALL_PLAYERS_MUST_BE_ACTIVE_AND_DISTINCT'; END IF;

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
$function$
;
CREATE OR REPLACE FUNCTION public.update_my_rejected_pending_match(p_match_id uuid, p_played_at timestamp with time zone, p_match_type text, p_score_mode text, p_team_a_score integer, p_team_b_score integer, p_team_a_player_1 uuid, p_team_a_player_2 uuid, p_team_b_player_1 uuid, p_team_b_player_2 uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_my_player_id uuid;
  v_can_create_for_others boolean;
  v_match public.matches%rowtype;

  v_distinct_count integer;
  v_found_count integer;
  v_active_count integer;
begin
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;
  perform pg_advisory_xact_lock(726184501);

  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select pr.player_id
  into v_my_player_id
  from public.profiles pr
  join public.players p
    on p.id = pr.player_id
  where pr.id = v_actor
    and pr.role = 'MEMBER'
    and pr.is_active = true
    and p.player_type = 'CLUB'
    and p.status = 'ACTIVE';

  if not found
     or v_my_player_id is null then
    raise exception 'ACTIVE_MEMBER_PLAYER_REQUIRED';
  end if;

  SELECT coalesce(pr.can_create_matches_for_others,false) INTO v_can_create_for_others
  FROM public.profiles pr WHERE pr.id=v_actor FOR SHARE;

  if p_match_id is null then
    raise exception 'MATCH_ID_REQUIRED';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if v_match.status <> 'PENDING' then
    raise exception 'MATCH_NOT_PENDING';
  end if;

  if v_match.created_by <> v_actor then
    raise exception 'ONLY_CREATOR_CAN_EDIT';
  end if;

  if v_match.opponent_rejected_by is null then
    raise exception 'MATCH_NOT_REJECTED';
  end if;

  if not exists (
    select 1
    from public.audit_logs al
    where al.record_id = p_match_id
      and al.table_name = 'matches'
      and al.action = 'CREATE_MY_PENDING_MATCH'
      and al.user_id = v_actor
  ) then
    raise exception 'MEMBER_CREATED_MATCH_REQUIRED';
  end if;

  if p_match_type not in (
    'CLUB_RATED',
    'FRIENDLY_RATED',
    'TRAINING'
  ) then
    raise exception 'MEMBER_MATCH_TYPE_NOT_ALLOWED';
  end if;

  if p_score_mode not in (
    'POINTS',
    'RESULT'
  ) then
    raise exception 'INVALID_SCORE_MODE';
  end if;

  if p_played_at is null then
    raise exception 'PLAYED_AT_REQUIRED';
  end if;

  if p_team_a_score is null
     or p_team_b_score is null then
    raise exception 'SCORE_REQUIRED';
  end if;

  if p_team_a_score < 0
     or p_team_b_score < 0 then
    raise exception 'NEGATIVE_SCORE_NOT_ALLOWED';
  end if;

  if p_score_mode = 'POINTS'
     and (
       p_team_a_score +
       p_team_b_score
     ) <= 0 then
    raise exception 'POINTS_SCORE_MUST_HAVE_RESULT';
  end if;

  if p_score_mode = 'RESULT' then
    if p_team_a_score not in (0,1)
       or p_team_b_score not in (0,1) then
      raise exception 'RESULT_SCORE_MUST_BE_0_OR_1';
    end if;

    if p_team_a_score = 0
       and p_team_b_score = 0 then
      raise exception 'RESULT_SCORE_MUST_HAVE_WINNER';
    end if;
  end if;

  if p_team_a_player_1 is null
     or p_team_a_player_2 is null
     or p_team_b_player_1 is null
     or p_team_b_player_2 is null then
    raise exception 'FOUR_PLAYERS_REQUIRED';
  end if;

  select count(distinct x)
  into v_distinct_count
  from unnest(
    array[
      p_team_a_player_1,
      p_team_a_player_2,
      p_team_b_player_1,
      p_team_b_player_2
    ]::uuid[]
  ) t(x);

  if v_distinct_count <> 4 then
    raise exception 'PLAYERS_MUST_BE_DISTINCT';
  end if;

  if not coalesce(v_can_create_for_others,false) and not (
    v_my_player_id = p_team_a_player_1
    or v_my_player_id = p_team_a_player_2
    or v_my_player_id = p_team_b_player_1
    or v_my_player_id = p_team_b_player_2
  ) then
    raise exception 'MEMBER_MUST_PARTICIPATE';
  end if;

  select count(*)
  into v_found_count
  from public.players p
  where p.id = any(
    array[
      p_team_a_player_1,
      p_team_a_player_2,
      p_team_b_player_1,
      p_team_b_player_2
    ]::uuid[]
  );

  if v_found_count <> 4 then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  select count(*)
  into v_active_count
  from public.players p
  where p.id = any(
    array[
      p_team_a_player_1,
      p_team_a_player_2,
      p_team_b_player_1,
      p_team_b_player_2
    ]::uuid[]
  )
    and p.status = 'ACTIVE';

  if v_active_count <> 4 then
    raise exception 'ALL_PLAYERS_MUST_BE_ACTIVE';
  end if;

  update public.matches
  set
    played_at = p_played_at,
    match_type = p_match_type,
    score_mode = p_score_mode,
    team_a_score = p_team_a_score,
    team_b_score = p_team_b_score,
    notes = nullif(btrim(p_notes), ''),
    updated_at = now()
  where id = p_match_id;

  delete from public.match_players
  where match_id = p_match_id;

  insert into public.match_players (
    match_id,
    player_id,
    team,
    partner_player_id,
    created_at
  )
  values
    (
      p_match_id,
      p_team_a_player_1,
      'A',
      p_team_a_player_2,
      now()
    ),
    (
      p_match_id,
      p_team_a_player_2,
      'A',
      p_team_a_player_1,
      now()
    ),
    (
      p_match_id,
      p_team_b_player_1,
      'B',
      p_team_b_player_2,
      now()
    ),
    (
      p_match_id,
      p_team_b_player_2,
      'B',
      p_team_b_player_1,
      now()
    );

  insert into public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    reason,
    created_at
  )
  values (
    v_actor,
    'UPDATE_MY_REJECTED_PENDING_MATCH',
    'matches',
    p_match_id,

    jsonb_build_object(
      'played_at', v_match.played_at,
      'match_type', v_match.match_type,
      'score_mode', v_match.score_mode,
      'team_a_score', v_match.team_a_score,
      'team_b_score', v_match.team_b_score,
      'notes', v_match.notes
    ),

    jsonb_build_object(
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
      'notes',
        nullif(btrim(p_notes), ''),
      'engine',
        'MEMBER_REJECTED_MATCH_EDIT_P1_2B'
    ),

    'Creator sửa trận sau khi đối thủ từ chối xác nhận',
    now()
  );

  return jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'status', 'PENDING',
    'rejected', true,
    'updated', true
  );
end;
$function$
;
DROP FUNCTION public.get_admin_member_permissions(integer,integer);
CREATE OR REPLACE FUNCTION public.get_admin_member_permissions(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(profile_id uuid, full_name text, login_name text, player_id uuid, is_active boolean, can_collect_tournament_fee boolean, can_approve_matches boolean, can_manage_tournaments boolean, can_manage_fund boolean, can_manage_members boolean, can_manage_players boolean, can_manage_player_lifecycle boolean, can_adjust_rating boolean, can_collect_fund boolean, can_view_audit boolean, can_create_matches_for_others boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active IS TRUE
          AND p.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_limit IS NULL
       OR p_limit < 1
       OR p_limit > 200
       OR p_offset IS NULL
       OR p_offset < 0 THEN
        RAISE EXCEPTION 'INVALID_PAGINATION'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.full_name,
        p.login_name,
        p.player_id,
        p.is_active,
        coalesce(p.can_collect_tournament_fee, false),
        coalesce(p.can_approve_matches, false),
        coalesce(p.can_manage_tournaments, false),
        coalesce(p.can_manage_fund, false),
        coalesce(p.can_manage_members, false),
        coalesce(p.can_manage_players, false),
        coalesce(p.can_manage_player_lifecycle, false),
        coalesce(p.can_adjust_rating, false),
        coalesce(p.can_collect_fund, false),
        coalesce(p.can_view_audit, false),
        coalesce(p.can_create_matches_for_others, false)
    FROM public.profiles p
    WHERE p.role = 'MEMBER'
    ORDER BY p.full_name NULLS LAST, p.id
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_admin_member_permissions(integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_member_permissions(integer,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_update_member_permissions(p_profile_id uuid, p_capabilities jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_old public.profiles%rowtype;
    v_new public.profiles%rowtype;
    v_before jsonb;
    v_after jsonb;
    v_reason text;
    v_allowed constant text[] := ARRAY[
        'can_collect_tournament_fee',
        'can_approve_matches',
        'can_create_matches_for_others',
        'can_manage_tournaments',
        'can_manage_fund',
        'can_manage_members',
        'can_manage_players',
        'can_manage_player_lifecycle',
        'can_adjust_rating',
        'can_collect_fund',
        'can_view_audit'
    ];
BEGIN
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_actor
      AND p.is_active IS TRUE
      AND p.role = 'ADMIN'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_ID_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_profile_id = v_actor THEN
        RAISE EXCEPTION 'SELF_PERMISSION_CHANGE_FORBIDDEN'
            USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_capabilities) IS DISTINCT FROM 'object'
       OR p_capabilities = '{}'::jsonb THEN
        RAISE EXCEPTION 'CAPABILITY_OBJECT_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_each(p_capabilities) e
        WHERE NOT (e.key = ANY(v_allowed))
           OR jsonb_typeof(e.value) IS DISTINCT FROM 'boolean'
    ) THEN
        RAISE EXCEPTION 'INVALID_CAPABILITY_PATCH'
            USING ERRCODE = '22023';
    END IF;

    v_reason := nullif(btrim(p_reason), '');

    IF v_reason IS NULL
       OR char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION 'REASON_REQUIRED_MAX_1000'
            USING ERRCODE = '22023';
    END IF;

    SELECT p.*
    INTO v_old
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.role = 'MEMBER'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_MEMBER_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF v_old.is_active IS NOT TRUE
       AND EXISTS (
           SELECT 1
           FROM jsonb_each(p_capabilities) e
           WHERE e.value = 'true'::jsonb
       ) THEN
        RAISE EXCEPTION 'INACTIVE_TARGET_REVOKE_ONLY'
            USING ERRCODE = '22023';
    END IF;

    SELECT jsonb_object_agg(k, to_jsonb(v_old) -> k)
    INTO v_before
    FROM unnest(v_allowed) AS keys(k);

    v_after := v_before || p_capabilities;

    IF v_before = v_after THEN
        RETURN jsonb_build_object(
            'success', true,
            'changed', false,
            'profile_id', p_profile_id,
            'capabilities', v_before
        );
    END IF;

    UPDATE public.profiles
    SET
        can_collect_tournament_fee =
            (v_after ->> 'can_collect_tournament_fee')::boolean,
        can_create_matches_for_others = (v_after ->> 'can_create_matches_for_others')::boolean,
        can_approve_matches =
            (v_after ->> 'can_approve_matches')::boolean,
        can_manage_tournaments =
            (v_after ->> 'can_manage_tournaments')::boolean,
        can_manage_fund =
            (v_after ->> 'can_manage_fund')::boolean,
        can_manage_members =
            (v_after ->> 'can_manage_members')::boolean,
        can_manage_players =
            (v_after ->> 'can_manage_players')::boolean,
        can_manage_player_lifecycle =
            (v_after ->> 'can_manage_player_lifecycle')::boolean,
        can_adjust_rating =
            (v_after ->> 'can_adjust_rating')::boolean,
        can_collect_fund =
            (v_after ->> 'can_collect_fund')::boolean,
        can_view_audit =
            (v_after ->> 'can_view_audit')::boolean,
        updated_at = now()
    WHERE id = p_profile_id
    RETURNING * INTO v_new;

    SELECT jsonb_object_agg(k, to_jsonb(v_new) -> k)
    INTO v_after
    FROM unnest(v_allowed) AS keys(k);

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
        'UPDATE_MEMBER_PERMISSIONS',
        'profiles',
        p_profile_id,
        jsonb_build_object(
            'profile_id', p_profile_id,
            'capabilities', v_before
        ),
        jsonb_build_object(
            'profile_id', p_profile_id,
            'capabilities', v_after
        ),
        v_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'changed', true,
        'profile_id', p_profile_id,
        'capabilities', v_after
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_admin_member_lifecycle(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(profile_id uuid, full_name text, login_name text, is_active boolean, player_id uuid, player_status text, player_type text, delegated_permissions_count integer, membership_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_active IS TRUE
          AND upper(coalesce(p.role, '')) = 'ADMIN'
    ) THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_limit IS NULL
       OR p_limit < 1
       OR p_limit > 200
       OR p_offset IS NULL
       OR p_offset < 0 THEN
        RAISE EXCEPTION 'INVALID_PAGINATION'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        profile.id,
        profile.full_name,
        profile.login_name,
        profile.is_active,
        profile.player_id,
        player.status,
        player.player_type,
        (
            coalesce(profile.can_collect_tournament_fee, false)::integer +
            coalesce(profile.can_approve_matches, false)::integer +
            coalesce(profile.can_create_matches_for_others, false)::integer +
            coalesce(profile.can_manage_tournaments, false)::integer +
            coalesce(profile.can_manage_fund, false)::integer +
            coalesce(profile.can_manage_members, false)::integer +
            coalesce(profile.can_manage_players, false)::integer +
            coalesce(profile.can_manage_player_lifecycle, false)::integer +
            coalesce(profile.can_adjust_rating, false)::integer +
            coalesce(profile.can_collect_fund, false)::integer +
            coalesce(profile.can_view_audit, false)::integer
        )::integer,
        profile.membership_status
    FROM public.profiles profile
    LEFT JOIN public.players player
      ON player.id = profile.player_id
    WHERE upper(coalesce(profile.role, '')) = 'MEMBER'
    ORDER BY profile.full_name NULLS LAST, profile.id
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_set_member_account_active(p_profile_id uuid, p_is_active boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_old public.profiles%rowtype;
    v_new public.profiles%rowtype;
    v_reason text;
    v_player_status text;
    v_action text;
    v_before_capabilities jsonb;
    v_after_capabilities jsonb;
BEGIN
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.profiles p
    WHERE p.id = v_actor
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

    IF p_is_active IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_STATE_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_profile_id = v_actor THEN
        RAISE EXCEPTION 'SELF_ACCOUNT_LIFECYCLE_FORBIDDEN'
            USING ERRCODE = '22023';
    END IF;

    v_reason := nullif(btrim(p_reason), '');

    IF v_reason IS NULL
       OR char_length(v_reason) > 1000 THEN
        RAISE EXCEPTION 'REASON_REQUIRED_MAX_1000'
            USING ERRCODE = '22023';
    END IF;

    SELECT p.*
    INTO v_old
    FROM public.profiles p
    WHERE p.id = p_profile_id
      AND upper(coalesce(p.role, '')) = 'MEMBER'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_MEMBER_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF v_old.player_id IS NOT NULL THEN
        SELECT player.status
        INTO v_player_status
        FROM public.players player
        WHERE player.id = v_old.player_id;
    END IF;

    IF p_is_active IS TRUE
       AND v_old.membership_status <> 'APPROVED' THEN
        RAISE EXCEPTION 'MEMBERSHIP_APPROVAL_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF v_old.is_active IS NOT DISTINCT FROM p_is_active THEN
        RETURN jsonb_build_object(
            'success', true,
            'changed', false,
            'profile_id', v_old.id,
            'is_active', v_old.is_active,
            'player_id', v_old.player_id,
            'player_status', v_player_status
        );
    END IF;

    v_before_capabilities := jsonb_build_object(
        'can_collect_tournament_fee', coalesce(v_old.can_collect_tournament_fee, false),
        'can_approve_matches', coalesce(v_old.can_approve_matches, false),
        'can_create_matches_for_others', coalesce(v_old.can_create_matches_for_others, false),
        'can_manage_tournaments', coalesce(v_old.can_manage_tournaments, false),
        'can_manage_fund', coalesce(v_old.can_manage_fund, false),
        'can_manage_members', coalesce(v_old.can_manage_members, false),
        'can_manage_players', coalesce(v_old.can_manage_players, false),
        'can_manage_player_lifecycle', coalesce(v_old.can_manage_player_lifecycle, false),
        'can_adjust_rating', coalesce(v_old.can_adjust_rating, false),
        'can_collect_fund', coalesce(v_old.can_collect_fund, false),
        'can_view_audit', coalesce(v_old.can_view_audit, false)
    );

    UPDATE public.profiles
    SET
        is_active = p_is_active,
        can_collect_tournament_fee = false,
        can_approve_matches = false,
        can_create_matches_for_others = false,
        can_manage_tournaments = false,
        can_manage_fund = false,
        can_manage_members = false,
        can_manage_players = false,
        can_manage_player_lifecycle = false,
        can_adjust_rating = false,
        can_collect_fund = false,
        can_view_audit = false,
        updated_at = now()
    WHERE id = p_profile_id
    RETURNING * INTO v_new;

    v_after_capabilities := jsonb_build_object(
        'can_collect_tournament_fee', coalesce(v_new.can_collect_tournament_fee, false),
        'can_approve_matches', coalesce(v_new.can_approve_matches, false),
        'can_create_matches_for_others', coalesce(v_new.can_create_matches_for_others, false),
        'can_manage_tournaments', coalesce(v_new.can_manage_tournaments, false),
        'can_manage_fund', coalesce(v_new.can_manage_fund, false),
        'can_manage_members', coalesce(v_new.can_manage_members, false),
        'can_manage_players', coalesce(v_new.can_manage_players, false),
        'can_manage_player_lifecycle', coalesce(v_new.can_manage_player_lifecycle, false),
        'can_adjust_rating', coalesce(v_new.can_adjust_rating, false),
        'can_collect_fund', coalesce(v_new.can_collect_fund, false),
        'can_view_audit', coalesce(v_new.can_view_audit, false)
    );

    v_action :=
        CASE
            WHEN p_is_active
                THEN 'REACTIVATE_MEMBER_ACCOUNT'
            ELSE 'DEACTIVATE_MEMBER_ACCOUNT'
        END;

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
        v_actor,
        v_action,
        'profiles',
        p_profile_id,
        jsonb_build_object(
            'profile_id', v_old.id,
            'is_active', v_old.is_active,
            'player_id', v_old.player_id,
            'player_status', v_player_status,
            'capabilities', v_before_capabilities
        ),
        jsonb_build_object(
            'profile_id', v_new.id,
            'is_active', v_new.is_active,
            'player_id', v_new.player_id,
            'player_status', v_player_status,
            'capabilities', v_after_capabilities
        ),
        v_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'changed', true,
        'action', v_action,
        'profile_id', v_new.id,
        'is_active', v_new.is_active,
        'player_id', v_new.player_id,
        'player_status', v_player_status,
        'capabilities_revoked', true
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public._review_member_signup(p_profile_id uuid, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_old public.profiles%rowtype;
    v_new public.profiles%rowtype;
    v_reason text := nullif(btrim(p_reason), '');
    v_action text;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.profiles
    WHERE id = v_actor
      AND role = 'ADMIN'
      AND is_active IS TRUE
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_profile_id IS NULL
       OR p_profile_id = v_actor THEN
        RAISE EXCEPTION 'TARGET_MEMBER_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_decision IS NULL
       OR p_decision NOT IN ('APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION 'INVALID_MEMBERSHIP_DECISION'
            USING ERRCODE = '22023';
    END IF;

    IF p_decision = 'REJECTED'
       AND (
           v_reason IS NULL
           OR char_length(v_reason) > 1000
       ) THEN
        RAISE EXCEPTION 'REASON_REQUIRED_MAX_1000'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_old
    FROM public.profiles
    WHERE id = p_profile_id
      AND role = 'MEMBER'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_MEMBER_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF v_old.membership_status <> 'PENDING' THEN
        RAISE EXCEPTION 'SIGNUP_NOT_PENDING'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET
        membership_status = p_decision,
        is_active = (p_decision = 'APPROVED'),
        membership_reviewed_by = v_actor,
        membership_reviewed_at = now(),
        updated_at = now(),
        can_collect_tournament_fee = false,
        can_approve_matches = false,
        can_create_matches_for_others = false,
        can_manage_tournaments = false,
        can_manage_fund = false,
        can_manage_members = false,
        can_manage_players = false,
        can_manage_player_lifecycle = false,
        can_adjust_rating = false,
        can_collect_fund = false,
        can_view_audit = false
    WHERE id = p_profile_id
    RETURNING * INTO v_new;

    v_action :=
        CASE
            WHEN p_decision = 'APPROVED'
                THEN 'APPROVE_MEMBER_SIGNUP'
            ELSE 'REJECT_MEMBER_SIGNUP'
        END;

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
        v_actor,
        v_action,
        'profiles',
        p_profile_id,
        jsonb_build_object(
            'membership_status', v_old.membership_status,
            'is_active', v_old.is_active,
            'player_id', v_old.player_id
        ),
        jsonb_build_object(
            'membership_status', v_new.membership_status,
            'is_active', v_new.is_active,
            'player_id', v_new.player_id,
            'reviewed_by', v_actor,
            'reviewed_at', v_new.membership_reviewed_at
        ),
        CASE
            WHEN p_decision = 'APPROVED'
                THEN 'ADMIN_APPROVED_MEMBER_SIGNUP'
            ELSE v_reason
        END
    );

    RETURN jsonb_build_object(
        'success', true,
        'changed', true,
        'profile_id', v_new.id,
        'membership_status', v_new.membership_status,
        'is_active', v_new.is_active,
        'player_id', v_new.player_id
    );
END;
$function$
;
COMMIT;
