DO $probe$ DECLARE a uuid;ids uuid[];i uuid;b jsonb;v jsonb;nv jsonb;r jsonb;oldseal rating_validation_b3b.seals;checks jsonb:='{}';BEGIN
 BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT * INTO oldseal FROM rating_validation_b3b.seals ORDER BY sealed_at,id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'HISTORICAL_SEAL_REQUIRED'; END IF;
  r:=public.finalize_rating_validation_seal(oldseal.boundary_id,convert_from(oldseal.canonical_payload,'UTF8'));
  IF r->>'idempotent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'HISTORICAL_RETRY_NOT_IDEMPOTENT'; END IF;
  checks:=checks||' {"historical_legacy":true}'::jsonb;
  SELECT id INTO a FROM public.profiles WHERE role='ADMIN' AND is_active AND membership_status='APPROVED' AND NOT must_change_password ORDER BY id LIMIT 1;
  SELECT array_agg(id ORDER BY id) INTO ids FROM (SELECT id FROM public.players WHERE status='ACTIVE' AND player_type='CLUB' ORDER BY id LIMIT 4) x;
  IF a IS NULL OR cardinality(ids)<>4 THEN RAISE EXCEPTION 'SAFE_PROOF_FIXTURE_IDENTITY_UNAVAILABLE'; END IF;
  INSERT INTO rating_validation_b3b.intents(request_id,created_by,roster,match_type,score_mode)
  VALUES(gen_random_uuid(),a,jsonb_build_object('A',to_jsonb(ids[1:2]),'B',to_jsonb(ids[3:4])),'CLUB_RATED','POINTS') RETURNING id INTO i;
  b:=public.capture_rating_validation_snapshot(i);
  v:=jsonb_build_object('boundary_id',b->>'boundary_id','intent_id',i,'source_hash',b->>'source_hash','roster',b->'roster',
   'worker_sha256','947a8cbaadd76618e933337613b37eb35c9bf77c24b1c319354e462e9165fb56',
   'manifest_sha256','348d713d0e6d9a88bac960f009a683ae19aa1c7679f34a76fc28394ef8896ebf',
   'computed',jsonb_build_object('source_code_sha256','604737ed1a4d8cd64fe9e6ace278954c097c74e1dc9ddb2ccdd2c2b9f98935a0','seal_version','B3_LOCAL_1',
    'frozen_parameters',(SELECT manifest FROM rating_validation_b3b.environment_protocol),'baseline_context',b->'baseline_context','evidence_environment','production',
    'source_prefix',(b->>'source_text')::jsonb,'forecast_created_at',b->>'captured_at','forecasts',jsonb_build_object('A','0.5','D','0.5')));
  r:=public.finalize_rating_validation_seal((b->>'boundary_id')::uuid,v::text);
  IF r->>'idempotent' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'LEGACY_CREATE_NOT_NEW'; END IF;
  checks:=checks||'{"legacy_valid":true}'::jsonb;
  BEGIN
   PERFORM public.finalize_rating_validation_seal((b->>'boundary_id')::uuid,(v||'{"worker_sha256":"wrong"}'::jsonb)::text);
   RAISE EXCEPTION 'WRONG_WORKER_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LEGACY_REFERENCE_MISMATCH%' THEN RAISE; END IF; END;
  checks:=checks||'{"wrong_legacy_worker_denied":true}'::jsonb;
  BEGIN
   PERFORM public.finalize_rating_validation_seal((b->>'boundary_id')::uuid,jsonb_set(v,'{computed,source_code_sha256}','"wrong"')::text);
   RAISE EXCEPTION 'WRONG_SOURCE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%LEGACY_REFERENCE_MISMATCH%' THEN RAISE; END IF; END;
  checks:=checks||'{"wrong_legacy_source_denied":true}'::jsonb;
  INSERT INTO rating_validation_b3b.intents(request_id,created_by,roster,match_type,score_mode)
  VALUES(gen_random_uuid(),a,jsonb_build_object('A',to_jsonb(ids[1:2]),'B',to_jsonb(ids[3:4])),'CLUB_RATED','POINTS') RETURNING id INTO i;
  b:=public.capture_native_rating_validation_snapshot(i);
  v:=v||jsonb_build_object('boundary_id',b->>'boundary_id','intent_id',i,'source_hash',b->>'source_hash','roster',b->'roster');
  v:=jsonb_set(jsonb_set(v,'{computed,source_prefix}',(b->>'source_text')::jsonb),'{computed,forecast_created_at}',to_jsonb(b->>'captured_at'));
  nv:=v||jsonb_build_object('attestation',jsonb_build_object('version',2,'protocol_version','B3_LOCAL_1',
   'protocol_reference_sha256','947a8cbaadd76618e933337613b37eb35c9bf77c24b1c319354e462e9165fb56','reference_source_sha256','604737ed1a4d8cd64fe9e6ace278954c097c74e1dc9ddb2ccdd2c2b9f98935a0',
   'native_artifact_sha256','018674e02538e52d64ecf8fbfe1b0d0b86d5ef3786d81e0397531a6d7997513f'));
  r:=public.finalize_native_rating_validation_seal((b->>'boundary_id')::uuid,nv::text);
  IF r->>'idempotent' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'NATIVE_CREATE_NOT_NEW'; END IF;
  checks:=checks||'{"native_valid":true}'::jsonb;
  BEGIN
   PERFORM public.finalize_native_rating_validation_seal((b->>'boundary_id')::uuid,jsonb_set(nv,'{attestation,native_artifact_sha256}',to_jsonb(repeat('0',64)))::text);
   RAISE EXCEPTION 'WRONG_NATIVE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%NATIVE_ATTESTATION_MISMATCH%' THEN RAISE; END IF; END;
  checks:=checks||'{"wrong_native_denied":true}'::jsonb;
  BEGIN
   PERFORM public.finalize_native_rating_validation_seal((b->>'boundary_id')::uuid,(nv#-'{attestation,native_artifact_sha256}')::text);
   RAISE EXCEPTION 'MISSING_NATIVE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%NATIVE_ATTESTATION_MISMATCH%' THEN RAISE; END IF; END;
  checks:=checks||'{"missing_native_denied":true}'::jsonb;
  BEGIN
   PERFORM public.finalize_native_rating_validation_seal((b->>'boundary_id')::uuid,jsonb_set(nv,'{attestation,native_artifact_sha256}',to_jsonb(repeat('a',64)))::text);
   RAISE EXCEPTION 'UNKNOWN_NATIVE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%NATIVE_ATTESTATION_MISMATCH%' THEN RAISE; END IF; END;
  checks:=checks||'{"unknown_native_denied":true}'::jsonb;
  BEGIN
   PERFORM public.finalize_rating_validation_seal((b->>'boundary_id')::uuid,v::text);
   RAISE EXCEPTION 'DOWNGRADE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%NATIVE_FINALIZER_REQUIRED%' THEN RAISE; END IF; END;
  checks:=checks||'{"downgrade_denied":true}'::jsonb;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  BEGIN
   PERFORM public.finalize_native_rating_validation_seal((b->>'boundary_id')::uuid,nv::text);
   RAISE EXCEPTION 'FORGED_BROWSER_ACCESS_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  checks:=checks||'{"forged_browser_denied":true}'::jsonb;
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.role','anon',true);
  BEGIN
   PERFORM public.capture_native_rating_validation_snapshot(i);
   RAISE EXCEPTION 'ANON_ACCESS_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  checks:=checks||'{"anon_denied":true}'::jsonb;
  PERFORM rating_validation_b3b.selected_protocol();
  checks:=checks||'{"selected_protocol":true}'::jsonb;
  RAISE EXCEPTION 'ROLLBACK_ONLY_PROOF_COMPLETE' USING ERRCODE='PZ003';
 EXCEPTION WHEN SQLSTATE 'PZ003' THEN NULL;
 END;
PERFORM set_config('pick.attestation_proof',checks::text,true);END $probe$;
SELECT current_setting('pick.attestation_proof')::jsonb;