# ACC07B — backend business access gate review

Status: **SOURCE/LOCAL PASS**. No commit, push, deploy or production mutation was performed.

## Production evidence

On 2026-10-02 the authenticated production Supabase Dashboard session was used for a read-only catalog query. It returned 80 `public` `SECURITY DEFINER` functions executable by `authenticated`, including exact signatures, language, volatility, configuration, ACL and `pg_get_functiondef` output.

The reviewed inventory is split as follows:

- 77 authenticated business/Account-management RPCs receive the ACC07B gate.
- `current_user_is_admin()`, `current_user_membership_active()` and `get_signup_rating_config()` remain unchanged as reviewed bootstrap/signup helpers.
- Service-role password readiness/completion and hard-delete completion are not authenticated-executable and remain outside the transformation.
- Trigger and internal functions are not widened or granted to authenticated.

The catalog query was read-only. The SQL Editor result was exported locally for review; no migration or DML was run on production.

## Architecture

Migration `202610020003_acc07b_business_access_gate.sql` creates:

```text
current_user_business_access_active()
  = auth.uid exists
  + profiles.is_active = true
  + membership_status = APPROVED
  + must_change_password IS NOT TRUE
```

The helper is `STABLE SECURITY DEFINER`, has fixed `search_path`, denies `PUBLIC`/`anon`, and grants execution to `authenticated` for restrictive RLS evaluation.

All 15 existing restrictive `iam05d_membership_gate` policies keep their mode, command and role list. Only `USING` and `WITH CHECK` move from `current_user_membership_active()` to `current_user_business_access_active()`.

The migration source-syncs the four SQL-language business functions directly from production definitions and adds the gate:

- `admin_approve_member_signup(uuid)`
- `admin_reject_member_signup(uuid,text)`
- `current_user_player_id()`
- `get_player_directory()`

For the remaining 73 reviewed PL/pgSQL functions, the forward-only migration obtains each exact target definition with `pg_get_functiondef`, verifies signature, language, `SECURITY DEFINER`, authenticated EXECUTE and fixed `search_path`, then inserts one leading guard. Existing body, role/capability checks, parameters, return contract, owner and ACL remain unchanged.

The transformation is limited by an explicit production signature inventory. A final coverage check rolls back if any authenticated `SECURITY DEFINER` function is neither gated nor one of the three reviewed exemptions. This prevents a new or unreviewed RPC from silently escaping the forced-password boundary.

## Bootstrap and recovery preservation

The following paths do not use the business gate:

- own-profile/status SELECT used during session bootstrap;
- Auth session and logout;
- `current_user_is_admin()` and existing membership bootstrap helper;
- anonymous signup rating configuration;
- service-role password readiness and completion;
- trigger/internal functions not executable by authenticated.

An `APPROVED + active + must_change_password=true` caller can therefore load enough own-account state to render the forced-password screen and complete the Edge flow, while direct business tables and authenticated business definer RPCs remain blocked.

## State matrix

| Profile state | Own profile bootstrap | Business RLS | Business definer RPC |
|---|---:|---:|---:|
| APPROVED, active, password complete | Allowed | Allowed | Allowed, then existing role/capability logic |
| APPROVED, active, password required | Allowed | Blocked | `BUSINESS_ACCESS_REQUIRED` |
| APPROVED, inactive | Allowed | Blocked | `BUSINESS_ACCESS_REQUIRED` |
| PENDING, inactive | Allowed | Blocked | `BUSINESS_ACCESS_REQUIRED` |
| REJECTED, inactive | Allowed | Blocked | `BUSINESS_ACCESS_REQUIRED` |

After service-role completion changes `must_change_password` to false, normal business access is restored without changing membership, role or capability data.

## Rating-event issue boundary

`get_member_rating_events()` receives the same forced-password gate. Its existing query body and data scope are otherwise unchanged. The production data-scope concern is recorded separately in `docs/ACC07B-RATING-EVENTS-ISSUE.md`; this migration does not attempt to fix it.

## Verification

`supabase/tests/acc07b-local-test.py` builds a disposable PostgreSQL catalog containing the 80-function inventory shape, all 15 restrictive policies, own-profile RLS and service-role password completion.

It verifies:

- 73 PL/pgSQL and four SQL business functions are gated;
- the three bootstrap/signup helpers and service-role functions are unchanged;
- the five required profile states for own profile, direct business read/write and representative definer RPC;
- readiness/completion remains service-role callable;
- clearing the forced-password flag restores access;
- policy expressions use the new helper;
- helper ACL and fixed boundary;
- controlled migration re-application;
- `get_member_rating_events()` receives only the ACC07B gate.

This is a source/local gate. Live production deployment, PostgREST cache refresh and real Auth/Edge integration remain untested in this package.
