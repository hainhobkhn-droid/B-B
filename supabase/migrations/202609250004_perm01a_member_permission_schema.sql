-- ============================================================
-- PERM01A — MEMBER PERMISSION SCHEMA
-- ============================================================
-- Add missing fine-grained MEMBER capabilities.
--
-- Existing capability columns are intentionally preserved:
--   can_approve_matches
--   can_manage_tournaments
--   can_manage_fund
--   can_manage_members
--   can_adjust_rating
--   can_collect_tournament_fee
--
-- ADMIN is not backfilled to TRUE.
-- Backend authorization will use:
--   active ADMIN OR active MEMBER with required capability.
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS can_collect_fund boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_view_audit boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_collect_fund IS
    'Allows an active delegated member to record club fund collections. ADMIN authorization remains role-based.';

COMMENT ON COLUMN public.profiles.can_view_audit IS
    'Allows an active delegated member to access approved read-only audit views/RPCs. ADMIN authorization remains role-based.';
