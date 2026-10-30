-- P1R5 immutable attestation migration candidate. APPROVAL/APPLY SEPARATE.
BEGIN;
SELECT pg_advisory_xact_lock(726184501);
DO $preflight$
BEGIN
 IF to_regprocedure('public.finalize_rating_validation_seal(uuid,text)') IS NULL
 OR to_regprocedure('rating_validation_b3b.finalize_seal_core(uuid,text)') IS NULL
 OR to_regprocedure('public.capture_rating_validation_snapshot(uuid)') IS NULL
 THEN RAISE EXCEPTION 'ATTESTATION_DEPENDENCY_MISSING'; END IF;
 IF to_regclass('rating_validation_b3b.native_intents') IS NOT NULL THEN RAISE EXCEPTION 'ATTESTATION_ALREADY_INSTALLED'; END IF;
 IF encode(sha256(convert_to((SELECT prosrc FROM pg_proc WHERE oid='public.finalize_rating_validation_seal(uuid,text)'::regprocedure),'UTF8')),'hex') <> '44f0576e0c5881b87afa6ceb404ead70de37e431745fec98d849eff5577653d4'
 OR encode(sha256(convert_to((SELECT prosrc FROM pg_proc WHERE oid='rating_validation_b3b.finalize_seal_core(uuid,text)'::regprocedure),'UTF8')),'hex') <> '7577d93508e8d1bb163af16a2ee8bb11f7addba8daaf37aab2337601a73cc7b9'
 THEN RAISE EXCEPTION 'ATTESTATION_CATALOG_DRIFT'; END IF;
 IF NOT EXISTS(SELECT FROM rating_validation_b3b.environment_protocol WHERE singleton AND worker_hash='947a8cbaadd76618e933337613b37eb35c9bf77c24b1c319354e462e9165fb56' AND manifest_hash='348d713d0e6d9a88bac960f009a683ae19aa1c7679f34a76fc28394ef8896ebf') THEN RAISE EXCEPTION 'LEGACY_PROTOCOL_BINDING_DRIFT'; END IF;
END $preflight$;

CREATE TABLE rating_validation_b3b.native_intents(
 intent_id uuid PRIMARY KEY REFERENCES rating_validation_b3b.intents(id),
 attestation_version integer NOT NULL CHECK(attestation_version=2),
 native_artifact_sha256 text NOT NULL CHECK(native_artifact_sha256='018674e02538e52d64ecf8fbfe1b0d0b86d5ef3786d81e0397531a6d7997513f'),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON TABLE rating_validation_b3b.native_intents FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON rating_validation_b3b.native_intents FOR EACH ROW EXECUTE FUNCTION rating_validation_b3b.immutable();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON rating_validation_b3b.native_intents FOR EACH STATEMENT EXECUTE FUNCTION rating_validation_b3b.immutable();

ALTER FUNCTION public.finalize_rating_validation_seal(uuid,text) SET SCHEMA rating_validation_b3b;
ALTER FUNCTION rating_validation_b3b.finalize_rating_validation_seal(uuid,text) RENAME TO finalize_legacy_v1;
REVOKE ALL ON FUNCTION rating_validation_b3b.finalize_legacy_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION rating_validation_b3b.assert_attestation(p_boundary_id uuid,v jsonb,p_native boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
DECLARE intent uuid; mode rating_validation_b3b.native_intents; a jsonb; BEGIN
 PERFORM rating_validation_b3b.worker();
 SELECT intent_id INTO intent FROM rating_validation_b3b.boundaries WHERE id=p_boundary_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'BOUNDARY_NOT_FOUND'; END IF;
 SELECT * INTO mode FROM rating_validation_b3b.native_intents WHERE intent_id=intent;
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'ATTESTATION_OBJECT_REQUIRED'; END IF;
 IF v->>'worker_sha256' IS DISTINCT FROM '947a8cbaadd76618e933337613b37eb35c9bf77c24b1c319354e462e9165fb56'
 OR v#>>'{computed,source_code_sha256}' IS DISTINCT FROM '604737ed1a4d8cd64fe9e6ace278954c097c74e1dc9ddb2ccdd2c2b9f98935a0'
 OR v->>'manifest_sha256' IS DISTINCT FROM '348d713d0e6d9a88bac960f009a683ae19aa1c7679f34a76fc28394ef8896ebf'
 OR v#>>'{computed,seal_version}' IS DISTINCT FROM 'B3_LOCAL_1'
 THEN RAISE EXCEPTION 'LEGACY_REFERENCE_MISMATCH'; END IF;
 IF v ?| ARRAY['native_artifact_sha256','attestation_version','protocol_reference_sha256'] THEN RAISE EXCEPTION 'ATTESTATION_SHAPE_INVALID'; END IF;
 IF NOT p_native THEN
  IF mode.intent_id IS NOT NULL OR v ? 'attestation' THEN RAISE EXCEPTION 'NATIVE_FINALIZER_REQUIRED'; END IF;
  RETURN;
 END IF;
 IF mode.intent_id IS NULL THEN RAISE EXCEPTION 'NATIVE_CAPTURE_REQUIRED'; END IF;
 a:=v->'attestation';
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR a IS DISTINCT FROM jsonb_build_object(
 'version',2,'protocol_version','B3_LOCAL_1',
 'protocol_reference_sha256','947a8cbaadd76618e933337613b37eb35c9bf77c24b1c319354e462e9165fb56',
 'reference_source_sha256','604737ed1a4d8cd64fe9e6ace278954c097c74e1dc9ddb2ccdd2c2b9f98935a0',
 'native_artifact_sha256','018674e02538e52d64ecf8fbfe1b0d0b86d5ef3786d81e0397531a6d7997513f')
 OR mode.native_artifact_sha256 IS DISTINCT FROM a->>'native_artifact_sha256'
 THEN RAISE EXCEPTION 'NATIVE_ATTESTATION_MISMATCH'; END IF;
END $body$;
REVOKE ALL ON FUNCTION rating_validation_b3b.assert_attestation(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.finalize_rating_validation_seal(p_boundary_id uuid,p_canonical_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $body$
BEGIN
 PERFORM rating_validation_b3b.worker(); PERFORM pg_advisory_xact_lock(726184501);
 -- Preserve exact already-accepted historical legacy retries without reclassifying/re-hashing.
 -- Native-marked intents can never use this compatibility branch.
 IF EXISTS(SELECT FROM rating_validation_b3b.seals s JOIN rating_validation_b3b.boundaries b ON b.id=s.boundary_id
  WHERE b.id=p_boundary_id AND s.canonical_payload=convert_to(p_canonical_payload,'UTF8')
  AND NOT EXISTS(SELECT FROM rating_validation_b3b.native_intents n WHERE n.intent_id=s.intent_id))
 THEN RETURN rating_validation_b3b.finalize_legacy_v1(p_boundary_id,p_canonical_payload); END IF;
 PERFORM rating_validation_b3b.assert_attestation(p_boundary_id,p_canonical_payload::jsonb,false);
 RETURN rating_validation_b3b.finalize_legacy_v1(p_boundary_id,p_canonical_payload);
END $body$;

CREATE FUNCTION public.capture_native_rating_validation_snapshot(p_intent_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $body$
DECLARE result jsonb; BEGIN
 PERFORM rating_validation_b3b.worker(); PERFORM pg_advisory_xact_lock(726184501);
 result:=public.capture_rating_validation_snapshot(p_intent_id);
 IF result->>'already_sealed'='true' THEN RETURN result; END IF;
 INSERT INTO rating_validation_b3b.native_intents(intent_id,attestation_version,native_artifact_sha256)
 VALUES(p_intent_id,2,'018674e02538e52d64ecf8fbfe1b0d0b86d5ef3786d81e0397531a6d7997513f') ON CONFLICT(intent_id) DO NOTHING;
 IF NOT EXISTS(SELECT FROM rating_validation_b3b.native_intents WHERE intent_id=p_intent_id AND native_artifact_sha256='018674e02538e52d64ecf8fbfe1b0d0b86d5ef3786d81e0397531a6d7997513f' AND attestation_version=2) THEN RAISE EXCEPTION 'NATIVE_IDENTITY_DRIFT'; END IF;
 RETURN result;
END $body$;

CREATE FUNCTION public.finalize_native_rating_validation_seal(p_boundary_id uuid,p_canonical_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $body$
BEGIN
 PERFORM rating_validation_b3b.worker(); PERFORM pg_advisory_xact_lock(726184501);
 PERFORM rating_validation_b3b.assert_attestation(p_boundary_id,p_canonical_payload::jsonb,true);
 RETURN rating_validation_b3b.finalize_legacy_v1(p_boundary_id,p_canonical_payload);
END $body$;
REVOKE ALL ON FUNCTION public.finalize_rating_validation_seal(uuid,text),public.capture_native_rating_validation_snapshot(uuid),public.finalize_native_rating_validation_seal(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finalize_rating_validation_seal(uuid,text),public.capture_native_rating_validation_snapshot(uuid),public.finalize_native_rating_validation_seal(uuid,text) TO service_role;
COMMIT;
