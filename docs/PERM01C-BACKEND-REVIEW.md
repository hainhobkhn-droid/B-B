# PERM01C — ADMIN permission-management backend

Local verification: PASS, 111 checks on PostgreSQL 17. No production deployment.
Scope ends at Phase 1. Frontend integration and the full Phase 3 regression matrix remain separate.

## Audit and existing contracts

- Repository baseline: `587e1ff`, following PERM01A `650bc7e`, match permissions `32cbbb6`, tournament permissions `7d3e548` / `06fa606`, and fund permissions `4125c58`.
- Reviewed migration inventory: all 14 files from `202609210001` through `202609250008`. The repository starts after the original schema; it is not a complete database bootstrap.
- MP01 preserves MEMBER fund self-service read paths. SEC01 hardens sensitive RPC exposure and league grants. FUND03 adds campaigns and append-only payment/refund workflows. PERM01B adds delegated management writers/read RPCs. None supplies an ADMIN capability-management RPC.
- PERM01A adds `can_collect_fund` and `can_view_audit`. The other six booleans already exist in the exported `profiles` schema. The export marks role/is_active/capabilities NOT NULL; roles are constrained to ADMIN/MEMBER.
- Cross-checked local schema exports in `pickleball-club-web/supabase`: profiles/players/audit columns and constraints, function definitions, RLS policies, and triggers. Exported profiles RLS is own-profile SELECT. No profile UPDATE policy or profile trigger appears in this export. Table ACLs are not included, so production ACL parity is not claimed.
- Audit contract: `audit_logs.user_id` references the actor profile; `record_id` is the target UUID; `old_data`/`new_data` are JSONB; action/table/reason are text. No action enum needs extending.
- Existing profile writers have narrower contracts: signup creates MEMBER with default capabilities, self-profile updates name/contact data, password completion changes `must_change_password`, player-link/promotion changes linkage. PERM01B-4 does not grant permission-management authority to `can_manage_members`.
- `app.js` still loads the current profile with only the existing tournament-collection flag. ADMIN controls use `isAdmin()`. Account creation/confirmation use Edge Functions whose implementations are absent from this repository. These are Phase 2/live-audit limitations, not new capability-management paths.
- `AGENTS.md` and `docs/PICK-UI-SYSTEM-V1.md` were read. Existing local `app.js`/`app.css` UI changes are preserved byte-for-byte. No CSS/JS edits, role changes, account/password changes, or new permissions are included.

## API contract

### `get_admin_member_permissions(p_limit integer = 100, p_offset integer = 0)`

- Requires an authenticated subject whose profile is active and role is exactly ADMIN. Capability flags cannot substitute for ADMIN.
- Returns only MEMBER rows, including inactive members, ordered by full_name (NULL last), then UUID.
- Projection: `profile_id`, `full_name`, `login_name`, `player_id`, `is_active`, and the eight capability booleans. Legacy NULL capabilities read as false. No auth.users join, email, password metadata, or wildcard profile return.
- Limit must be 1–200; offset must be nonnegative; explicit NULL inputs are rejected. Empty/out-of-range pages return zero rows. Offset pagination is deterministic for a stable dataset, not a cross-request snapshot during concurrent membership edits.

### `admin_update_member_permissions(p_profile_id uuid, p_capabilities jsonb, p_reason text)`

- Same active ADMIN requirement; actor comes only from `auth.uid()`. Takes a SHARE lock on the qualifying actor until commit to serialize actor deactivation/role changes with authorization.
- Target must exist and be MEMBER, never self or another ADMIN. A target does not need a linked Player. An inactive target may only receive false values (revocation).
- Patch must be a nonempty JSON object. Only these keys are accepted: `can_collect_tournament_fee`, `can_approve_matches`, `can_manage_tournaments`, `can_manage_fund`, `can_manage_members`, `can_adjust_rating`, `can_collect_fund`, `can_view_audit`.
- Each supplied value must be a JSON boolean. NULL, strings, numbers, unknown keys, role/IAM fields, `can_create_match`, and `can_confirm_match` are rejected.
- Reason is required, trimmed, and limited to 1,000 characters. Missing keys preserve current values under a target UPDATE row lock. Two disjoint concurrent patches do not overwrite one another; the same key follows lock/commit order.
- Only the eight columns and `updated_at` are written. No schema changes, dynamic SQL, role/active/login/link/password mutation, or policy changes.
- Changed writes atomically append `UPDATE_MEMBER_PERMISSIONS` to audit_logs with actor, target, reason, and all eight before/after values. Audit failure rolls back the update. A no-op returns `changed:false` without changing timestamp or appending a misleading audit event.
- Response: `{success:true, changed:boolean, profile_id:uuid, capabilities:object}`.
- Authorization errors use SQLSTATE `42501`; invalid input/target uses `22023`. Rejected calls do not create successful-change audit entries.

Both functions use SECURITY DEFINER and `search_path = public, pg_temp`. EXECUTE is revoked from PUBLIC and anon and granted to authenticated; the internal ADMIN check remains mandatory. No table privileges/RLS are broadened.

## Local verification

Test file: `supabase/tests/perm01c-local-test.py`.

The runner creates and drops a uniquely named database on **127.0.0.1:55439 only**. It reconstructs profiles, players, and audit_logs from local exported column/constraint definitions, applies PERM01A, reproduces own-profile SELECT RLS, and applies/reapplies PERM01C. All actors/data are synthetic. Existing production data is never used.

111 checks cover:

- Compilation/reapplication, function ACLs, fixed search_path and SECURITY DEFINER; unchanged table ACL/RLS fingerprint.
- ADMIN with all flags false; normal MEMBER; each of eight single-capability MEMBERs; all-capability manager; inactive ADMIN/MEMBER even with flags true; missing profile; absent JWT; anon with a supplied ADMIN subject.
- Safe list projection, pagination, inactive inclusion, no ADMIN rows, empty page.
- Invalid patch shape, unknown/IAM keys, nonboolean/NULL values, invalid targets and reasons.
- Individual grant/revoke for every capability, read-after-write, no-op behavior, exact audit identities and complete snapshots, preserved non-capability profile fields.
- Inactive-target revocation and blocked grants; audit-failure rollback; direct profile-write denial under the inspected own-read fixture.
- Defensive legacy NULL capability/active behavior and two concurrent real database sessions preserving disjoint patches and audit order.

Example (local PostgreSQL must already be running):

```powershell
python supabase/tests/perm01c-local-test.py --schema-export <local-schema-export-directory> --migration supabase/migrations/202609250009_perm01c_admin_permission_management.sql --schema-migration supabase/migrations/202609250004_perm01a_member_permission_schema.sql
```

Static checks: Python syntax/SQL migration execution and whitespace checks PASS. Frontend hashes and pre-existing migrations remain unchanged.

## Remaining risks / review boundary

- The exported schema is a local snapshot, not a fresh production introspection. Production owners, table grants, RLS, triggers, and Edge Function IAM guards must be compared before an authorized rollout. No claim of full production security/regression PASS is made.
- The scoped fixture does not replay every historical business migration or test matches/tournaments/fund/rating workflows. The new migration touches none of those functions. Their hostile regression matrix remains Phase 3.
- Capability grants can be stored for `can_adjust_rating` / `can_view_audit`, but this phase does not implement or widen their consumers. Sensitive account/IAM/role/system/rating-algorithm operations remain outside delegated authorization.
- No frontend work, commit, push, or deployment in this phase. Stop for user review before PERM01D.
