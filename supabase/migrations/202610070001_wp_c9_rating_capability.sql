-- WP-C9A: production-catalog guarded authorization extension only.
-- Audited B&B PICK 2026-10-07; exact baseline fixture in tests JSON.
-- One-time forward migration: reapplication intentionally rejects changed source.
-- Recovery: transaction rollback on any assertion; after deployment restore the
-- captured original definitions only via a separately reviewed forward migration.
-- No ledger/formula/rebuild/grant/ownership change. Active wrappers retain ACC07B.
-- Non-finite numeric input is rejected before ledger insertion (local audit found
-- the original zero-only validation accepted NaN and clamped projection to max).
BEGIN;
DO $migration$
DECLARE
  r record;
  f record;
  after_f record;
  definition text;
  old_predicate text := E'and pr.role = ''ADMIN''\r\n          and pr.is_active = true';
  new_predicate text := E'and (pr.role = ''ADMIN'' OR (pr.role = ''MEMBER'' AND pr.can_adjust_rating IS TRUE))\r\n          and pr.is_active = true\r\n          and public.current_user_business_access_active()';
BEGIN
  -- Validate EVERY dependency before changing ANY function.
  FOR r IN SELECT * FROM (VALUES
    ('public.record_rating_adjustment(uuid,uuid,numeric,text,timestamptz,text)', '95d1c581b2c2520d1b472b5533292506', false),
    ('public.correct_rating_adjustment(uuid,text,text)', '2d0ddc783093cc1cfa138cbe8032ab5f', false),
    ('public.record_rating_adjustment_active(uuid,uuid,numeric,text,timestamptz)', '511cead28025ae378827a9e18c4ce5c5', true),
    ('public.correct_rating_adjustment_active(uuid,text)', '6121a66c5b4b9933f6e7e7e498d5bf82', true),
    ('public._rebuild_ratings_internal(text,uuid)', 'b3b434e407c1828bbb6dbf2907148104', false),
    ('public.current_user_business_access_active()', 'd5a196e9bfb9522d559e3422c6669c01', true)
  ) AS expected(signature, hash, authenticated_execute)
  LOOP
    SELECT p.*, pg_get_functiondef(p.oid) AS definition,
           pg_get_userbyid(p.proowner) AS owner_name
    INTO f FROM pg_proc p WHERE p.oid = to_regprocedure(r.signature);
    IF NOT FOUND THEN RAISE EXCEPTION 'WP_C9_RATING_BASELINE_MISSING: %', r.signature; END IF;
    IF md5(f.definition) IS DISTINCT FROM r.hash
       OR f.prosecdef IS NOT TRUE
       OR f.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
       OR f.owner_name <> 'postgres'
       OR has_function_privilege('authenticated', f.oid, 'EXECUTE') IS DISTINCT FROM r.authenticated_execute
       OR has_function_privilege('anon', f.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f.oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM aclexplode(coalesce(f.proacl, acldefault('f',f.proowner))) a
                  WHERE a.grantee=0 OR a.privilege_type<>'EXECUTE' OR a.is_grantable
                     OR pg_get_userbyid(a.grantee) NOT IN ('postgres','service_role','authenticated'))
    THEN RAISE EXCEPTION 'WP_C9_RATING_BASELINE_DRIFT: %', r.signature; END IF;
  END LOOP;

  FOR r IN SELECT signature FROM (VALUES
    ('public.record_rating_adjustment(uuid,uuid,numeric,text,timestamptz,text)'),
    ('public.correct_rating_adjustment(uuid,text,text)')
  ) AS target(signature)
  LOOP
    SELECT p.*, pg_get_functiondef(p.oid) AS definition INTO f
    FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature);
    definition := f.definition;
    IF (length(definition)-length(replace(definition,old_predicate,'')))/length(old_predicate) <> 1
    THEN RAISE EXCEPTION 'WP_C9_RATING_AUTH_PATTERN_DRIFT: %',r.signature; END IF;
    -- No reconstructed/invented RPC body: exact captured source, one auth predicate.
    definition := replace(definition,old_predicate,new_predicate);
    IF r.signature LIKE 'public.record_rating_adjustment(%' THEN
      IF (length(definition)-length(replace(definition,E'or p_amount = 0 then','')))/length('or p_amount = 0 then') <> 1
      THEN RAISE EXCEPTION 'WP_C9_RATING_INPUT_PATTERN_DRIFT'; END IF;
      definition := replace(definition,'or p_amount = 0 then',
        E'or p_amount = 0\r\n       or p_amount::text IN (''NaN'',''Infinity'',''-Infinity'') then');
    END IF;
    EXECUTE definition;
    SELECT p.* INTO after_f FROM pg_proc p WHERE p.oid=f.oid;
    IF after_f.proowner IS DISTINCT FROM f.proowner
       OR after_f.proacl IS DISTINCT FROM f.proacl
       OR after_f.proconfig IS DISTINCT FROM f.proconfig
       OR after_f.prosecdef IS DISTINCT FROM f.prosecdef
    THEN RAISE EXCEPTION 'WP_C9_RATING_SECURITY_METADATA_CHANGED'; END IF;
  END LOOP;
END;
$migration$;
COMMIT;
