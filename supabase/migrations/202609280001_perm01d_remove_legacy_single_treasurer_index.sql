BEGIN;

-- PERM01D production schema drift fix.
--
-- Legacy production index profiles_single_treasurer_uidx enforced that only
-- one profile in the entire system could have can_collect_tournament_fee=true.
--
-- PERM01 defines can_collect_tournament_fee as a delegable capability that may
-- be granted independently to eligible MEMBER profiles. Authorization remains
-- enforced by the relevant RPCs and active-profile capability checks.
--
-- This index is not present in repository history and conflicts with PERM01C
-- permission administration by raising SQLSTATE 23505 when a second profile is
-- granted tournament fee collection permission.

DROP INDEX IF EXISTS public.profiles_single_treasurer_uidx;

COMMIT;