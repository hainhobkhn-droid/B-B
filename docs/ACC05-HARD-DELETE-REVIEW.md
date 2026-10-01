# ACC05 — Hard-delete integrity and recovery

Scope: new migration, hard-delete Edge, minimal frontend recovery, isolated tests. No production execution.

## Confirmed causes

IAM05E counted audit actor and profile record references but omitted `table_name=players, record_id=linked player`. The new snapshot adds that exact OR predicate; the lifecycle whitelist remains scoped to the target profile. Counts stay in the existing `profile_references.audit_logs` bucket for response compatibility (they include Player audit).

## Recovery and completion

The public cleanup transaction retains the original tombstone, enriched with auth_user_id, public_cleanup_completed and initial auth_cleanup_status=PENDING. Its actor, reason, created_at and old_data retain identity and provenance. PENDING is the initial event, not mutable current status.

After Auth deletion (or confirmed absence), Edge calls service-only `complete_member_hard_delete_auth(p_profile_id uuid,p_actor_id uuid)`. It verifies active ADMIN, tombstone, absence of profile and Auth user, locks the tombstone, and appends one HARD_DELETE_MEMBER_AUTH_COMPLETED event. Repeated calls return success without another event. Completion contains tombstone_id, auth_user_id, player_id and completion timestamp; original tombstone is unchanged. Legacy IAM05E tombstones are supported.

Completion RPC errors return recovery_required with UNCONFIRMED; retry verifies Auth absence and retries completion. Auth failures return public_cleanup_completed and target UUID. UI retains target/reason, parses Supabase Functions HTTP error JSON, disables directory navigation while recovery is pending, and exposes retry without another destructive confirmation. Full completion clears detail and reloads the list. Recovery state is in-memory for the current mounted Account view; a browser reload is not durable recovery storage. Operators can retry the same Edge payload using the tombstone UUID after navigation/reload.

## Concurrency / privileges

ACC05C supersedes the broad audit lock after ACC05B reproduced a profile->audit / audit->profile deadlock. Public cleanup now acquires transaction-scoped advisory lock `hashtextextended('ACC05:member:' || profile_id::text, 0)`, then actor SHARE, target profile UPDATE, linked Player UPDATE; no explicit table-level audit lock. Actor is ADMIN and target MEMBER (disjoint roles); the actor locks are compatible between different-target deletes. Same target serializes until commit; the loser returns TARGET_MEMBER_REQUIRED and can recover through its tombstone. Hash collision can theoretically serialize unrelated targets, but cannot bypass integrity. Completion continues to serialize on its tombstone row.

Audit boundary is explicit: committed blocking audit visible to the authoritative snapshot prevents deletion. A writer that already updates/locks the target profile or Player completes before deletion obtains that row lock; its committed audit is detected on recheck at READ COMMITTED. FK-backed actor/business references serialize through row/FK locks and cannot commit a dangling reference. Pure table_name/record_id pseudo-reference inserts do NOT participate in the advisory lock: an append not visible at the final snapshot is allowed as retained historical audit, including after deletion. It is not a live entity FK; tombstone preserves deleted identity. This deliberately uses the allowed historical snapshot-boundary contract, NOT a claim that one-sided advisory locks protect audit writers. No new trigger or audit writer rewrite. Production FK completeness remains unverified.

Snapshot and completion are explicitly service_role executable, revoked from PUBLIC/anon/authenticated. RLS bypass alone does not grant function EXECUTE. Actual production effective privileges remain unverified.

## Dependency coverage: evidence and limits

Only two incoming FK declarations to profiles/players are present in production migrations:

| Reference | Evidence | Classification |
|---|---|---|
| fund_obligation_campaigns.created_by -> profiles.id, RESTRICT | 202609240001 | covered blocker |
| profiles.membership_reviewed_by -> profiles.id, SET NULL | IAM05D1 | intentionally allowed SET NULL; not cascade deletion |

Snapshot covers Player references from match_players (including partner), rating_events, rating_adjustments, rating_adjustment_events, fund_contributions/payments/transactions, tournament_registrations (including partner), tournament_payments, awards. It covers profile actors in campaigns, payments, ledger, leagues, matches (creator/opponent confirmation/rejection), rating adjustments, tournament expenses/reversals/refunds/payments/tournaments. These are source-visible references, NOT proof of their production FK definitions or complete schema coverage.

Audit user_id and profile/Player record references are historical/audit-only blockers; target-profile lifecycle actions alone retain the existing intentional whitelist. Profile->Player linkage is deliberately removed before Player. Baseline FK actions (including Auth->profile cascade claimed by old Edge comment) are MISSING FROM REPO, not newly asserted by this change. Synthetic fixture FK definitions are not production evidence.

Read-only catalog query needed to close actual dependency coverage:

```sql
SELECT conrelid::regclass AS source_table, conname,
       confrelid::regclass AS target_table, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype='f' AND confrelid IN ('public.profiles'::regclass,'public.players'::regclass)
ORDER BY 1,2;
```

Unprotected polymorphic audit references written AFTER a deletion by a stale/unrelated writer cannot be prevented globally without a wider audit-write contract; this patch does not alter all audit writers. No business audit is deleted to bypass a blocker.

## Verification

Run `node supabase/tests/acc05-edge-test.cjs`, `node supabase/tests/acc05-ui-test.cjs`, `python supabase/tests/acc05-local-test.py`. SQL runner is localhost:55439 only, creates/drops one disposable database; existing anon/authenticated/service_role roles are prerequisites. It tests actual migrations against a minimal synthetic schema, not the missing production baseline. PostgreSQL runtime/concurrency tests are NOT TESTED when that server is unavailable. Browser visual/live Auth integration remain separate from offline handler/callback tests.

Deploy backend migration before updated Edge/frontend; no deploy performed by this work package. Existing duplicate 202609280001 migration identifiers require ledger review separately.

Recorded local result (2026-10-01): 13 ACC05 Edge scenarios PASS; actual frontend callback recovery/double-submit checks PASS; 26 IAM05D offline checks PASS; JS syntax, Python AST, UTF-8/no BOM/no U+FFFD and diff whitespace PASS. SQL runner attempted but localhost refused connection: SQL runtime and PostgreSQL concurrency NOT TESTED. Browser visual and real Auth integration NOT TESTED. No commit/push/deploy.

## ACC05C runtime gate (2026-10-01)

PostgreSQL 17.11 isolated localhost fixture: old deadlock reproduction now ends with writer commit and MEMBER_HAS_REFERENCES on delete, preserving target and audit. Unrelated audit writer delay 0.079s and different-target delete delay 0.085s despite 1s held transactions (previously ~1.044s). Same-target serializes with one tombstone. Runtime migrations, actual role invocation, blockers, lifecycle whitelist, recovery/completion idempotency, injected rollback and explicit late pseudo-audit retention PASS. Runner: `python supabase/tests/acc05c-runtime-test.py`; uses the same localhost fixture prerequisites plus the unprivileged `acc05b_public_probe` role. Historic ACC05B FAIL is superseded only for these tested scenarios, not a guarantee against all possible external transaction lock orders. No UI/Edge/recovery contract changes in ACC05C.
