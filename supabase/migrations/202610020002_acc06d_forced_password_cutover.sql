-- ACC06D PHASE B: explicit security cutover AFTER Edge/frontend verification.
-- Never apply together with Phase A in an unattended all-pending migration run.
BEGIN;
REVOKE ALL ON FUNCTION public.complete_my_password_change() FROM PUBLIC, anon, authenticated, service_role;

-- Defense in depth against direct profile writes and legacy SECURITY DEFINER RPCs.
CREATE OR REPLACE FUNCTION public.guard_forced_password_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.must_change_password IS TRUE AND NEW.must_change_password IS DISTINCT FROM TRUE
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'TRUSTED_PASSWORD_COMPLETION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_forced_password_completion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER acc06b_guard_forced_password_completion
BEFORE UPDATE OF must_change_password ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_forced_password_completion();

COMMIT;
