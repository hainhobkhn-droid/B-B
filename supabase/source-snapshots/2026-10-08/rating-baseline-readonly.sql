BEGIN TRANSACTION READ ONLY;
WITH active AS (SELECT algorithm_version FROM public.rating_settings WHERE is_active ORDER BY id DESC LIMIT 1),
timeline AS (
 SELECT re.player_id,re.rating_after,m.played_at event_time,1 event_type_order,m.match_number,NULL::bigint replay_order,m.id event_id FROM public.rating_events re JOIN public.matches m ON m.id=re.match_id WHERE re.algorithm_version=(SELECT algorithm_version FROM active)
 UNION ALL SELECT e.player_id,e.rating_after,a.effective_at,2,NULL::integer,a.replay_order,a.id FROM public.rating_adjustment_events e JOIN public.rating_adjustments a ON a.id=e.adjustment_id WHERE e.algorithm_version=(SELECT algorithm_version FROM active)
), last_event AS (SELECT DISTINCT ON(player_id) player_id,rating_after FROM timeline ORDER BY player_id,event_time DESC,event_type_order DESC,match_number DESC NULLS FIRST,replay_order DESC NULLS FIRST,event_id DESC)
SELECT jsonb_build_object('captured_at',now(),'active_version',(SELECT algorithm_version FROM active),
 'players',(SELECT count(*) FROM public.players),'active_players',(SELECT count(*) FROM public.players WHERE status='ACTIVE'),
 'rating_events',(SELECT count(*) FROM public.rating_events),'approved_matches',(SELECT count(*) FROM public.matches WHERE status='APPROVED'),
 'rated_matches',(SELECT count(*) FROM public.matches m JOIN public.rating_match_weights w ON w.match_type=m.match_type WHERE m.status='APPROVED' AND w.weight>0),
 'adjustments',(SELECT count(*) FROM public.rating_adjustments),'adjustment_events',(SELECT count(*) FROM public.rating_adjustment_events),
 'projection_mismatch',(SELECT count(*) FROM public.players p LEFT JOIN last_event l ON l.player_id=p.id WHERE p.current_rating IS NULL OR abs(p.current_rating-coalesce(l.rating_after,p.initial_rating))>0.0005),
 'adjustment_integrity_mismatch',(SELECT count(*) FROM public.rating_adjustments a LEFT JOIN public.rating_adjustment_events e ON e.adjustment_id=a.id AND e.algorithm_version=(SELECT algorithm_version FROM active) WHERE e.id IS NULL OR e.requested_amount<>a.amount OR abs(e.applied_delta-(e.rating_after-e.rating_before))>0.0005),
 'orphan_rating_events',(SELECT count(*) FROM public.rating_events e LEFT JOIN public.players p ON p.id=e.player_id LEFT JOIN public.matches m ON m.id=e.match_id WHERE p.id IS NULL OR m.id IS NULL),
 'rating_settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.rating_settings s),
 'weights',(SELECT jsonb_agg(to_jsonb(w) ORDER BY match_type) FROM public.rating_match_weights w),
 'projection_hash',(SELECT md5(coalesce(string_agg(id::text||':'||initial_rating::text||':'||current_rating::text,'|' ORDER BY id),'')) FROM public.players),
 'events_hash',(SELECT md5(coalesce(string_agg(to_jsonb(e)::text,'|' ORDER BY id),'')) FROM public.rating_events e),
 'adjustments_hash',(SELECT md5(coalesce(string_agg(to_jsonb(a)::text,'|' ORDER BY id),'')) FROM public.rating_adjustments a),
 'historical_matches_readable',(SELECT count(*) FROM public.matches),'historical_lineups_readable',(SELECT count(*) FROM public.match_players)
) AS baseline;
ROLLBACK;