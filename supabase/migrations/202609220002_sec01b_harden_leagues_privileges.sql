-- =========================================================
-- SEC01B - HARDEN LEAGUES TABLE PRIVILEGES
-- =========================================================
-- Current RLS:
--   authenticated SELECT only
--
-- Goal:
--   anon          : no direct table privileges
--   authenticated : SELECT only
--
-- No RLS policy changes.
-- No business logic changes.
-- =========================================================

revoke all privileges
on table public.leagues
from anon;

revoke all privileges
on table public.leagues
from authenticated;

grant select
on table public.leagues
to authenticated;
