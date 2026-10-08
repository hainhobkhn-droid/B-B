# 1. Issue

`RATING-SCOPE01` is a verified production data-scope vulnerability in `public.get_member_rating_events()`.

Before this package, the zero-argument RPC was an authenticated-executable `SECURITY DEFINER` function with the ACC07B business-access gate and a MEMBER role check, but its final query selected every row from `public.rating_events`. A valid active MEMBER could therefore receive Rating events belonging to other Players. Filtering after the response reached the browser could not close the leak.

Root cause: the backend query had no predicate tying `rating_events.player_id` to the Player linked to `auth.uid()`.

# 2. Production source-of-truth before fix

The Supabase production SQL Editor was used on 2026-10-04 for read-only catalog queries only. No DDL or DML was executed.

The exact production `pg_get_functiondef` was captured before implementation. Its MD5 was:

```text
b35ca37f9ec0b2a7a75c33b403cf36ef
```

Verified production metadata:

| Property | Value |
|---|---|
| Signature | `public.get_member_rating_events()` |
| Owner | `postgres` |
| Language | `plpgsql` |
| Volatility | `VOLATILE` (`provolatile = v`) |
| Security | `SECURITY DEFINER` |
| Configuration | `search_path=public, pg_temp` |
| ACL | `postgres`, `authenticated`, `service_role` EXECUTE |
| `anon` EXECUTE | false |
| `PUBLIC` EXECUTE | false |
| Parameters | none |
| Return contract | `player_id`, `match_id`, `algorithm_version`, `rating_before`, `rating_delta`, `rating_after`, `created_at` |

The captured body contained:

- the ACC07B `current_user_business_access_active()` guard;
- `AUTH_REQUIRED` for a missing `auth.uid()`;
- an active `role='MEMBER'` check with `MEMBER_REQUIRED`;
- an unscoped `FROM public.rating_events re` query ordered by `created_at`, then `id`.

`public.current_user_player_id()` was also verified in production. It is owned by `postgres`, is `STABLE SECURITY DEFINER`, has the same fixed search path, calls `current_user_business_access_active()`, and resolves `profiles.player_id` for `auth.uid()` without accepting a client-selected Player.

Production `rating_events` remains RLS-enabled. Its policies are:

- restrictive `iam05d_membership_gate` for `authenticated`, command `ALL`, using `current_user_business_access_active()` in `USING` and `WITH CHECK`;
- permissive `rating_events_admin_select` for `authenticated`, command `SELECT`, using `current_user_is_admin()`.

The `authenticated` table SELECT grant therefore does not give a normal MEMBER direct access to Rating events.

# 3. Security contract

The package preserves all existing authorization layers:

1. caller must pass `current_user_business_access_active()`;
2. caller must have `auth.uid()`;
3. caller must be an active profile with `role='MEMBER'`;
4. the current Player is resolved server-side by `current_user_player_id()`;
5. only rows with `rating_events.player_id` equal to that resolved Player are returned.

The RPC remains zero-argument. A client cannot supply or choose `player_id`. A valid MEMBER without a linked Player receives an empty result because comparison with the helper's `NULL` result matches no row. There is no fallback Player.

The RPC remains MEMBER-specific. ADMIN Rating workflows are unchanged and the function was not widened into an ADMIN read API.

# 4. Implemented change

The exact production definition was source-synced into a forward-only migration. One query predicate was added:

```sql
where re.player_id = public.current_user_player_id()
```

The following were not changed:

- signature or returned columns;
- row ordering;
- ACC07B guard;
- existing `AUTH_REQUIRED` and `MEMBER_REQUIRED` behavior;
- Rating engine, calculations, events or historical data;
- direct table grants or RLS policies;
- frontend behavior.

The migration fails closed if the pre-deploy production function definition no longer has the captured MD5 or if the function/helper security contract has drifted.

# 5. Migration

New migration:

`supabase/migrations/202610040001_rating_scope01_member_rating_events_own_player.sql`

Characteristics:

- forward-only version after `202610030009`;
- does not reuse historical duplicate `202609280001`;
- transaction-wrapped;
- checks exact production definition hash before replacement;
- checks owner, language, `SECURITY DEFINER`, search path and effective grants;
- checks the authoritative Player helper contract;
- contains the complete post-fix `CREATE OR REPLACE FUNCTION` definition;
- performs postflight checks for the own-player predicate, ACC07B gate and ACL.

No historical migration was edited.

# 6. ACL / SECURITY DEFINER / search_path verification

Local disposable PostgreSQL verification passed:

- owner remains `postgres`;
- function remains `SECURITY DEFINER`;
- fixed `search_path=public, pg_temp` remains present;
- `authenticated` and `service_role` retain EXECUTE;
- `anon` and `PUBLIC` do not have EXECUTE;
- function remains zero-argument;
- direct `rating_events` RLS policies remain unchanged;
- direct MEMBER SELECT still returns no rows while ADMIN direct SELECT follows its existing policy.

The migration does not grant direct table DML or relax any RLS policy.

# 7. Regression tests

New test:

`supabase/tests/rating-scope01-local-test.py`

The test embeds the exact captured production definition and first proves that its `pg_get_functiondef` hash matches production. It then applies the migration to a disposable PostgreSQL database and verifies:

1. MEMBER A receives multiple historical rows belonging only to Player A;
2. MEMBER A receives no Player B rows;
3. MEMBER B receives only Player B rows;
4. an active MEMBER without a linked Player receives an empty set;
5. forced-password, inactive, pending and rejected profiles fail through `BUSINESS_ACCESS_REQUIRED`;
6. ADMIN remains rejected by the MEMBER-specific RPC with `MEMBER_REQUIRED`;
7. the RPC has no client `player_id` parameter;
8. direct table RLS remains ADMIN-only;
9. `SECURITY DEFINER`, search path and ACL remain correct;
10. production source drift aborts the migration and rolls back.

Existing regressions also passed:

- `acc07b-local-test.py`;
- `rating-initial01b-local-test.py`;
- `rating-initial01c-ui-test.cjs`;
- JavaScript syntax checks for `app.js` and `players.js`;
- Python AST validation for the new test.

The SQL fixture models Auth through local JWT settings and PostgreSQL roles. It proves database authorization and row scope, but it is not a substitute for a post-deploy real Supabase Auth/PostgREST session test.

# 8. Frontend impact

No frontend change is required.

`app.js` already calls the zero-argument `get_member_rating_events` RPC for non-ADMIN users and stores the returned rows in the existing Rating state. The response columns and ordering are unchanged. The same consumer therefore works with the corrected own-player result.

No Rating UI redesign, V2 UI work, Guest promotion, League loader or Accordion work was included.

# 9. Validation results

| Validation | Result |
|---|---|
| Production definition/owner/config/ACL read-only capture | PASS |
| Exact production-definition fixture hash | PASS |
| RATING-SCOPE01 local PostgreSQL matrix | PASS |
| ACC07B regression | PASS |
| RATING-INITIAL01B regression | PASS |
| RATING-INITIAL01C UI regression | PASS |
| Python AST | PASS |
| JavaScript syntax | PASS |
| UTF-8 no BOM / no U+FFFD | PASS |
| `git diff --check` | PASS at package closeout |
| Production migration apply | PASS |
| Post-deploy function/ACL/RLS verification | PASS |
| Production MEMBER A own-player scope | PASS: 19/19 own events, 0 foreign |
| Production MEMBER B own-player scope | PASS: 18/18 own events, 0 foreign |
| Production ACC07B negative identity | PASS: `BUSINESS_ACCESS_REQUIRED` |
| ADMIN frontend BXH smoke | PASS; no browser console error |
| MEMBER browser/PostgREST session smoke | NOT RUNTIME VERIFIED |

## WP-C1D production evidence

Project `bflwaqlvnesuqoyikxar` was updated through the Supabase SQL Editor by executing only the reviewed migration `202610040001_rating_scope01_member_rating_events_own_player.sql`. The full migration transaction returned `Success. No rows returned`. No migration chain, Edge Function or unrelated SQL was deployed.

The pre-deploy snapshot at `2026-10-04T03:53:13.046155Z` reconfirmed MD5 `b35ca37f9ec0b2a7a75c33b403cf36ef` and the reviewed security contract. Deployment completed before the post-deploy snapshot at `2026-10-04T03:57:27.077119Z`.

Post-deploy production evidence:

- function MD5: `f972e7f7e1117466237d80b6c64abacd`;
- zero arguments, owner `postgres`, `SECURITY DEFINER`, fixed `search_path=public, pg_temp`;
- EXECUTE remains limited to `postgres`, `authenticated` and `service_role`; `anon` and `PUBLIC` remain denied;
- body contains `where re.player_id = public.current_user_player_id()` and the ACC07B gate;
- restrictive membership policy and permissive ADMIN SELECT policy on `rating_events` are unchanged;
- MEMBER A returned exactly 19 own events and no foreign Player;
- MEMBER B returned exactly 18 own events and no foreign Player;
- a safe inactive/forced-password identity was rejected with `BUSINESS_ACCESS_REQUIRED`.

Read-only hashes and counts were identical before and after deployment:

| Projection | Before | After |
|---|---:|---:|
| `rating_events` count | 240 | 240 |
| `rating_events` hash | `06d857d0466cdc215268127ec0861b96` | same |
| Players count | 25 | 25 |
| Player Rating/status hash | `9b0705361b66ef8ac998f4ae90f121ec` | same |
| Matches count | 64 | 64 |
| Rating adjustments/events | 0 / 0 | 0 / 0 |
| Active Rating config hash | `1f73c73238dfdb72e8b76ac0ddb3072c` | same |

The current ADMIN localhost session refreshed successfully and rendered BXH without console errors. No MEMBER browser credential/session was available, so browser/PostgREST UI smoke for MEMBER remains explicitly unverified.

# 10. Remaining unknowns

- Real MEMBER browser/PostgREST sessions for two different Players have not been replayed. Production database RPC execution under the two real authenticated MEMBER identities passed, but transport/session and rendered MEMBER UI remain a residual verification gap.
- No account state was changed and no credentials were created solely to close that gap.

# 11. Deployment plan

Steps 1–7 were completed at the database/RPC boundary. The remaining closeout step is a real MEMBER browser/PostgREST smoke using existing safe sessions:

1. sign in as MEMBER A and confirm the Rating history surface renders only Player A events;
2. repeat as MEMBER B;
3. confirm no response-contract or UI error;
4. change the final status to `CLOSED / VERIFIED PRODUCTION` only after that runtime evidence passes.

No frontend deployment is required for this fix.

# 12. Rollback considerations

The migration is atomic. Any failed preflight, replacement or postflight check rolls back the whole transaction.

Reinstalling the pre-fix function would reopen the data leak and is not an acceptable routine rollback. If an unexpected production incompatibility is found, prefer a forward fix that preserves the own-player predicate. The captured pre-fix definition is retained in the test solely as source evidence and drift protection.

Because the signature and result contract do not change, expected client compatibility risk is low. No table data is mutated by the migration.

# 13. Final status

`DEPLOYED / PARTIALLY VERIFIED`

The production backend fix, catalog contract, own-player scope under two real MEMBER identities, ACC07B negative case and Rating data integrity are verified. The issue is no longer observed at the database RPC boundary. It is not marked closed because real MEMBER browser/PostgREST sessions were unavailable for the final runtime smoke.
