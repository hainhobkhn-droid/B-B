# PICK WEBAPP — WP-C2 Authoritative Promotion Read Model — 2026-10-04

## 1. Root cause

Production policy `players_select_scoped` is permissive `SELECT` for role
`authenticated` with:

```sql
current_user_is_admin() OR id = current_user_player_id()
```

The restrictive `iam05d_membership_gate` remains active in addition to that
policy. A delegated manager therefore cannot directly select arbitrary Guest
Players. The current `promoteGuestForm()` calls
`get_admin_member_promotion_candidates()` for Member targets, but loads Guest
sources with a direct paginated `.from('players')` query. Under delegated
credentials that direct query returns an authorized empty set. The UI cannot
distinguish that false-empty result from a legitimate absence of active Guests.

The global Player loader does not solve the workflow contract. A delegated
actor with `can_manage_players` receives `get_member_management_players()`, but
the promotion form performs a separate direct table read. In addition, that
management RPC returns `players.*` and is authorized for either
`can_manage_players` or `can_manage_player_lifecycle`, rather than requiring the
two promotion capabilities.

## 2. Current production contract

Read-only production catalog capture at `2026-10-04T04:12:07.174323Z`:

| Function | MD5 of `pg_get_functiondef` | Result | Security / ACL |
|---|---|---|---|
| `get_admin_member_promotion_candidates()` | `5934464fd6aec9946cc14a2e17d9a850` | Member target rows only | owner `postgres`; stable definer; fixed `public, pg_temp`; `postgres`, `authenticated` |
| `get_admin_member_promotion_preview(uuid,uuid)` | `5a29e1abaa36bb4a567bbc3fbed7c4e9` | `jsonb` | same |
| `promote_guest_player_to_member(uuid,uuid)` | `b6f24a4c4504e87c4c7af82ebe26c6bd` | `jsonb` | volatile definer; same owner/search path/ACL |
| `get_member_management_players()` | `e1522854262e69e03f7da5bb2edf9b6b` | `SETOF players` | stable definer; same owner/search path/ACL |
| `get_player_directory()` | `25c4d53b8b5567bf274794bdee3b6bce` | five-column Player directory | stable definer; `postgres`, `authenticated`, `service_role` |

The full definitions were read from production, not inferred from historical
migrations. The promotion candidate, preview and mutation functions enforce
active business access and ADMIN or both `can_manage_members` and
`can_manage_players` after PLAYER-PERMISSION01C.

The mutation locks the target Profile, temporary Player and Guest Player. It
revalidates Profile/Player type and status, uses
`player_reference_snapshot()`, rejects a linked Guest or referenced temporary
Player, preserves Guest identity/Rating/history, inactivates the temporary
Player, relinks the Profile and writes `PROMOTE_GUEST_TO_MEMBER` audit data in
the same transaction.

Production Player table access remains:

- `authenticated`: direct `SELECT` only;
- `players_select_scoped`: ADMIN or own Player;
- `iam05d_membership_gate`: restrictive business-access gate;
- no delegated management exception in direct Player RLS.

The expected columns and types were verified directly. The proposed RPC does
not yet exist in production. A read-only count found 14 structurally eligible
Member targets and 9 unlinked active Guest sources at inspection time; names or
other account details were not exported.

## 3. Existing read models evaluated

### `get_admin_member_promotion_candidates()` — PARTIAL

It has the correct BOTH-capability authorization and a minimal Member-side
projection, but returns no Guest rows. Its existing OUT signature cannot be
extended with Guest fields using a safe `CREATE OR REPLACE FUNCTION` without a
drop/recreate contract change.

### `get_member_management_players()` — not suitable

It returns all columns from `players` and is intentionally available to
`can_manage_players` or `can_manage_player_lifecycle`. Reusing it would make a
broad management dataset the promotion contract and would not enforce BOTH
required capabilities at the read-model boundary.

### `get_player_directory()` — not suitable

It provides a minimal five-column Player directory but is available to every
business-active user. Client-side filtering would leave promotion eligibility
outside the dedicated server-side boundary.

Existing read model reusable: **PARTIAL**. The Member half is reusable in
principle, but no current RPC satisfies the complete, minimal, BOTH-gated
promotion contract.

## 4. Chosen design

Add a dedicated read-only RPC:

```sql
public.get_guest_member_promotion_candidates()
```

It returns one typed rowset with `candidate_kind` equal to
`MEMBER_TARGET` or `GUEST_SOURCE`. This avoids changing any existing function
signature and lets the frontend load both groups atomically through one
authoritative call.

Returned fields are limited to:

- `candidate_kind`;
- `profile_id`, `profile_full_name` for Member targets;
- `player_id`, `player_full_name`, `player_type`, `status`, `current_rating`.

Member rows require an active MEMBER Profile linked to a CLUB / ACTIVE Player.
Guest rows require GUEST / ACTIVE and no Profile link. Reference blockers are
still evaluated by the existing preview and again by the mutation.

## 5. Security model

The RPC is `STABLE SECURITY DEFINER` with fixed
`search_path = public, pg_temp`.

It requires:

1. authenticated `auth.uid()`;
2. `current_user_business_access_active()`;
3. ADMIN role, or both `can_manage_members` and `can_manage_players`.

ACL is EXECUTE for `authenticated` only. `PUBLIC`, `anon` and `service_role`
are revoked. The migration does not add or modify table grants or policies.
Frontend visibility remains presentation only; preview and mutation remain the
final authorization and eligibility boundaries.

## 6. Backend changes

Prepared migration:

`supabase/migrations/202610040002_player_permission01_promotion_read_model.sql`

It performs fail-fast dependency and exact column/type preflight, creates the
dedicated RPC, applies least-privilege ACL and adds a contract comment. It does
not replace existing functions, alter tables, mutate rows or change RLS.

Prepared local PostgreSQL test:

`supabase/tests/player-permission01-promotion-read-model-local-test.py`

## 7. Frontend changes

`players.js` replaces the two-source `Promise.all()` and direct Player query
with one call to `get_guest_member_promotion_candidates()`. It separates the
two candidate kinds locally only for rendering. The backend already determines
which rows are eligible.

The existing generation, session, capability, busy and request-version guards
remain intact. The existing preview, confirmation, mutation, committed-state
retry prevention and partial-reload notice remain unchanged.

`index.html` changes the `players.js` asset version to
`wp-c2-promotion-read-model-20261004-1` so clients do not retain the old direct
read path after a frontend deployment.

Prepared frontend regression:

`supabase/tests/player-permission01-promotion-read-model-ui-test.cjs`

## 8. Authorization matrix

| Actor | Read candidates | Promotion UI | Preview / mutation |
|---|---:|---:|---:|
| ADMIN | PASS | visible | existing authoritative contract |
| active MEMBER with both capabilities | PASS | visible | existing authoritative contract |
| `can_manage_members` only | denied | hidden | denied |
| `can_manage_players` only | denied | hidden | denied |
| lifecycle only | denied | hidden | denied |
| normal MEMBER | denied | hidden | denied |
| inactive actor | `BUSINESS_ACCESS_REQUIRED` | unavailable after state refresh | denied |
| forced-password actor | `BUSINESS_ACCESS_REQUIRED` | unavailable after state refresh | denied |

## 9. Regression tests

Tests run directly against the authoritative working tree, preserving the two
pre-existing modified CJS fixtures:

- WP-C2 PostgreSQL authorization/data-scope: PASS;
- PLAYER-PERMISSION01 PostgreSQL: PASS;
- ACC07B PostgreSQL: PASS;
- PLAYER-LIFECYCLE01A–01D PostgreSQL: PASS, including concurrency cases;
- WP-C2 Node UI runtime: PASS;
- PLAYER-LIFECYCLE01E Node UI: PASS;
- RATING-INITIAL01C Node UI: PASS;
- `node --check` for all application modules and the new CJS test: PASS;
- Python AST for all 18 Python tests: PASS;
- changed/new files UTF-8 without BOM and U+FFFD count zero: PASS.

The WP-C2 database test also proves:

- direct delegated Player SELECT stays own-Player scoped;
- the promotion mutation definition and Player policy fingerprint are unchanged;
- linked/inactive Guest inputs remain rejected by the mutation;
- the new result contains only declared fields;
- authenticated-only RPC ACL.

## 10. UI behavior

The Action Accordion structure and order are unchanged. ADMIN and delegated
BOTH-cap users share the same workflow. Members-only, players-only and normal
MEMBER fixtures do not render the action.

Functional states are explicit:

- no Member targets: dedicated empty message;
- no Guest sources: dedicated empty message;
- permission/network/RPC error: error notice and disabled empty selectors, not
  a successful empty state;
- actor/session/generation change: current request is ignored by existing
  guards;
- successful mutation followed by partial reload: committed state prevents a
  duplicate write and the existing global notice asks for reload.

No UI polish, Action Accordion refactor or unrelated V2 change is included.

## 11. Production deployment and verification

Migration `202610040002_player_permission01_promotion_read_model.sql` was
applied to Supabase production project `bflwaqlvnesuqoyikxar` through the SQL
Editor on 2026-10-04. The exact deployed migration had SHA-256
`F633F95A14AD8D175E0CA92FD3F2E54EA3690CAD636525B211D4921F68C5DC88`.

Post-deploy read-only verification PASS:

- function owner `postgres`, `STABLE SECURITY DEFINER`, fixed
  `search_path=public, pg_temp` and exact eight-column result signature;
- EXECUTE only for `postgres` and `authenticated`; `anon` and `service_role`
  denied;
- ADMIN result contained 14 `MEMBER_TARGET` and 9 `GUEST_SOURCE` rows, with
  zero invalid rows under the declared eligibility/projection contract;
- members-only, players-only and normal MEMBER identities were rejected with
  `42501:MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED`;
- an inactive forced-password identity was rejected with
  `42501:BUSINESS_ACCESS_REQUIRED`;
- `promote_guest_player_to_member(uuid,uuid)` remained byte-identical by
  definition hash `b6f24a4c4504e87c4c7af82ebe26c6bd`;
- Player policies and table grants remained unchanged.

No production Profile, Player, promotion, audit or other business row was
mutated. The production mutation RPC was not invoked.

ADMIN browser verification against the production backend PASS at desktop and
390px: the accordion loaded the same 14 Member and 9 Guest choices, kept
preview/confirmation disabled until both selections are made, and showed no
false-empty or PostgREST schema-cache error.

## 12. Remaining verification gaps

- Production currently has no active delegated MEMBER identity with both
  `can_manage_members` and `can_manage_players`; delegated BOTH-cap live RPC and
  browser verification could not be run without changing real permissions.
  The isolated PostgreSQL and Node fixtures for this exact branch PASS.
- Capability-loss during an already-open form is covered by backend rejection
  and frontend error/runtime fixtures, but not by a live production race.

## 13. Deployment plan

1. Apply only `202610040002_player_permission01_promotion_read_model.sql`.
2. Verify function owner, definer flag, volatility, fixed search path and ACL.
3. Verify direct Player policies and grants are byte-for-byte unchanged.
4. Call the RPC as ADMIN, BOTH-cap, single-cap, normal, inactive and
   forced-password fixtures.
5. Deploy `players.js` and `index.html` together.
6. Smoke the accordion as ADMIN and delegated BOTH-cap on desktop/mobile.
7. Re-run preview and a controlled promotion fixture; verify audit and reload.

## 14. Final status

`DEPLOYED / PARTIALLY VERIFIED`

The backend read model is deployed and verified in production. The reviewed
frontend source and cache-bust are deployed through the repository's GitHub
Pages workflow. ADMIN backend behavior and desktop/mobile presentation pass,
direct Player RLS is unchanged, and no production business data mutation
occurred. The remaining gap is the absence of an existing delegated BOTH-cap
production identity/session; the exact authorization and UI path passes the
isolated regression suites.
