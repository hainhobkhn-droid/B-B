# IAM05D — New Member Approval

Local review: 2026-09-29. Production rollout is not yet verified.

## Audited baseline

- Application baseline: `19e4920`; preserve subsequent documentation commit `5fe207d` (PICK UI System v2).
- Read deployed `login-by-nickname`, `admin-create-member`, signup trigger/function and relevant policies through Supabase Dashboard. No production mutation was performed during audit.
- `on_auth_user_created_member_provision` provisions a CLUB/ACTIVE Player and MEMBER profile through `handle_new_member_signup()`.
- Previously both self-signup and ADMIN-created accounts became active immediately. Initial/current rating already came from validated signup metadata and active rating settings.
- ADMIN creation verifies the caller JWT and active ADMIN profile before calling Auth Admin `createUser`; the deployed version had no trusted provisioning-source metadata.
- Nickname login resolves profile ID with the service credential, obtains Auth email, then signs in with the public credential. Previously it denied inactive profiles before checking the password.
- Some authenticated business SELECT policies were unconditional. `get_player_directory()` also needed an active-membership guard. Existing active-account RPC guards alone were insufficient for waiting sessions.

## State and contracts

| Account | membership_status | is_active |
| --- | --- | --- |
| Existing account | APPROVED | Preserved exactly |
| Self-signup | PENDING | false |
| Trusted ADMIN-created MEMBER | APPROVED | true |
| Approved signup | APPROVED | true |
| Rejected signup | REJECTED | false |
| Deactivated approved MEMBER | APPROVED | false |

- New profile columns: `membership_status`, `membership_reviewed_by`, `membership_reviewed_at`.
- DB constraint forbids active PENDING/REJECTED profiles. No new state is stored in `players.status`.
- ADMIN provenance comes only from Auth `app_metadata`, supplied by the Edge Function using its verified caller ID. The trigger rechecks and locks that active ADMIN. User metadata never authorizes approval.
- `get_admin_pending_member_signups(p_limit, p_offset)`: active ADMIN only, oldest pending first, stable ID tie-break, bounded pagination, metadata from profile/Player/Auth. UI requests 25 records.
- `admin_approve_member_signup(p_profile_id)`: PENDING MEMBER only; returns success/changed/profile/status/activation/Player ID.
- `admin_reject_member_signup(p_profile_id, p_reason)`: same contract; trimmed reason of 1–1000 characters is mandatory.
- Actor is locked FOR SHARE; target FOR UPDATE. Repeated/concurrent stale decisions fail `SIGNUP_NOT_PENDING` without another audit.
- Profile transition and `APPROVE_MEMBER_SIGNUP` / `REJECT_MEMBER_SIGNUP` audit are atomic. Rejection reason remains internal.
- Internal review implementation is not executable by client roles. Public wrappers revoke PUBLIC/anon; authenticated callers must pass the internal ADMIN check.
- IAM05A reactivation requires APPROVED; IAM05B preview is unchanged. No deletion, Player update or business-history rewrite.
- Restrictive membership policies intersect existing policies on the 15 audited business tables. They do not grant new business access. Own-profile status reads remain available.
- Nickname login proves password ownership before allowing PENDING/REJECTED sessions; those sessions reach the status screen and are denied business data by DB guards. Disabled APPROVED accounts remain denied by nickname login.
- Nickname underscores are escaped in ILIKE. No explicit email response field or identifier logging is added. Auth tokens remain private credentials and may contain the owner's email as usual.
- This change does not claim constant-time nickname lookup or implement new rate limiting. Existing unknown-user timing differences remain a separate hardening concern.

## Frontend scope

- `app.js`: lazy ADMIN approval accordion, selected-record detail, green approve, collapsed red reject/reason, paging, write guards and reload. Approval invalidates lifecycle detail; older lifecycle responses are discarded.
- Lifecycle shows distinct membership labels/badges and hides reactivation for PENDING/REJECTED.
- PENDING/REJECTED stop at their own profile/status screen before business reads. Email verification and membership approval are explained separately.
- `app.css`: only scoped approval/danger/status presentation using existing tokens.
- `index.html`: app.js/app.css cache versions changed only after local visual PASS.
- Shared Action Accordion/panel/badge/notice/form-actions reused. UI follows current PICK UI System v2; ADMIN-only account approval is not delegated member management.

## Local evidence

- PostgreSQL 17: **70 checks PASS** in disposable localhost database, including both migration dry-run rollbacks, backfill, forged metadata, permissions, approval/rejection, row-lock concurrency, atomic audit failure, complete Player preservation, RLS status gating, lifecycle and unchanged IAM05B preview.
- Edge sources: **26 offline contract checks PASS**, including ADMIN provenance, password-before-status, inactive/unknown-state denial and literal underscore lookup.
- Syntax: `node --check app.js`; Edge TypeScript parsed with Node 24 `stripTypeScriptTypes` (not a Deno deployment/typecheck).
- Browser fixture uses real app.js functions/CSS, plus a full-app route with an offline SDK. CSP blocks external connections; all accounts/data are synthetic.
- Browser: lazy queue (zero initial reads), selection, approval, rejection, whitespace reason denial, queue reload, held write/double-submit, session-change stale read, and lifecycle stale-read-after-approval PASS.
- Browser: desktop 1280 and mobile 360/390/430 visual checks; long names/email wrap and no horizontal overflow. Green approval/red rejection and pending/rejected badges verified.
- Full-app fixture: PENDING/REJECTED business reads remain zero, including navigation to Matches. APPROVED loads the normal application; ADMIN accordion appears in Account on desktop/mobile. Approved fixture has no linked Player, so it does not verify populated match/fund workflows.
- Browser console had no error/warning entries in the tested fixture.
- UTF-8 without BOM, marker checks and Git whitespace checks are required before commit.

Reproduce database tests against the existing schema-export directory and a **dedicated localhost** PostgreSQL instance on port 55439:

```text
python supabase/tests/iam05d-local-test.py --schema-export <export-directory>
node supabase/tests/iam05d-edge-test.cjs
node --check app.js
python supabase/tests/iam05d-ui-fixture.py
git diff --check
```

Open `http://127.0.0.1:8765/` for interactive RPC doubles, or `/full?mode=PENDING`, `/full?mode=REJECTED`, `/full?mode=APPROVED`, `/full?mode=ADMIN` for actual app bootstrap with the offline SDK.

Fixture limitation: exported table shapes plus minimal post-export columns support these contracts; it is not a full production clone or live Supabase Auth integration test. No real signup, password or member decision was exercised in production.

## Deployment order and remaining verification

1. Preserve current deployed Edge sources and capture schema/function/policy baseline and existing activation counts.
2. Deploy `admin-create-member` first. Old signup trigger safely ignores the new app metadata; this avoids accidentally making ADMIN-created accounts pending.
3. Apply `202609280004_iam05d1_signup_membership.sql`, then `202609280005_iam05d2_member_approval.sql`. Both are transactional and intended for one-time application. D2 drops/recreates the lifecycle list signature without CASCADE, so unexpected dependencies fail safely.
4. Verify backfill counts/activation preservation, trigger attachment, constraints, policy gates, function definitions and grants. Record migration application in the normal migration history workflow.
5. Deploy `login-by-nickname`, retaining the existing gateway/JWT configuration. Do not rotate keys or change secrets as part of this milestone.
6. Only after backend readiness, publish frontend cache version `iam05d-20260929-1`. Publishing earlier would query a missing membership column. Old clients remain backend-restricted while rollout completes but do not show the new approval UI.
7. Verify production source/cache and read-only metadata, then perform the negative matrix with explicitly designated test accounts. Required: self-signup, ADMIN creation, pending/rejected login, approve/reject/repeat, inactive/delegated caller, lifecycle reactivation guard, unchanged Player/rating/history.

Production IAM05D5 remains pending until this rollout and real integration verification complete. Local PASS is not production PASS.

Recovery: stop frontend rollout if a backend step fails; retain inactive pending accounts and do not delete their profiles/Players. After D1, reverting the old provisioning/login implementation alone would change account semantics; prefer a reviewed forward repair. Do not remove membership constraints/policies or bulk-activate accounts as a rollback shortcut.
