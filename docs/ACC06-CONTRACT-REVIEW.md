# ACC06 — personal account and onboarding

No backend definitions were recreated. No production reads/writes/deployments.

## Source closure: BLOCKED for missing baseline

MISSING FROM REPO: update_my_member_profile body; get_signup_rating_config body; complete_my_password_change body (SEC01 only search_path/revoke/grant); admin-confirm-user Edge; production signup trigger attachment DDL; production lower(login_name) unique index; current_user_is_admin body; baseline profiles RLS/table/column grants. Trigger/index/helper/policies created inside tests are synthetic evidence only. IAM05D review records historical Dashboard baseline inspection, not current production verification.

Proposed separate source-sync package: export deployed pg_get_functiondef, trigger/index/constraint definitions, pg_policies and table/column/function effective grants, and admin-confirm-user source/config using read-only access. Compare deployment ledger; commit exact reviewed source separately. Do not invent CREATE OR REPLACE bodies or index/backfill migrations. No source-sync performed here.

## Personal profile

Existing mutation is unchanged: update_my_member_profile(p_full_name,p_phone,p_date_of_birth), expects success=true, reloads and checks returned name. Ownership, backend allowlist/validation/audit/error contract remain UNKNOWN until source-sync. No new edit fields or privileges. Presentation adds DOB/phone from loaded own Player, membership, nickname, and a read-only granted-capabilities disclosure. Role/activation/email/linkage stay read-only; no IDs shown by the new summary.

## Nickname

Own-profile select now requests login_name. Missing field means unavailable, explicit NULL/blank means unset. Existing nickname is read-only. New UI calls existing claim_my_nickname(p_nickname text) only for active APPROVED MEMBER, normalizes trim/lowercase, validates 3–32 a-z0-9._-, and handles LOGIN_NAME_TAKEN / LOGIN_NAME_ALREADY_SET. Busy/stale actor guards prevent duplicate submission; successful confirmed response locks the UI before reload.

IAM06 source: SECURITY DEFINER; auth.uid owns row FOR UPDATE; active MEMBER; nickname must be unset; lower-case conflict check; unique_violation converted to LOGIN_NAME_TAKEN; audit CLAIM_MY_NICKNAME; authenticated execute only (PUBLIC/anon revoked). Database case-insensitive unique index is MISSING FROM REPO: concurrent claims by different profiles cannot be proven unique without production index verification. Frontend never claims to enforce that DB guarantee. Existing admin_set_member_nickname and login-by-nickname unchanged.

## Signup / password / rejected

Signup config frontend requires finite min/max/default and validates initial rating. IAM05D signup trigger validates active rating settings and assigns initial=current rating. get_signup_rating_config body/grants and single-active-setting constraint remain unverified. No rating changes.

ADMIN creation sets must_change_password metadata. App load/render gates business reads/navigation before entering app; forced screen runs auth.updateUser then complete_my_password_change, requires success=true and reloads. Busy controls/minimum length remain unchanged. Completion failure stays on forced screen. Backend completion ownership/flag enforcement cannot be established from SEC01 grants alone; frontend guards are not a security proof. No password policy change.

PENDING retains separate explanation of email verification and membership approval and recheck. REJECTED explicitly says rejected, contact administrator, no resubmit; internal reason is never fetched/displayed. Existing global Logout remains available. Email-confirm admin UI/Edge caller unchanged; missing Edge is a source-sync blocker.

## Fixture limits

Offline SDK modes MEMBER_NICKNAME / MEMBER_NO_NICKNAME / PASSWORD support actual app presentation. Claim response and password completion error are doubles, not backend proof. Live Auth and production tests are NOT TESTED. ACC04 admin workspace and ACC05 deletion remain unchanged.

## Recorded verification

ACC06 nickname actual-handler tests PASS (existing read-only, missing field, role/status guards, normalization, invalid format, taken/already-set, double-submit, stale reply). ACC03/ACC04 and IAM05D/ACC05 regressions PASS. Actual full-app browser fixture at 1280 and 390: MEMBER nickname present/absent, PENDING, REJECTED, PASSWORD presentation PASS without horizontal overflow. Pending/rejected/password business reads remain zero; navigating to Matches cannot bypass forced password. Actual Auth mutation, signup submission, completion success/failure against deployed RPC, effective profiles column grants, and production unique-index guarantee remain NOT TESTED.
