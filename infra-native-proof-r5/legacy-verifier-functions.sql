CREATE FUNCTION rating_validation_b3b.capture_snapshot_core(p_intent_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE i rating_validation_b3b.intents; s jsonb; b rating_validation_b3b.boundaries; existing rating_validation_b3b.seals; BEGIN
 PERFORM rating_validation_b3b.worker(); PERFORM pg_advisory_xact_lock(726184501);
 SELECT * INTO i FROM rating_validation_b3b.intents WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INTENT_NOT_FOUND'; END IF;
 IF i.match_type<>'CLUB_RATED' OR i.score_mode<>'POINTS' THEN RAISE EXCEPTION 'OUTSIDE_PRIMARY_POPULATION'; END IF;
 IF rating_validation_b3b.terminal(i.id) OR EXISTS(SELECT 1 FROM rating_validation_b3b.requests WHERE intent_id=i.id) THEN RAISE EXCEPTION 'RESULT_KNOWN_OR_TERMINAL'; END IF;
 SELECT * INTO existing FROM rating_validation_b3b.seals WHERE intent_id=i.id;
 IF FOUND THEN RETURN jsonb_build_object('already_sealed',true,'seal_id',existing.id,'sealed_at',existing.sealed_at,'payload_hash',existing.payload_hash); END IF;
 IF EXISTS(SELECT 1 FROM rating_validation_b3b.events WHERE intent_id=i.id AND kind='STARTED') THEN RAISE EXCEPTION 'STARTED_WITHOUT_SEAL'; END IF;
 PERFORM rating_validation_b3b.eligible(i);
 s:=rating_validation_b3b.source();
 INSERT INTO rating_validation_b3b.boundaries(intent_id,captured_at,source_text,fingerprint,source_hash,roster_hash)
 VALUES(i.id,(s->>'captured_at')::timestamptz,s::text,rating_validation_b3b.fingerprint(s),
 encode(sha256(convert_to(s::text,'UTF8')),'hex'),rating_validation_b3b.hash_json(i.roster)) RETURNING * INTO b;
 RETURN jsonb_build_object('boundary_id',b.id,'intent_id',i.id,'roster',i.roster,'captured_at',s->>'captured_at','source_text',b.source_text,'source_hash',b.source_hash);
END $$;
CREATE FUNCTION public.capture_rating_validation_snapshot(p_intent_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE v jsonb; c jsonb; BEGIN
 PERFORM rating_validation_b3b.worker(); PERFORM pg_advisory_xact_lock(726184501);
 SELECT baseline_context INTO c FROM rating_validation_b3b.environment_protocol;
 IF c IS DISTINCT FROM '{"baseline": "analysis/rating-calibration01-a/dataset.json", "baseline_sha256": "e695f4ca2919429df058b467686d8c2345d4ccc09ab2d60663800785082fad07", "config": "analysis/rating-calibration01-b/checkpoint_config.json", "config_sha256": "4683e2656f52982c8f4916a905c72255ec4c5ebb6183e596c6cfdc4f5c65b9b5", "counts": {"lineups": 240, "matches": 60, "players": 25}, "environment": "production", "identity": "pick-production-baseline-v1", "manifest": "analysis/rating-calibration01-b/frozen_candidates.json", "manifest_sha256": "348d713d0e6d9a88bac960f009a683ae19aa1c7679f34a76fc28394ef8896ebf", "project_ref": "bflwaqlvnesuqoyikxar", "version": 1}'::jsonb THEN RAISE EXCEPTION 'BASELINE_CONTEXT_MISMATCH'; END IF;
 v:=rating_validation_b3b.capture_snapshot_core(p_intent_id);
 IF v->>'boundary_id' IS NOT NULL THEN
  INSERT INTO rating_validation_b3b.boundary_context VALUES((v->>'boundary_id')::uuid,c);
  RETURN v||jsonb_build_object('baseline_context',c);
 END IF;
 RETURN v;
END $$;
CREATE OR REPLACE FUNCTION rating_validation_b3b.finalize_seal_core(p_boundary_id uuid,p_canonical_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE b rating_validation_b3b.boundaries; i rating_validation_b3b.intents; p rating_validation_b3b.protocol;
 s rating_validation_b3b.seals; v jsonb:=p_canonical_payload::jsonb; current_source jsonb; BEGIN
 PERFORM rating_validation_b3b.worker(); PERFORM pg_advisory_xact_lock(726184501);
 SELECT * INTO b FROM rating_validation_b3b.boundaries WHERE id=p_boundary_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOUNDARY_NOT_FOUND'; END IF;
 SELECT * INTO i FROM rating_validation_b3b.intents WHERE id=b.intent_id FOR UPDATE;
 SELECT singleton,manifest,manifest_hash,worker_hash INTO p FROM rating_validation_b3b.environment_protocol;
 IF (v->>'boundary_id')::uuid IS DISTINCT FROM b.id OR (v->>'intent_id')::uuid IS DISTINCT FROM i.id
 OR v->>'source_hash' IS DISTINCT FROM b.source_hash OR v->'roster' IS DISTINCT FROM i.roster
 OR v->>'manifest_sha256' IS DISTINCT FROM p.manifest_hash OR v->>'worker_sha256' IS DISTINCT FROM p.worker_hash
 OR v#>'{computed,frozen_parameters}' IS DISTINCT FROM p.manifest THEN RAISE EXCEPTION 'WORKER_CONTRACT_MISMATCH'; END IF;
 IF v#>'{computed,source_prefix}' IS DISTINCT FROM b.source_text::jsonb
 OR v#>>'{computed,forecast_created_at}' IS DISTINCT FROM b.source_text::jsonb->>'captured_at'
 THEN RAISE EXCEPTION 'WORKER_SOURCE_MISMATCH'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(v#>'{computed,forecasts}'))<>2
 OR (v#>>'{computed,forecasts,A}')::numeric NOT BETWEEN 0 AND 1
 OR (v#>>'{computed,forecasts,D}')::numeric NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'FORECAST_INVALID'; END IF;
 SELECT * INTO s FROM rating_validation_b3b.seals WHERE intent_id=i.id;
 IF FOUND THEN
  IF s.boundary_id<>b.id OR s.canonical_payload<>convert_to(p_canonical_payload,'UTF8') THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('seal_id',s.id,'sealed_at',s.sealed_at,'payload_hash',s.payload_hash,'idempotent',true);
 END IF;
 IF rating_validation_b3b.terminal(i.id) OR EXISTS(SELECT 1 FROM rating_validation_b3b.requests WHERE intent_id=i.id) THEN RAISE EXCEPTION 'RESULT_KNOWN_OR_TERMINAL'; END IF;
 IF EXISTS(SELECT 1 FROM rating_validation_b3b.events WHERE intent_id=i.id AND kind='STARTED') THEN RAISE EXCEPTION 'STARTED_WITHOUT_SEAL'; END IF;
 current_source:=rating_validation_b3b.source();
 IF rating_validation_b3b.fingerprint(current_source)<>b.fingerprint THEN RAISE EXCEPTION 'STALE_BOUNDARY'; END IF;
 PERFORM rating_validation_b3b.eligible(i);
 INSERT INTO rating_validation_b3b.seals(intent_id,boundary_id,canonical_payload,payload)
 VALUES(i.id,b.id,convert_to(p_canonical_payload,'UTF8'),v) RETURNING * INTO s;
 RETURN jsonb_build_object('seal_id',s.id,'sealed_at',s.sealed_at,'payload_hash',s.payload_hash,'idempotent',false);
END $$;
CREATE FUNCTION public.finalize_rating_validation_seal(p_boundary_id uuid,p_canonical_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE c jsonb; bc jsonb; v jsonb:=p_canonical_payload::jsonb; BEGIN
 PERFORM rating_validation_b3b.worker(); PERFORM pg_advisory_xact_lock(726184501);
 SELECT baseline_context INTO c FROM rating_validation_b3b.environment_protocol;
 SELECT baseline_context INTO bc FROM rating_validation_b3b.boundary_context WHERE boundary_id=p_boundary_id;
 IF c IS DISTINCT FROM '{"baseline": "analysis/rating-calibration01-a/dataset.json", "baseline_sha256": "e695f4ca2919429df058b467686d8c2345d4ccc09ab2d60663800785082fad07", "config": "analysis/rating-calibration01-b/checkpoint_config.json", "config_sha256": "4683e2656f52982c8f4916a905c72255ec4c5ebb6183e596c6cfdc4f5c65b9b5", "counts": {"lineups": 240, "matches": 60, "players": 25}, "environment": "production", "identity": "pick-production-baseline-v1", "manifest": "analysis/rating-calibration01-b/frozen_candidates.json", "manifest_sha256": "348d713d0e6d9a88bac960f009a683ae19aa1c7679f34a76fc28394ef8896ebf", "project_ref": "bflwaqlvnesuqoyikxar", "version": 1}'::jsonb OR bc IS DISTINCT FROM c
 OR v#>'{computed,baseline_context}' IS DISTINCT FROM c
 OR v#>>'{computed,evidence_environment}' IS DISTINCT FROM c->>'environment'
 THEN RAISE EXCEPTION 'BASELINE_CONTEXT_MISMATCH'; END IF;
 RETURN rating_validation_b3b.finalize_seal_core(p_boundary_id,p_canonical_payload);
END $$;
