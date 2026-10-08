BEGIN;

-- RATING-SCOPE01
-- Base definition captured read-only from production on 2026-10-04.
-- Production pg_get_functiondef MD5 before this change:
-- b35ca37f9ec0b2a7a75c33b403cf36ef
DO $preflight$
DECLARE
    v_oid regprocedure := to_regprocedure(
        'public.get_member_rating_events()'
    );
    v_helper_oid regprocedure := to_regprocedure(
        'public.current_user_player_id()'
    );
    v_owner text;
    v_language text;
    v_security_definer boolean;
    v_config text[];
    v_definition text;
BEGIN
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'RATING_SCOPE01_FUNCTION_MISSING';
    END IF;

    SELECT
        pg_get_userbyid(proc.proowner),
        lang.lanname,
        proc.prosecdef,
        proc.proconfig,
        pg_get_functiondef(proc.oid)
    INTO
        v_owner,
        v_language,
        v_security_definer,
        v_config,
        v_definition
    FROM pg_proc proc
    JOIN pg_language lang ON lang.oid = proc.prolang
    WHERE proc.oid = v_oid;

    IF md5(v_definition) <> 'b35ca37f9ec0b2a7a75c33b403cf36ef' THEN
        RAISE EXCEPTION 'RATING_SCOPE01_PRODUCTION_SOURCE_DRIFT';
    END IF;

    IF v_owner <> 'postgres'
       OR v_language <> 'plpgsql'
       OR v_security_definer IS NOT TRUE
       OR NOT coalesce(v_config, ARRAY[]::text[])
              @> ARRAY['search_path=public, pg_temp']::text[]
       OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('public', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'RATING_SCOPE01_FUNCTION_CONTRACT_DRIFT';
    END IF;

    IF v_helper_oid IS NULL THEN
        RAISE EXCEPTION 'RATING_SCOPE01_PLAYER_HELPER_MISSING';
    END IF;

    SELECT
        pg_get_userbyid(proc.proowner),
        lang.lanname,
        proc.prosecdef,
        proc.proconfig,
        pg_get_functiondef(proc.oid)
    INTO
        v_owner,
        v_language,
        v_security_definer,
        v_config,
        v_definition
    FROM pg_proc proc
    JOIN pg_language lang ON lang.oid = proc.prolang
    WHERE proc.oid = v_helper_oid;

    IF v_owner <> 'postgres'
       OR v_language <> 'sql'
       OR v_security_definer IS NOT TRUE
       OR NOT coalesce(v_config, ARRAY[]::text[])
              @> ARRAY['search_path=public, pg_temp']::text[]
       OR position(
            'current_user_business_access_active()'
            IN v_definition
          ) = 0
       OR NOT has_function_privilege(
            'authenticated', v_helper_oid, 'EXECUTE'
          ) THEN
        RAISE EXCEPTION 'RATING_SCOPE01_PLAYER_HELPER_CONTRACT_DRIFT';
    END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.get_member_rating_events()
 RETURNS TABLE(player_id uuid, match_id uuid, algorithm_version text, rating_before numeric, rating_delta numeric, rating_after numeric, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_active = true
          and p.role = 'MEMBER'
    ) then
        raise exception 'MEMBER_REQUIRED';
    end if;

    return query
    select
        re.player_id,
        re.match_id,
        re.algorithm_version,
        re.rating_before,
        re.rating_delta,
        re.rating_after,
        re.created_at
    from public.rating_events re
    where re.player_id = public.current_user_player_id()
    order by
        re.created_at asc,
        re.id asc;
end;
$function$;

ALTER FUNCTION public.get_member_rating_events() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_member_rating_events()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_rating_events()
    TO authenticated, service_role;

COMMENT ON FUNCTION public.get_member_rating_events() IS
    'RATING-SCOPE01: authenticated active MEMBER receives Rating events only for the Player linked to the current profile; ACC07B business-access gate preserved.';

DO $postflight$
DECLARE
    v_oid regprocedure := 'public.get_member_rating_events()'::regprocedure;
    v_definition text := pg_get_functiondef(v_oid);
BEGIN
    IF position(
         'where re.player_id = public.current_user_player_id()'
         IN lower(v_definition)
       ) = 0
       OR position(
         '-- acc07b business access gate'
         IN lower(v_definition)
       ) = 0
       OR pg_get_userbyid(
            (SELECT proowner FROM pg_proc WHERE oid = v_oid)
          ) <> 'postgres'
       OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('public', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'RATING_SCOPE01_POSTFLIGHT_FAILED';
    END IF;
END;
$postflight$;

COMMIT;
