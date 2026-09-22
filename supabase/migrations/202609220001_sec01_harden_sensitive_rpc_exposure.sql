-- =========================================================
-- SEC01A - HARDEN SENSITIVE RPC EXPOSURE
-- =========================================================
-- Scope:
--   1. complete_my_password_change()
--   2. promote_guest_player_to_member(uuid, uuid)
--   3. update_pending_match(...)
--
-- No business logic changes.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Harden search_path for password-change completion RPC.
--    auth.uid() is already schema-qualified inside function.
-- ---------------------------------------------------------

alter function public.complete_my_password_change()
    set search_path = public, pg_temp;


-- ---------------------------------------------------------
-- 2. Remove anonymous/PUBLIC execution from sensitive RPCs.
-- ---------------------------------------------------------

revoke all on function
    public.complete_my_password_change()
from public;

revoke all on function
    public.complete_my_password_change()
from anon;

grant execute on function
    public.complete_my_password_change()
to authenticated;


revoke all on function
    public.promote_guest_player_to_member(uuid, uuid)
from public;

revoke all on function
    public.promote_guest_player_to_member(uuid, uuid)
from anon;

grant execute on function
    public.promote_guest_player_to_member(uuid, uuid)
to authenticated;


revoke all on function
    public.update_pending_match(
        uuid,
        timestamp with time zone,
        integer,
        text,
        text,
        integer,
        integer,
        uuid,
        uuid,
        text
    )
from public;

revoke all on function
    public.update_pending_match(
        uuid,
        timestamp with time zone,
        integer,
        text,
        text,
        integer,
        integer,
        uuid,
        uuid,
        text
    )
from anon;

grant execute on function
    public.update_pending_match(
        uuid,
        timestamp with time zone,
        integer,
        text,
        text,
        integer,
        integer,
        uuid,
        uuid,
        text
    )
to authenticated;
