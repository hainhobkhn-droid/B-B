# ACC06B — Forced password backend integrity

## Evidence and old flow

The body of public.complete_my_password_change() is MISSING FROM REPO. SEC01 (202609220001) sets search_path and grants authenticated execution. The production semantics (auth.uid + active profile + unconditional clear) were supplied by the user, not independently retrieved from production.

admin-create-member verifies active ADMIN, creates Auth user with must_change_password=true user metadata and trusted admin app metadata. IAM05D1 handle_new_member_signup copies the flag to profiles. Trigger attachment remains missing from repo. Frontend forced screen and recovery previously called Auth.updateUser followed by the unsafe completion RPC. Ordinary accountPassword uses Auth.updateUser and remains unchanged. load/render gate on must_change_password; a direct completion RPC bypassed this UI sequence.

## Chosen proof and trust boundary

A new authenticated self Edge change-my-password verifies the JWT via Auth.getUser, looks up that exact active profile, then calls PUT /auth/v1/user with the USER bearer token and only password/optional nonce. No admin password-update API is used. Only confirmed success with returned id equal to verified caller permits a service-role completion RPC. Reject target id and client proof fields. No passwords/tokens/raw Auth errors are logged, returned or stored in public DB/audit. Response has Cache-Control:no-store.

Supabase documents supported user password update and reauthentication:
https://supabase.com/docs/reference/javascript/auth-updateuser
https://supabase.com/docs/guides/auth/password-security
https://supabase.com/docs/guides/auth/debugging/error-codes

An auth.users trigger was not chosen: non-PK managed Auth internals may change; no password-update hook contract was established. No encrypted_password reads/writes/comparisons.
https://supabase.com/docs/guides/auth/managing-user-data

The DB completion trusts service_role, not an independently verified DB credential event. A holder of service credentials remains trusted and can bypass this boundary; service secrets must never reach clients. Frontend boolean/same_password errors are never proof. This closes the specified client completion bypass, not every business RPC's password-gate policy.

## RPC / migration

New migration: 202610020001_acc06b_forced_password_completion.sql. No historical migration changed.
- Revoke old complete_my_password_change() from PUBLIC/anon/authenticated/service_role; retain unknown body without inventing/replacing its return type.
- New complete_forced_password_change_internal(p_profile_id uuid) returns JSON {success:true,profile_id,must_change_password:false}. SECURITY DEFINER, fixed search_path. Revoke PUBLIC/anon/authenticated; grant service_role only; also require auth.role()='service_role'.
- SELECT profile FOR UPDATE, require exists+active, update true->false and audit atomically. Retry for already completed active profile is success without another audit.
- BEFORE UPDATE OF must_change_password guard blocks true->false/NULL for non-service JWT roles, including legacy definer RPCs. This protects against missing baseline table-grant/RLS source. Trusted maintenance SQL without service JWT context also cannot clear true flags; this is intentional. Other profile columns and signup insert unchanged.
- No explicit role restriction beyond active, matching provided old completion semantics. Edge never accepts another target; database service-only API necessarily accepts the verified caller id from Edge.

Audit: COMPLETE_FORCED_PASSWORD_CHANGE, user_id=profile_id, table_name=profiles, record_id=profile_id, old_data.must_change_password=true, new_data.must_change_password=false + completed_at; created_at; static reason. No credential data. Audit failure rolls back flag.

## Failure and retry

Auth failure: no completion call, flag stays true. Auth timeout/ambiguous response: no completion, flag stays true. Auth confirmed but completion/audit failure: PASSWORD_COMPLETION_PENDING (503), flag stays true unless a completion committed but its response was lost. Reload reads the actual profile; committed completion unlocks, otherwise forced screen persists.

Retry intentionally requires a DIFFERENT new password and another confirmed Auth change; same_password is an error, never a completion shortcut. This is safe retry, not transparent Auth idempotency: each successful fresh retry changes the password again. If response was lost or reload occurred, use a fresh different password. If session expired, log in using the last successfully set password or request a recovery link, then repeat. Auth/public transactions cannot be made atomic by this Edge. No durable pending receipt is created. Profile deactivation between Auth and completion safely blocks completion; credential change itself may already have happened.

Duplicate concurrent calls are serialized only at profile completion; one audit at most while flag true. Password writes themselves follow Auth ordering, not an application-level idempotency key. Repeated same password may fail; changing flag back to true in a future explicit workflow is outside scope.

## Frontend

Only forced-password and recovery callers move to shared changeMyPassword helper invoking Edge. Require success, matching profile id, false flag. Existing password/confirm/minimum length/busy controls/load/render/recovery redirect retained. Error copy explains choosing a fresh password after uncertainty. Normal Account UI and signup/approval not refactored. No CSS/index/cache-bust changes in this package. app.css and iam05d-ui-fixture.py were already dirty before ACC06B and are untouched here.

## Verification

PASS: 18 offline Edge/frontend cases executing real handler/helper/form source; Auth failed/success/unconfirmed, partial failure, new-password retry, same-password reject, missing/inactive/unauthorized, target/proof injection, mismatched identity, busy/minimum, reload/remount fixture behavior.
PASS: isolated PostgreSQL 17 migration execution, old/internal grants, direct table and legacy definer bypass rejection, missing/inactive, audit-failure rollback, idempotent audit and other profile isolation. Fixture schema/auth.role are synthetic, not production catalogs.
PASS: JS syntax, TS syntax stripping/execution, existing ACC03/ACC04/ACC05/ACC06 and IAM05D offline regressions.
NOT TESTED: live Supabase Auth PUT/security settings, actual browser desktop/mobile/recovery reload, production catalog/grants/deployment. Offline form remount is not real browser reload. No production password mutations.

Commands: node --check app.js; node supabase/tests/acc06b-password-test.cjs; python supabase/tests/acc06b-local-test.py (localhost:55439); git diff --check. UTF-8/no BOM/no U+FFFD checked for ACC06B files.

## Rollout review gates (not executed)

Review actual production old signature, auth.role/service-key context, profiles schema/grants/triggers and audit schema. Test self forced and recovery through real isolated Supabase Auth including reauthentication/password policy, expired JWT, lost responses and concurrent calls. Deploy migration/Edge/frontend as a coordinated maintenance change: old frontend fails closed once revoke is applied; new Edge must exist before new frontend is served. New Edge can exist before migration but its calls may change Auth password then fail completion, so do not expose it as an operational flow before coordinated activation. Existing cache rollout not changed. Do not rollback security by regranting unsafe RPC.

Production deployment NOT VERIFIED. No commit/push/deploy. No production SQL or credentials used.
