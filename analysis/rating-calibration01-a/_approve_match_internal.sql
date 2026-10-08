CREATE OR REPLACE FUNCTION public._approve_match_internal(p_match_id uuid, p_algorithm_version text, p_actor_user_id uuid, p_opponent_confirmed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_match public.matches%rowtype;
  v_player_count integer;
  v_team_a_count integer;
  v_team_b_count integer;
  v_league_club_count integer;
  v_rule_count integer;
  v_rating_result jsonb;
  v_fund_result jsonb;
  v_audit_action text;
begin
  perform pg_advisory_xact_lock(726184501);

  if p_actor_user_id is null then
    raise exception 'APPROVAL_ACTOR_REQUIRED';
  end if;
  if p_match_id is null then
    raise exception 'match_id không được NULL';
  end if;
  if p_algorithm_version is null or btrim(p_algorithm_version) = '' then
    raise exception 'algorithm_version không được để trống';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Không tìm thấy trận đấu: %', p_match_id;
  end if;
  if v_match.status <> 'PENDING' then
    raise exception
      'Không thể duyệt trận %. Trạng thái hiện tại: %. Chỉ trận PENDING mới được APPROVED',
      p_match_id, v_match.status;
  end if;
  if v_match.match_type = 'SELF_REPORTED' then
    raise exception 'SELF_REPORTED_HISTORICAL_ONLY';
  end if;

  if v_match.match_type = 'TOURNAMENT' then
    if v_match.tournament_id is null or v_match.league_id is not null then
      raise exception 'TOURNAMENT_REQUIRES_TOURNAMENT_ID_ONLY';
    end if;
  elsif v_match.match_type = 'LEAGUE' then
    if v_match.league_id is null or v_match.tournament_id is not null then
      raise exception 'LEAGUE_REQUIRES_LEAGUE_ID_ONLY';
    end if;
  elsif v_match.match_type in ('CLUB_RATED','FRIENDLY_RATED','TRAINING') then
    if v_match.tournament_id is not null or v_match.league_id is not null then
      raise exception 'STANDARD_MATCH_CANNOT_HAVE_COMPETITION_ID';
    end if;
  else
    raise exception 'MATCH_TYPE_NOT_APPROVABLE: %', v_match.match_type;
  end if;

  select count(*),
         count(*) filter (where team = 'A'),
         count(*) filter (where team = 'B')
  into v_player_count, v_team_a_count, v_team_b_count
  from public.match_players
  where match_id = p_match_id;

  if v_player_count <> 4 or v_team_a_count <> 2 or v_team_b_count <> 2 then
    raise exception
      'Trận % không hợp lệ. Yêu cầu đúng 4 VĐV, Team A = 2, Team B = 2. Hiện tại: total=%, A=%, B=%',
      p_match_id, v_player_count, v_team_a_count, v_team_b_count;
  end if;

  if v_match.match_type = 'LEAGUE' then
    select count(*) into v_league_club_count
    from public.match_players mp
    join public.players p on p.id = mp.player_id
    where mp.match_id = p_match_id
      and p.player_type = 'CLUB'
      and p.status = 'ACTIVE';
    if v_league_club_count <> 4 then
      raise exception 'LEAGUE_REQUIRES_FOUR_ACTIVE_CLUB_PLAYERS';
    end if;
  end if;

  if v_match.team_a_score is null or v_match.team_b_score is null then
    raise exception 'Trận % chưa có đầy đủ tỷ số', p_match_id;
  end if;
  if v_match.team_a_score < 0 or v_match.team_b_score < 0 then
    raise exception 'Tỷ số trận % không được âm', p_match_id;
  end if;
  if v_match.score_mode not in ('POINTS','RESULT') then
    raise exception 'score_mode "%" không được hỗ trợ', v_match.score_mode;
  end if;
  if v_match.score_mode = 'POINTS'
     and (v_match.team_a_score + v_match.team_b_score) <= 0 then
    raise exception 'Trận POINTS phải có tổng điểm lớn hơn 0';
  end if;
  if v_match.score_mode = 'RESULT' then
    if v_match.team_a_score not in (0,1)
       or v_match.team_b_score not in (0,1) then
      raise exception 'Trận RESULT chỉ chấp nhận score 0 hoặc 1';
    end if;
    if v_match.team_a_score = 0 and v_match.team_b_score = 0 then
      raise exception
        'Trận RESULT 0-0 chưa có kết quả hoàn chỉnh và không thể APPROVE';
    end if;
  end if;

  if not exists (
    select 1 from public.rating_settings rs
    where rs.algorithm_version = p_algorithm_version
  ) then
    raise exception 'Không tồn tại Rating algorithm version: %', p_algorithm_version;
  end if;

  select count(*) into v_rule_count
  from public.fund_rules fr
  where fr.match_type = v_match.match_type
    and fr.is_active = true
    and fr.effective_from <= v_match.played_at::date
    and (fr.effective_to is null or fr.effective_to >= v_match.played_at::date);
  if v_rule_count > 1 then
    raise exception
      'Có % Fund Rules bị chồng lấn cho match_type % tại ngày %. Không thể duyệt trận',
      v_rule_count, v_match.match_type, v_match.played_at::date;
  end if;

  perform set_config('app.match_workflow', 'APPROVE_MATCH', true);
  update public.matches
  set status = 'APPROVED',
      invalid_reason = null,
      opponent_confirmed_by = p_opponent_confirmed_by,
      opponent_confirmed_at = case
        when p_opponent_confirmed_by is null then null
        else now()
      end,
      updated_at = now()
  where id = p_match_id;
  perform set_config('app.match_workflow', '', true);

  v_rating_result := public._rebuild_ratings_internal(
    p_algorithm_version, p_actor_user_id
  );
  v_fund_result := public._generate_match_fund_internal(
    p_match_id, p_actor_user_id
  );
  v_audit_action := case
    when p_opponent_confirmed_by is null then 'APPROVE_MATCH'
    else 'CONFIRM_MATCH_BY_OPPONENT'
  end;

  insert into public.audit_logs (
    user_id, action, table_name, record_id,
    old_data, new_data, reason, created_at
  ) values (
    p_actor_user_id,
    v_audit_action,
    'matches',
    p_match_id,
    jsonb_build_object('status', v_match.status),
    jsonb_build_object(
      'status', 'APPROVED',
      'match_type', v_match.match_type,
      'tournament_id', v_match.tournament_id,
      'league_id', v_match.league_id,
      'algorithm_version', p_algorithm_version,
      'opponent_confirmed_by', p_opponent_confirmed_by,
      'rating_result', v_rating_result,
      'fund_result', v_fund_result,
      'engine', 'MATCH_APPROVAL_P1_2'
    ),
    case
      when p_opponent_confirmed_by is null
        then 'Duyệt trận theo Match Business Matrix P1 và xử lý Rating + Quỹ CLB'
      else 'Đối thủ xác nhận kết quả và xử lý Rating + Quỹ CLB'
    end,
    now()
  );

  return jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'status_before', v_match.status,
    'status_after', 'APPROVED',
    'match_type', v_match.match_type,
    'tournament_id', v_match.tournament_id,
    'league_id', v_match.league_id,
    'algorithm_version', p_algorithm_version,
    'opponent_confirmed_by', p_opponent_confirmed_by,
    'rating', v_rating_result,
    'fund', v_fund_result
  );
end;
$function$
