# ACC06D — Forced password rollout

Status: source/local rollout gate only. No commit, push, deploy or production mutation performed.
This document supersedes the unsplit rollout instructions in ACC06B review.

## Evidence and scope

202610020001_acc06b_forced_password_completion.sql was untracked, absent from git log --all for that path, created locally in ACC06B. Prior session explicitly performed no deploy. Under the user's explicit local/untracked exception it was split before commit. This is session/repository evidence, NOT an independent production migration-ledger query. If any external deployment is discovered, STOP: do not replace deployed history; obtain its ledger/definition and prepare a forward-only plan without re-enabling a revoked unsafe path.

Backups are outside repo in the task workspace acc06d-backup. No app.js logic, Account workspace, signup/lifecycle, nickname, Fund/rating/tournament/hard-delete changes in ACC06D.

## Phase A: compatibility

202610020001_acc06b_forced_password_completion.sql now creates only:
- complete_forced_password_change_internal(uuid): unchanged completion/audit/idempotency contract.
- get_forced_password_change_readiness_internal(uuid): STABLE SECURITY DEFINER, fixed search_path, service_role only.

Both revoke PUBLIC/anon/authenticated EXECUTE; retain owner privileges and service_role EXECUTE. Runtime auth.role() must be service_role. Legacy definition and ACL are untouched. No guard is attached in A. Old frontend remains functional, including the previously identified insecure legacy completion. This exposure is not fixed until B: keep compatibility interval bounded and supervised; do not label Phase A fully hardened.

Readiness validates target exists, is_active=true, flag is non-null boolean; true is forced flow, false supports recovery/retry. It checks completion function existence/signature, service_role schema USAGE/EXECUTE, SECURITY DEFINER, jsonb return and fixed search_path via catalog. Returns {ready:true,contract:'ACC06D_V1',profile_id,must_change_password} or {ready:false}. It does not invoke completion, read credentials, update profile or write audit.

## Phase B: security cutover

202610020002_acc06d_forced_password_cutover.sql contains the old revoke and guard. Only after new Edge and frontend are verified. Legacy no longer callable by PUBLIC/anon/authenticated/service_role. Guard blocks true->false/NULL under non-service JWT, even through a legacy definer function. Existing new completion path remains service-only.

IMPORTANT: two pending migration files do NOT enforce a deployment pause. Do not run an unattended command that applies all pending migrations. The operator must use a reviewed version-targeted migration procedure and verify the migration ledger at each phase. A generic all-pending db push would eliminate the compatibility interval and is forbidden for this rollout. Deployment automation/GitHub Pages settings are not present in this repository; verify the actual target/branch/build process before execution.

## Edge preflight

POST change-my-password with verified bearer user JWT:
1. Validate JWT through Auth.getUser.
2. Validate request shape; never accept target/proof fields.
3. Call readiness as service_role for verified user id.
4. Error/missing RPC/NOT READY/malformed contract/mismatched id => PASSWORD_BACKEND_NOT_READY, HTTP 503, zero Auth mutation.
5. For normal {password,nonce?}, invoke supported user Auth PUT with user JWT.
6. Confirm Auth user id matches verified caller.
7. Internal completion, then confirmed success response.

Self-only health request: {"mode":"preflight"}. Requires the same JWT verification; returns only {"ready":true} or generic error. Password/nonce/target fields are rejected in this mode. Never use a production password or completion RPC for a health check. OPTIONS is liveness/CORS only, not readiness. No public schema/grant detail endpoint.

Readiness checks a point-in-time catalog contract, not all future DB behavior: concurrent DDL/deactivation, audit/table failure and PostgREST cache inconsistencies can still cause failure after Auth. It cannot prove the completion body has not been maliciously replaced; deployment source/catalog verification remains required. Missing readiness RPC itself fails before Auth. No dry-run completion on a real profile.

## Exact rollout sequence (not executed)

PHASE A
1. Deploy ONLY Phase A after confirming baseline/ledger and backing up existing definitions. Do not apply B.
2. Verify read-only catalogs/grants, function definitions, guard ABSENT, legacy ACL unchanged. Check migration ledger. See queries below.
3. Deploy change-my-password Edge with correct project secrets and JWT gateway configuration.
4. Using an existing authenticated active test identity, invoke self preflight mode without password. Require ready=true; verify no profile/audit changes. This only reads production if separately authorized; no calls performed in this package.
5. Run isolated Supabase Auth E2E: forced + recovery, password policy/reauthentication, inactive, missing dependency, partial failure/retry. Do not use real user passwords.

CUTOVER
6. Publish frontend with index.html app.js?v=acc06d-20261002-1. Coordinate cutover and ask users to finish password operations/reload. The compatibility interval remains security exposure until B.
7. Verify the actual production HTML references that version and delivered JS contains changeMyPassword calling change-my-password. A deployment job success alone is insufficient. Check fresh load and cached/reload behavior.
8. Controlled smoke with an explicitly designated test account. Password-changing smoke is isolated/staging unless separately authorized for a production test account. No real user password test. Require preflight, Auth success, one completion audit, reload unlocked.
9. Deploy ONLY Phase B at the supervised security cutover. Do not indefinitely defer B because an old tab might exist.
10. Verify final grants, enabled guard and migration ledger read-only; retain new secure path readiness.
11. Tell stale tabs to reload to the new build. Old tabs after B may change Auth password then fail legacy completion; reload and choose a DIFFERENT new password to complete via Edge. If session expires, use the last successfully changed password or recovery link. Never regrant legacy or disable guard to restore old-tab compatibility.

This is bounded coexistence plus intentional stale-client cutoff, not zero downtime for old tabs. A new asset URL makes a new HTML load request a distinct JS URL; stale HTML/in-memory JS may still persist. No automatic old-tab replacement or service worker is introduced. Do not claim all reloads receive new HTML until hosting/cache verification passes.

## Read-only checks (run only with authorized catalog access)

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('202610020001','202610020002') ORDER BY version;
SELECT p.oid::regprocedure, p.prosecdef, p.provolatile, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('complete_my_password_change','complete_forced_password_change_internal',
  'get_forced_password_change_readiness_internal','guard_forced_password_completion');
SELECT r.role_name, p.oid::regprocedure,
       has_function_privilege(r.role_name,p.oid,'EXECUTE') AS can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
WHERE n.nspname='public' AND p.proname IN
 ('complete_my_password_change','complete_forced_password_change_internal',
  'get_forced_password_change_readiness_internal');
SELECT tgname,tgenabled,pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid='public.profiles'::regclass
AND tgname='acc06b_guard_forced_password_completion';
```

Phase A: internal/readiness deny anon/authenticated, allow service_role; legacy matches captured baseline; no guard. Phase B: same internal ACL, legacy denies all three; guard enabled. Inspect proacl for PUBLIC and any custom role grants/inheritance, not only the three listed roles. Never assume production matches synthetic fixture.

## Abort and recovery

- Stop before rewrite/deploy if ledger contradicts undeployed evidence.
- Stop before Edge exposure/new frontend if catalog/grant/readiness is not ready.
- Stop before B if production assets, secure flow, isolated E2E or planned smoke fail. Keep compatibility period short and supervised; unresolved failures require an explicit maintenance decision, not an indefinite insecure grace period.
- After B: fix forward, keep legacy blocked. Stale clients reload; partial completion retries with a different password. Same-password errors are not proof. If completion committed but response was lost, reload reads false and unlocks.
- Auth failure => no completion. Auth success + completion failure => PASSWORD_COMPLETION_PENDING; completion transaction rolls back flag/audit together on DB failure. Unexpected timeout may mean commit happened; never assert false until confirmed/read back.
- Backend may become unavailable after preflight; existing recovery contract applies. No attempt to clear before Auth or accept frontend proof.

## Automated matrix and verification

A old FE + old DB: legacy completion fixture works (known insecurity).
B old FE + Phase A: legacy completion fixture works; no guard, ACL retained.
C new Edge + Phase A: preflight/Auth/completion order passes offline; real Phase A catalog/RPC verified locally.
D new FE + missing Edge: fails closed in actual frontend helper fixture.
E new Edge + missing readiness: generic NOT READY, Auth endpoint not called.
F new FE + Edge + Phase A: actual form/Edge mocked transport success; reload/remount fixture unlocks.
G Phase B: old/internal client calls denied, table/legacy-definer bypass blocked; new readiness/completion still work.

These combine actual Edge/frontend source mocks with disposable PostgreSQL schema; they are not a full Supabase Auth deployment. Legacy body is synthetic because production definition is missing from repo. No production proof inferred.

Tests: node supabase/tests/acc06b-password-test.cjs; python supabase/tests/acc06b-local-test.py (isolated localhost:55439). Existing ACC03/04/05/06 and IAM05D Node regressions plus syntax/UTF-8/diff checks. Live Auth, gateway configuration, PostgREST schema cache, browser old-tab/cache and production deployment remain NOT TESTED. Source gate does not authorize deployment or certify production.
