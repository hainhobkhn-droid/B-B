DO $probe$ DECLARE a uuid;ids uuid[];i uuid;b jsonb;v jsonb;nv jsonb;r jsonb;oldseal rating_validation_b3b.seals;checks jsonb:='{}';BEGIN
PERFORM set_config('request.jwt.claim.role','service_role',true);
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

END $probe$;