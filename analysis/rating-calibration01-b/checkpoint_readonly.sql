BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
WITH active AS (SELECT algorithm_version FROM public.rating_settings WHERE is_active ORDER BY id DESC LIMIT 1),
rated AS (SELECT m.* FROM public.matches m JOIN public.rating_match_weights w ON w.match_type=m.match_type WHERE m.status='APPROVED' AND w.weight>0),
selected AS (SELECT * FROM rated WHERE played_at > '__CUTOFF__'::timestamptz),
timeline AS (
 SELECT e.player_id,e.rating_after,m.played_at AS at,1 AS typ,m.match_number,NULL::bigint AS ord,m.id FROM public.rating_events e JOIN public.matches m ON m.id=e.match_id WHERE e.algorithm_version=(SELECT algorithm_version FROM active)
 UNION ALL SELECT e.player_id,e.rating_after,a.effective_at,2,NULL::integer,a.replay_order,a.id FROM public.rating_adjustment_events e JOIN public.rating_adjustments a ON a.id=e.adjustment_id WHERE e.algorithm_version=(SELECT algorithm_version FROM active)
),last_event AS (SELECT DISTINCT ON(player_id) player_id,rating_after FROM timeline ORDER BY player_id,at DESC,typ DESC,match_number DESC NULLS FIRST,ord DESC NULLS FIRST,id DESC)
SELECT jsonb_build_object(
 'captured_at',now(),'active_version',(SELECT algorithm_version FROM active),
 'formula_md5',md5(pg_get_functiondef('public._rebuild_ratings_internal(text,uuid)'::regprocedure)),
 'settings',(SELECT to_jsonb(s)-'created_at' FROM public.rating_settings s WHERE s.is_active ORDER BY id DESC LIMIT 1),
 'active_settings_count',(SELECT count(*) FROM public.rating_settings WHERE is_active),
 'weights',(SELECT jsonb_object_agg(match_type,weight) FROM public.rating_match_weights),
 'total_rated_matches',(SELECT count(*) FROM rated),
 'baseline_rated_present',(SELECT count(*) FROM rated WHERE id IN (__BASELINE_IDS__)),
 'quality',jsonb_build_object(
  'projection_mismatch',(SELECT count(*) FROM public.players p LEFT JOIN last_event e ON e.player_id=p.id WHERE p.current_rating IS DISTINCT FROM coalesce(e.rating_after,p.initial_rating)),
  'orphan_events',(SELECT count(*) FROM public.rating_events e LEFT JOIN public.players p ON p.id=e.player_id LEFT JOIN public.matches m ON m.id=e.match_id WHERE p.id IS NULL OR m.id IS NULL),
  'duplicate_events',(SELECT count(*) FROM (SELECT match_id,player_id FROM public.rating_events WHERE algorithm_version=(SELECT algorithm_version FROM active) GROUP BY match_id,player_id HAVING count(*)<>1) q),
  'cardinality_errors',(SELECT count(*) FROM rated m WHERE (SELECT count(*) FROM public.match_players WHERE match_id=m.id)<>4 OR (SELECT count(DISTINCT player_id) FROM public.match_players WHERE match_id=m.id)<>4 OR (SELECT count(*) FROM public.match_players WHERE match_id=m.id AND team='A')<>2 OR (SELECT count(*) FROM public.match_players WHERE match_id=m.id AND team='B')<>2 OR (SELECT count(*) FROM public.rating_events WHERE match_id=m.id AND algorithm_version=(SELECT algorithm_version FROM active))<>4),
  'nonfinite_values',((SELECT count(*) FROM public.players p WHERE EXISTS (SELECT 1 FROM unnest(ARRAY[p.initial_rating::text,p.current_rating::text]) v WHERE v IN ('NaN','Infinity','-Infinity'))) + (SELECT count(*) FROM public.rating_events e WHERE EXISTS (SELECT 1 FROM unnest(ARRAY[e.rating_before::text,e.rating_after::text,e.team_rating::text,e.opponent_team_rating::text,e.expected_share::text,e.actual_share::text,e.performance_gap::text,e.match_weight::text,e.recency_weight::text,e.provisional_factor::text,e.rating_delta::text]) v WHERE v IN ('NaN','Infinity','-Infinity')))),
  'result_errors',(SELECT count(*) FROM rated WHERE team_a_score IS NULL OR team_b_score IS NULL OR team_a_score<0 OR team_b_score<0 OR score_mode NOT IN ('POINTS','RESULT') OR (score_mode='POINTS' AND team_a_score+team_b_score<=0) OR (score_mode='RESULT' AND (team_a_score NOT IN (0,1) OR team_b_score NOT IN (0,1) OR team_a_score+team_b_score=0))),
  'adjustments',(SELECT count(*) FROM public.rating_adjustments)),
 'players',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'first_rated_at',(SELECT min(m.played_at) FROM rated m JOIN public.match_players mp ON mp.match_id=m.id WHERE mp.player_id=p.id),'cumulative_matches',(SELECT count(*) FROM rated m JOIN public.match_players mp ON mp.match_id=m.id WHERE mp.player_id=p.id))) FROM public.players p WHERE p.id IN (SELECT mp.player_id FROM public.match_players mp JOIN selected s ON s.id=mp.match_id)),'[]'::jsonb),
 'matches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'played_at',played_at,'match_number',match_number,'match_type',match_type,'score_mode',score_mode,'team_a_score',team_a_score,'team_b_score',team_b_score) ORDER BY played_at,match_number,id) FROM selected),'[]'::jsonb),
 'lineups',coalesce((SELECT jsonb_agg(jsonb_build_object('match_id',mp.match_id,'player_id',mp.player_id,'team',mp.team) ORDER BY mp.match_id,mp.team,mp.player_id) FROM public.match_players mp JOIN selected s ON s.id=mp.match_id),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('match_id',e.match_id,'player_id',e.player_id,'rating_before',e.rating_before,'rating_after',e.rating_after,'rating_delta',e.rating_delta,'expected_share',e.expected_share,'actual_share',e.actual_share) ORDER BY e.match_id,e.player_id) FROM public.rating_events e JOIN selected s ON s.id=e.match_id WHERE e.algorithm_version=(SELECT algorithm_version FROM active)),'[]'::jsonb)
) AS monitor_dataset;
ROLLBACK;
