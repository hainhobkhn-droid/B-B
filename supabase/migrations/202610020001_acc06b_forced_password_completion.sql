-- ACC06D PHASE A: compatibility preparation; legacy RPC/grants remain untouched.
-- Split from local/untracked, never-deployed ACC06B per session evidence.
BEGIN;
-- p_profile_id is derived ONLY from Auth.getUser(token) by the trusted Edge.
-- This RPC does not itself verify Auth credentials; service_role is the trust boundary.
CREATE OR REPLACE FUNCTION public.complete_forced_password_change_internal(p_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_profile public.profiles%rowtype; v_at timestamptz := clock_timestamp();
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF v_profile.is_active IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  IF v_profile.must_change_password IS TRUE THEN
    UPDATE public.profiles SET must_change_password = false, updated_at = v_at WHERE id = p_profile_id;
    INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_data, new_data, reason, created_at)
    VALUES(p_profile_id, 'COMPLETE_FORCED_PASSWORD_CHANGE', 'profiles', p_profile_id,
      jsonb_build_object('must_change_password', true),
      jsonb_build_object('must_change_password', false, 'completed_at', v_at),
      'ACC06B_AUTH_PASSWORD_UPDATE_CONFIRMED', v_at);
  END IF;
  RETURN jsonb_build_object('success', true, 'profile_id', p_profile_id, 'must_change_password', false);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_forced_password_change_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_forced_password_change_internal(uuid) TO service_role;

-- Read-only readiness: no completion call, credential access, writes or audit.
-- false flag is valid for recovery/retry; NULL is not a confirmed state.
CREATE OR REPLACE FUNCTION public.get_forced_password_change_readiness_internal(p_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_profile public.profiles%rowtype; v_completion oid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND OR v_profile.is_active IS DISTINCT FROM TRUE
     OR v_profile.must_change_password IS NULL THEN
    RETURN jsonb_build_object('ready', false);
  END IF;
  v_completion := to_regprocedure('public.complete_forced_password_change_internal(uuid)');
  IF v_completion IS NULL THEN RETURN jsonb_build_object('ready', false); END IF;
  IF NOT has_schema_privilege('service_role', 'public', 'USAGE')
     OR NOT has_function_privilege('service_role', v_completion, 'EXECUTE') THEN
    RETURN jsonb_build_object('ready', false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = v_completion
    AND prosecdef AND prorettype = 'jsonb'::regtype
    AND proconfig @> ARRAY['search_path=public, pg_temp']) THEN
    RETURN jsonb_build_object('ready', false);
  END IF;
  RETURN jsonb_build_object('ready', true, 'contract', 'ACC06D_V1',
    'profile_id', p_profile_id, 'must_change_password', v_profile.must_change_password);
END;
$$;
REVOKE ALL ON FUNCTION public.get_forced_password_change_readiness_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_forced_password_change_readiness_internal(uuid) TO service_role;
COMMIT;
