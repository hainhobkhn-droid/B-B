# ACC07B follow-up issue — `get_member_rating_events()` data scope

Status: **OPEN, intentionally outside ACC07B migration scope**.

Production inventory confirms that `public.get_member_rating_events()` is an authenticated-executable `SECURITY DEFINER` business RPC. ACC07B adds the forced-password business gate to it, so forced, inactive, pending and rejected profiles cannot call it.

ACC07B does not change its query, returned columns, Player filtering, role/capability behavior or historical Rating semantics. The previously identified data-scope concern therefore remains and requires a separate package with its own contract, production definition review and Rating regression tests.

Do not treat the ACC07B password gate as resolution of this data-scope issue.
