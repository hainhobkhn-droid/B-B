# WP-C9 — Capability Surfaces — 2026-10-07

## 1. Baseline and scope

Preparation against `fcd317b1ed1468288029168a986d9d635f05861a`; main equals origin/main. Tracked tree clean before work; eight unrelated untracked entries preserved. No stage/commit/push/deploy, production business mutation, migration, Edge deploy or capability model change.

Authoritative UI: docs/PICK-UI-SYSTEM-V2.md. Read project state, frontend authorization audit, V2 reconciliation, WP-C2/C5/C7/C8 reports, AGENTS.md and current app/Account/Player/Match/Fund/index source. Production catalog takes precedence over older audits. V2 §§4,22,23,29,30 require backend authority and parity; §§13,14,25–28,35 govern shared accordion/notice semantics. No generic helpers or backend workflows are refactored here.

## 2. Production verification

Existing authenticated Supabase Dashboard session: B&B PICK, project `bflwaqlvnesuqoyikxar`, main Production. Only catalog SELECT statements in `BEGIN TRANSACTION READ ONLY ... ROLLBACK`. No audit business records or auth credentials exported, no business RPC called.

Catalog capture: `2026-10-07T08:30:04.211479+00:00`; capability inventory: `2026-10-07T08:32:00.345732+00:00`. SQL Editor query evidence: https://supabase.com/dashboard/project/bflwaqlvnesuqoyikxar/sql/47d6e792-a67a-4b82-bffa-b50a6422a92c . The editor may retain private query metadata; this is not production DB/business mutation. CSV download did not return a usable artifact; no source-export file is claimed saved.

Read exact pg_get_functiondef, ACL, fixed search_path and signature for Rating functions, and selected Player/Match/Fund/Tournament contracts. Inventory inspected all public functions for capability references, audit readers and views. A failed catalog SELECT caused by editor concatenation was corrected by replacing the entire editor content; it performed no mutation.

| Exact Rating function | Definition MD5 | authenticated EXECUTE | Authority |
|---|---|---|---|
| record_rating_adjustment_active(uuid,uuid,numeric,text,timestamptz) | 511cead28025ae378827a9e18c4ce5c5 | yes | business gate, delegates to record_rating_adjustment |
| record_rating_adjustment(uuid,uuid,numeric,text,timestamptz,text) | 95d1c581b2c2520d1b472b5533292506 | no; postgres/service_role only | auth.uid + active ADMIN only |
| correct_rating_adjustment_active(uuid,text) | 6121a66c5b4b9933f6e7e7e498d5bf82 | yes | business gate, delegates to correct_rating_adjustment |
| correct_rating_adjustment(uuid,text,text) | 2d0ddc783093cc1cfa138cbe8032ab5f | no; postgres/service_role only | auth.uid + active ADMIN only |

All four SECURITY DEFINER, fixed `public, pg_temp`. Neither delegated mutation checks can_adjust_rating. EXECUTE on the wrapper is not business authorization. The nested ADMIN check rejects a delegated caller before input/ledger mutation. Denial is VERIFIED CURRENT from exact production source, not a live MEMBER Auth test.

## 3. Full capability matrix BEFORE editing

Every management action also requires authenticated active APPROVED/password-complete business access. Frontend hasCapability mirrors active profile + ADMIN/flag; render/bootstrap handles membership/password gates before mounting pages. Visibility is never the server authority.

Legend: A actionable; R read-only; H hidden. Delegated means exact flag unless BOTH stated. Normal MEMBER retains ordinary read/personal workflows, not the management action. “Aligned” below means gate/source agreement for existing consumer, not exhaustive live role/browser parity or every backend operation exposed in UI.

| Capability | Backend checker / RPC/read model | Frontend helper / surface | ADMIN | Delegated | Normal MEMBER | Denial evidence / current status |
|---|---|---|---|---|---|---|
| can_collect_tournament_fee | active ADMIN or flag; create_tournament_payment, refund_tournament_payment; management registrations/payments/finance readers also allow tournament managers | canCollectTournamentFee; Tournament payment CTA, loader and Overview | A | A payment, R shared finance; no manage-only actions | H payment; personal registration R/A | PERM01B2 exact flag checks; production inventory corroborates. Aligned action gates; collector-only Overview hint overstates management |
| can_approve_matches | active ADMIN or flag; approve_match via approve_match_active, reject_pending_match, void_match via void_match_active, replacement; get_match_management_matches/players | canApproveMatches; shared Match center, loader/Overview | A | A same shared center | H management; personal confirmation/create remains | PERM01B1 and exact production get_match_management_players -> MATCH_APPROVAL_PERMISSION_REQUIRED. Aligned; edit/resubmit non-atomic debt unchanged |
| can_manage_tournaments | active ADMIN or flag; create/update/status/registration/expense/reversal/settlement; management readers | canManageTournaments; Tournament management/shared loader/Overview | A | A existing management forms | H management; own registration remains | PERM01B2 + production inventory; finance reader rejects absent BOTH alternatives. Existing gates aligned; expense/refund/settlement RPCs have no main frontend consumer (backend-only/unexposed) |
| can_manage_fund | active ADMIN or flag; campaign/expense/cancel, raw ledger reader; balances/obligation/payment readers also allow collectors; admin_create_fund_rule_version allows this flag | canManageFund; Fund campaigns/expense/ledger/report, loader/Overview; rule-version form in ADMIN Account config | A | A Fund management, H rule config; no collect-only CTA | H management; transparency/personal reads remain | PERM01B3/FUND04 checks + catalog. Core aligned; rule-version frontend narrower than backend, OPEN ISSUE |
| can_manage_members | promotion requires ADMIN OR BOTH this flag + can_manage_players; candidates/preview/mutation | canManageMembers AND canManagePlayers; Player promotion; Account permission display/editor | A | A promotion only with BOTH; sole flag does not unlock Player or ADMIN Account management | H promotion/Account management | PLAYER-PERMISSION01C/WP-C2 + production inventory. Aligned limited conjunction; standalone member-management UX unspecified by current backend |
| can_manage_players | active ADMIN or flag; create_player/update_player; management directory allows this OR lifecycle; promotion BOTH | canManagePlayers; Player create/edit/shared directory, promotion AND | A | A create/edit; promotion only with member flag | H management, R directory | PLAYER-PERMISSION01C/D + source/local negative fixtures. Aligned; never lifecycle/initial/hard-delete proxy |
| can_manage_player_lifecycle | active ADMIN or flag; get_player_lifecycle_preview/set_player_lifecycle_status; management directory OR player flag | canManagePlayerLifecycle; lifecycle accordion/directory | A | A status/preview only | H management | exact production preview -> PLAYER_LIFECYCLE_PERMISSION_REQUIRED; hard-delete -> ADMIN_REQUIRED. Aligned |
| can_adjust_rating | only stored/listed/reset in permission/IAM functions; manual adjustment/correction currently active ADMIN-only; initial correction separately ADMIN-only | canAdjustRating; Overview promises delegated Rating action; unused ctx property passed to Players; Account labels | A initial; no manual UI | shortcut but no action | H management | exact production four Rating definitions. Missing delegated backend contract/dead operational capability; OPEN ISSUE |
| can_collect_fund | active ADMIN or flag; record_fund_payment/record_member_fund_payment/refund; balances/management payments/contributions allow collector OR manager | canCollectFund; collection form/batch, loader, Overview/history | A | A collection, R balances/payments; H raw ledger | H collection; personal/transparency reads remain | PERM01B3/FUND04 exact ACL + local regression; raw ledger manager-only. Aligned, NET/no gross fallback unchanged |
| can_view_audit | stored/listed/reset only; no approved Audit RPC/view; authenticated has no audit_logs SELECT; no audit_logs RLS policies | canViewAudit unused helper; Account capability editor/self-summary, no route/loader | no browsing UI | no browsing UI | H audit | production catalog privileges/readers. Missing backend read model + missing UI, OPEN ISSUE; not intentionally backend-only |

## 4. Rating integrity / authoritative decision

VERIFIED CURRENT: initial correction `set_player_initial_rating_before_history(uuid,numeric,text)` is ADMIN-only, business-gated and locks Rating advisory key 726184501 + target Player. Its definition MD5 is `4f8a480037ef04a8e0b223739bce5652`. It is not a delegated manual adjustment API.

Manual adjustment uses a signed nonzero delta p_amount, required request_id/player/reason/effective_at/version, Player existence (INACTIVE historical adjustment allowed), advisory lock 726184501, idempotent request/payload checks, append-only rating_adjustments and full _rebuild_ratings_internal. It verifies derived rating_adjustment_events and writes RECORD_RATING_ADJUSTMENT audit. Correction appends inverse original delta at original effective date, prevents duplicate direct correction, rebuilds and writes CORRECT_RATING_ADJUSTMENT. Match-derived rating_events remain separate derived history. This is not direct current_rating editing.

No delegated adjustment UI will be added in WP-C9 preparation because the authoritative nested RPC denies delegated users. No ADMIN manual workflow added under the conditional delegated feature request either. No frontend .from(...).update(current_rating), ledger rewrite or rating formula change.

Recommendation (NOT IMPLEMENTED): decide manual adjustment vs correction delegation separately; source-sync exact production wrappers/internal definitions, add business-gated ADMIN OR exact can_adjust_rating at the agreed entry/internal boundary while keeping non-exposed internal ACL; preserve lock/idempotency/replay/audit semantics. Add finite numeric/range policy only through an explicitly reviewed backend contract (do not invent frontend min/max). Initial correction, rebuild administration and configuration remain ADMIN-only unless separately authorized. Add authoritative minimal Player/current-rating/adjustment read model as needed; do not widen existing Player management reader just because the name is Rating.

## 5. Audit integrity / authoritative decision

VERIFIED CURRENT: audit_logs columns id,user_id,action,table_name,record_id,old_data,new_data,reason,created_at. authenticated SELECT=false; policies=[]; public views referencing audit_logs=[]; no Audit-named/can_view_audit operational reader found.

Functions selecting audit_logs are player_reference_snapshot, get_member_hard_delete_snapshot, admin_hard_delete_member_public, confirm_match_by_opponent, resubmit_my_rejected_match, reject_match_by_opponent, get_my_pending_match_confirmations, update_my_rejected_pending_match, complete_member_hard_delete_auth. These are reference/recovery/eligibility/confirmation business functions, not Audit browsing contracts; do not repurpose them as readers.

No audit business row inspected, so absence of secrets in historical payloads is UNKNOWN / NEEDS SOURCE. old_data/new_data/reason can contain private account/contact/tombstone information; broad JSON rendering is unsafe. No direct table SELECT or table grants will be added.

Recommendation (NOT IMPLEMENTED): a dedicated read-only SECURITY DEFINER RPC, fixed search_path, business gate + active ADMIN OR can_view_audit, authenticated-only EXECUTE, bounded server pagination/order (created_at DESC,id DESC), allowlisted date/action/entity/actor filters. Return only approved timestamp/actor display/action/entity/concise structured summary fields. Build a separately reviewed per-event redaction allowlist; exclude credentials/tokens/auth metadata/free technical payloads and do not return raw old/new JSON by default. Schema fields alone do not establish a safe projection. Implement shared read-only Audit components only after backend/source/privacy tests PASS; no mutation controls.

## 6. Navigation and preserved authorization

All eight existing nav destinations are ordinary personal/transparency/browse pages. Account label changes to Tài khoản for non-ADMIN and admin() returns through the self path before ADMIN workspaces. Normal MEMBER has no empty admin shell. Do not hide ordinary Player/Ranking/Fund/Tournament browsing just because management flags are absent. No Audit nav shell added while no reader exists.

Player create/edit=player flag; lifecycle=lifecycle flag; promotion=BOTH; initial correction/hard delete=ADMIN. Account lifecycle/approval/permissions/config=ADMIN frontend. Fund collector-only never loads raw ledger. Tournament management and fee CTA gates independent. Business gate and backend enforcement unchanged. RATING-SCOPE01 deployed backend fix and missing final MEMBER browser smoke remain as recorded; WP-C9 is not a replacement security fix. admin-confirm-user remains deployed but missing repository source.

## 7. Pre-edit decisions

Safe presentation-only corrections: remove can_adjust_rating-only management shortcut and delegated Rating promise from Overview; describe Player management as Player management. Tournament collector-only hint must describe collection, not management. Explain stored-but-unavailable Rating/Audit capabilities in Account self-summary and ADMIN permission panel without removing fields, disabling grants or changing role/capability semantics.

Do not expose manual Rating or Audit forms. Do not add Fund-rule config to delegated UI: this newly confirmed narrower frontend surface needs a specific backend/UX scope decision. Core UI work may proceed only within these presentation corrections. Backup before source patch: local mirror wp-c9-backup-20261007 with SHA-256 manifest.

## 8. Historical gate before WP-C9A (superseded)

**BLOCKED for completing WP-C9 Rating/Audit capability surfaces.** Exact blockers: delegated manual Rating authorization/read contract absent; safe Audit read model absent; delegated Fund-rule version creation hidden by ADMIN-only frontend config and unresolved UX scope. Catalog/source evidence is not live authenticated delegated browser evidence. No production mutation or workaround accounts/privileges.

Frontend mitigation/tests will be recorded below; their PASS must not be converted into a backend feature or package-deployment PASS.

## 9. Historical presentation preparation (superseded)

Changed files: app.js, account.js, this report, supabase/tests/wp-c9-capability-surfaces-ui-test.cjs. Only presentation corrections described in section 7 were implemented. No backend, RPC, capability field, authorization semantics, navigation destination or production business data changed. Backup retained outside repo in local mirror wp-c9-backup-20261007.

Local frontend regression: all 19/19 CJS suites PASS, including WP-C9 actual helper/Overview/Account/Player entry fixtures for all ten single capabilities, mixed flags, normal and inactive profiles, and ADMIN-only destructive/initial Rating boundaries. These fixtures are not live authenticated delegated/normal MEMBER sessions. 25 JS/CJS syntax checks and one HTML inline script PASS; 18 Python AST checks PASS. Existing backend definitions were reviewed read-only; no new backend test execution or deployment claimed.

Browser runtime: NOT VERIFIED for the modified source. localhost:8000 displayed the old Overview wording even after reload/cache disable; separate explicit-root localhost test navigation timed out. Old-source ADMIN session visibility is not WP-C9 runtime PASS. Desktop/Mobile, delegated MEMBER and normal MEMBER live smoke remain gaps. No account/credential created and no business action submitted.

Cache-bust: index.html unchanged; required before any eventual deployment after corrected-source browser verification. Package remains BLOCKED, not READY FOR PRODUCTION DEPLOY.

Final quality gates: explicit four-file UTF-8/no BOM/no U+FFFD/trailing whitespace checks PASS; git diff --check PASS; staging empty. git diff --stat (tracked) = account.js 14 insertions; app.js 8 insertions/10 deletions; total 22 insertions/10 deletions. New report and WP-C9 test are untracked and absent from tracked diff statistics.

Unrelated existing untracked entries preserved: PICK-FRONTEND-AUTH-SURFACE-AUDIT-2026-10-04.md, PICK-NEXT-CHAT-HANDOFF-2026-10-04.md, PICK-UI-V2-RECONCILIATION-2026-10-04.md, PICK-WP-C1-RATING-SCOPE01-2026-10-04.md, audit-output.txt, supabase/.temp/, supabase/migrations/202610040001_rating_scope01_member_rating_events_own_player.sql, supabase/tests/rating-scope01-local-test.py. No stage/commit/push/deploy. Production business mutation=NO.

## 10. WP-C9A preparation gate — superseded by deployment evidence below

**READY FOR PRODUCTION DEPLOY — preparation only.** Sections 8–9 describe the superseded initial blocked package, not the current implementation. Neither migration has been applied to production. No staging, commit, push, Pages deployment, Edge deployment or business-data mutation occurred.

### Production read-only evidence

B&B PICK project bflwaqlvnesuqoyikxar, main Production; catalog inspected with BEGIN TRANSACTION READ ONLY / SELECT / ROLLBACK. Full function definitions copied from SQL Editor catalog JSON, no business rows. Historical function CSV was reused only where raw pg_get_functiondef MD5 exactly matched live catalog. Source fixture: supabase/tests/wp-c9-production-rating-baseline.json. CSV export download timed out; no downloaded-export evidence is claimed.

| Definition | Production MD5 |
|---|---|
| record_rating_adjustment(uuid,uuid,numeric,text,timestamptz,text) | 95d1c581b2c2520d1b472b5533292506 |
| record_rating_adjustment_active(uuid,uuid,numeric,text,timestamptz) | 511cead28025ae378827a9e18c4ce5c5 |
| correct_rating_adjustment(uuid,text,text) | 2d0ddc783093cc1cfa138cbe8032ab5f |
| correct_rating_adjustment_active(uuid,text) | 6121a66c5b4b9933f6e7e7e498d5bf82 |
| _rebuild_ratings_internal(text,uuid) | b3b434e407c1828bbb6dbf2907148104 |
| current_user_business_access_active() | d5a196e9bfb9522d559e3422c6669c01 |
| set_player_initial_rating_before_history(uuid,numeric,text) | 4f8a480037ef04a8e0b223739bce5652 |
| update_player(uuid,text,text,text,text,text,date,date,text) | c4ef35bdfb01923dde0f9bb4a849a84c |
| set_player_lifecycle_status(uuid,text,text) | 3d4c99cee77a9fea190f8392e0efafcb |

Audit table catalog: nine columns id UUID, user_id UUID, action text, table_name text, record_id UUID, old_data JSONB, new_data JSONB, reason text, created_at timestamptz. Owner postgres, RLS enabled, force RLS false, no policies; authenticated has no table SELECT/INSERT/UPDATE/DELETE. Only PK index exists. get_audit_events did not exist. Sensitive historical payload contents were not inspected and remain unknown; the new reader excludes them categorically.

### Rating backend contract

202610070001_wp_c9_rating_capability.sql is a guarded one-time forward migration. It verifies all six source hashes, owner, security-definer, fixed search_path and ACL before patching the exact existing record/correct authorization predicate. Any drift raises and rolls back the migration. Active ADMIN or active MEMBER with exactly can_adjust_rating is authorized, subject to the existing approved/active/not-forced-password business gate. Authenticated execution remains through the existing *_active wrappers; internal functions and replay remain inaccessible directly. No table privilege expansion, wrapper body or engine/formula change.

Existing signed-delta, reason, effective timestamp, algorithm-version, request-id idempotency, correction-of, advisory-lock 726184501, append ledger, rebuild, projection and per-event audit contracts are preserved. Initial Rating, Player metadata/lifecycle/hard delete and account capabilities are independent. Exact-source local calls prove rating-only delegation is rejected by the Initial Rating ADMIN boundary and Player management/lifecycle boundaries.

A real pre-existing input defect was reproduced in a rolled-back isolated fixture: numeric NaN passed the zero-only check and could corrupt the projection through clamping. The migration rejects NaN/Infinity/-Infinity before insert. It does not change Rating V1.1 arithmetic. Historical ADMIN-only comments in exact source are retained; the new predicate supersedes those comments.

### Audit backend contract

202610070002_wp_c9_audit_read_model.sql asserts exact column inventory, owner/RLS/policy/table SELECT baseline, helper hash and absence of an existing RPC. Drift fails closed. New STABLE SECURITY DEFINER RPC, owner postgres, search_path public,pg_temp:

get_audit_events(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL, p_actor_id uuid DEFAULT NULL, p_action text DEFAULT NULL, p_table_name text DEFAULT NULL) RETURNS jsonb.

Requires authenticated uid, business-access gate and active ADMIN or MEMBER with can_view_audit. PUBLIC/anon execution revoked, authenticated/service_role execution granted; service-role callers still need the uid/business boundary. No raw audit table grants or RLS changes.

Returns events/page_size/offset/has_more; each event contains only id, created_at, actor_id UUID, allowlisted action, allowlisted entity_type, target_id UUID, static summary. No actor name/email/contact, reason, old_data/new_data, credentials, tokens, auth metadata or free payload. Eight recognized actions have static summaries; unknown stored action/entity values become OTHER. Filters only date range [from,to), actor UUID and allowlisted projected action/entity. Deterministic created_at DESC,id DESC; server clamp max50, UI30, max offset10000; reads page+1 without total count. Unknown filters, invalid date/limits/offset reject. Raw log data unchanged.

Residual performance consideration: production currently has only PK index; realistic large-table query plans/latency have not been tested. Bounded offset is an explicit contract, not unlimited browsing. Narrow filters are needed beyond the limit. No extra index was invented in this package.

### Frontend and local runtime

Player page uses one shared manual Rating form for ADMIN/exact capability; calls record_rating_adjustment_active with existing fields, stable request UUID on retry, finite signed delta, reason/effective timestamp. Busy and stale-session guards; backend error is visible, never direct Player Rating writes. Correction remains a backend contract; no correction UI feature added. Initial Rating remains ADMIN-only.

Account contains one shared lazy, read-only Audit Action Accordion for ADMIN/exact can_view_audit, date/actor/action/entity filters, bounded pagination, safe summaries/native metadata details, empty/loading/error/retry states, invalid-response rejection. PGRST202 reports backend unavailable. No payload fallback or Audit mutation. Overview rating shortcut now reflects the prepared delegated contract. Fund/League/search/Action Accordion implementation unchanged. Delegated Fund-rule configuration drift identified earlier remains outside WP-C9A scope.

Browser http://localhost:8010/supabase/tests/wp-c9-browser-fixture.html uses actual current shared helpers and private workflows with mock RPCs, without Supabase SDK/session. ADMIN, rating-only MEMBER, audit-only MEMBER and normal MEMBER Desktop1280/Mobile390 PASS; expanded forms, long Player name, Audit pagination/details, role isolation, Rating mock success and no horizontal overflow verified. CLI confirms served files byte-identical to working tree. This is browser fixture evidence, NOT live authenticated production/delegated E2E; actual session smoke follows backend deployment. localhost:8000 stale-source evidence was not reused.

After visual PASS, app.css/app.js/account.js/players.js tags updated to wp-c9-capability-surfaces-20261007-1. Unchanged matches.js/fund.js tags retained. Four historical C5–C8 cache assertions updated to the current asset tag; business expectations unchanged and originals backed up.

### Test evidence

- WP-C9 Rating isolated PostgreSQL: PASS exact source/ACL/hash drift abort, ADMIN/delegated/normal/business states, non-finite rejection, request idempotency, correction append, canonical ledger/events/audit, projection consistency, unrelated match numerical events preserved, actual Initial/Player/lifecycle denial. Derived replay IDs/timestamps can regenerate by existing engine contract; numerical comparison does not claim byte identity.
- WP-C9 Audit isolated PostgreSQL: PASS permission states, safe projection/unknown sanitization, malicious payload exclusion, ordered/disjoint bounded pages/filters, table privilege denial, schema/grant drift abort and raw-table hash preservation.
- ACC07B: PASS policy drift full rollback, 73 PL/pgSQL +4 SQL business inventory, five-state gate, bootstrap/service recovery preserved.
- Rating Initial, Player Permission, WP-C2 promotion backend regressions: PASS. Existing independent Fund backend engine was not changed; Fund04 UI regression PASS.
- Frontend: 20/20 CJS suites PASS including WP-C2–C8, Account/IAM/Fund/Player/Rating and two WP-C9 suites. Native browser fixtures are separate from Node tests.
- JS/CJS syntax, Python AST, WP-C9 HTML inline syntax, UTF-8/no BOM/no U+FFFD, whitespace and git diff --check: PASS. Staging empty.

Local harness uses fresh synthetic localhost PostgreSQL17 databases only. Exact source installed via server-side hex decode to avoid Windows psql transport CRLF corruption; hashes remain strict. The active-version helper is a minimal fixture conforming to the captured selection contract; it is not claimed to be production hash-identical. No live identity/password/account was created for testing.

### Files / deployment proposal

WP-C9A files: app.js, account.js, players.js, app.css, index.html; this report; migrations 202610070001_wp_c9_rating_capability.sql and 202610070002_wp_c9_audit_read_model.sql; tests wp-c9-production-rating-baseline.json, wp-c9-local-common.py, wp-c9-rating-capability-local-test.py, wp-c9-audit-read-model-local-test.py, wp-c9-capability-surfaces-ui-test.cjs, wp-c9-workflow-ui-test.cjs, wp-c9-browser-fixture.html; four cache assertions in wp-c5-information-hierarchy-ui-test.cjs, wp-c6-responsive-mobile-ui-test.cjs, wp-c7-notice-focus-ui-test.cjs, wp-c8-long-list-ui-test.cjs.

Proposed order, NOT executed: (1) revalidate live catalog hashes/ACL/schema; (2) apply Rating migration; (3) apply Audit migration; (4) verify function definitions/grants and sanitized RPC readiness/schema cache using approved identities; (5) publish reviewed frontend/cache tags; (6) real ADMIN/delegated/normal Desktop/Mobile smoke. Each guarded migration is one-time; reapply intentionally fails rather than silently overwriting drift. On failed preflight the transaction rolls back. Any later recovery requires a separately reviewed forward migration; do not rewrite applied history or raw audit rows.

Eight unrelated untracked entries listed in section 9 preserved. New test bytecode artifacts are removed before final status. Backup in local mirror wp-c9a-backup-20261007; CSS original recovered from clean HEAD after the small append, not falsely claimed as a prior copy. No production mutation. No stage/commit/push/deploy. Final reconciliation not performed.

## 11. WP-C9D historical pre-deploy recheck — 2026-10-07

Production catalog recheck PASS at Supabase SQL Editor query ee2a87f2-510b-4d08-afe7-fd37d0bbc537 (B&B PICK / main PRODUCTION). All ten captured Rating/business/Initial/Player/lifecycle definition hashes and owner/ACL/security-definer/search_path match section 10. Audit exact columns, RLS, owner and zero policies unchanged; authenticated SELECT/INSERT/UPDATE/DELETE all false; get_audit_events still absent. No catalog drift.

Read-only integrity baseline: active version V1.1; rating_events=240; rating_adjustments=0; rating_adjustment_events=0; projection mismatch=0; adjustment integrity mismatch=0. Latest projection comparison follows captured replay ordering: timestamp, MATCH before ADJUSTMENT, match_number, replay_order, event ID; numeric projection tolerance 0.0005. Baseline hashes: player projection 14ccd4ca817758c3de810cee37436e9a; rating events 9c4c8fd471f19c35721ea6c1b0d40fcc; approved matches 7a43378725de690a64ced85d3dbe0b09; adjustment/event empty hashes d41d8cd98f00b204e9800998ecf8427e. These aggregates expose no business rows and do not mutate data. Post-migration comparison NOT RUN.

Re-run WP-C9 Rating/Audit isolated backend tests PASS; all20 frontend suites PASS; 26 JS/CJS syntax, 21 Python AST, explicit new WP-C9 encoding/whitespace/JSON/HTML-inline checks PASS. Served assets remain byte-identical to current source/cache tags. Staging empty; exact 19-file WP-C9 preparation scope unchanged and eight unrelated entries preserved.

Deployment pending action-time confirmation for browser-mediated cloud access changes, per Computer Use confirmations policy. No migration applied, no post-hash, no authenticated production authorization/API smoke, no Audit production performance result, no commit/push/Pages deployment. User has authorized the deployment scope; this is the required confirmation immediately before the UI action, not a scope or implementation blocker. Current preparation remains READY FOR PRODUCTION DEPLOY; WP-C9D has not deployed. Business-data mutation=NO; production schema mutation=NO.

## 12. WP-C9D backend production deployment — 2026-10-07

Action-time approval explicitly received for the exact two reviewed migrations. Rating applied first with Success / No rows returned, verified before Audit. Audit then applied with Success / No rows returned. SQL Editor evidence URL: https://supabase.com/dashboard/project/bflwaqlvnesuqoyikxar/sql/ee2a87f2-510b-4d08-afe7-fd37d0bbc537 . No ad-hoc DDL/DML/grants/RLS, no Edge deploy, no schema-cache mutation performed.

Rating post-definition hashes match the deterministic reviewed patch of captured source: record_rating_adjustment 8e46d18334aab4af27f8cc1264178460; correct_rating_adjustment 8c738f269f2a8b7a9f8411b8043a606d. Wrappers/rebuild/business helper/Initial/Player metadata/lifecycle hashes unchanged. Owner postgres, fixed public/pg_temp search_path, definer and ACL unchanged; authenticated remains unable to execute internal Rating functions or directly UPDATE players. Non-finite guard confirmed.

Production authorization execution verified using existing ADMIN and no-cap MEMBER UUIDs, SET LOCAL ROLE authenticated and transaction-local JWT claims in BEGIN TRANSACTION READ ONLY / ROLLBACK. ADMIN manual Rating reaches required request_id input validation; no-cap MEMBER is denied by Rating authorization. Initial Rating rejects MEMBER ADMIN_REQUIRED; its exact source remains unchanged. This verifies database execution/authorization, not authentic browser JWT/session E2E. No production delegated identity with either rating or audit capability exists in the inspected business-active inventory; delegated live execution NOT RUN, local delegated matrix remains PASS. No capability/account was created or modified.

Post-Rating integrity equals section11 baseline byte-for-byte aggregate evidence: 240 Rating events, zero adjustments/events, all five hashes unchanged, projection mismatch=0 and adjustment integrity mismatch=0. No Rating write test occurred.

Audit canonical signature get_audit_events(integer,integer,timestamptz,timestamptz,uuid,text,text), one overload, STABLE SECURITY DEFINER, owner postgres, fixed public/pg_temp search_path. ACL postgres/authenticated/service_role EXECUTE; anon/PUBLIC denied. Raw pg_get_functiondef MD5 9dd6c825591f6c018fa94ee94796a86c; removing CR line-ending bytes produces 1f2511bef9a66067151653952d973a4a, exactly matching independently installed reviewed source in local PostgreSQL. SQL Editor preserved mixed line endings only; normalized definition parity verified without source/body modification. Authenticated raw audit SELECT/INSERT/UPDATE/DELETE all false; RLS true/force false/no policies unchanged.

Audit production READ ONLY verification: ADMIN read succeeds, requested limit999 clamps to50, exact seven safe keys on every returned item, first and next page disjoint; no-cap MEMBER rejects AUDIT_PERMISSION_REQUIRED. No raw reason/payload/contact field is returned. Catalog count540; two bounded pages returned without obvious delay. Performance small-data smoke PASS; large-data query-plan/load performance NOT VERIFIED. One read-only hash query had an extra-parenthesis 42601 syntax error, corrected without changing deployed functions; subsequent source hash verification PASS.

PostgREST API visibility PASS for both expected signatures: public anonymous POST to get_audit_events and record_rating_adjustment_active with read/null inputs returns401/42501 permission denied for the named function, not PGRST202; no overload ambiguity or cache error. This is API discoverability/denial evidence, not authenticated positive HTTP smoke.

Backend gate PASS for available production identities/catalog/integrity; delegated production gap explicitly NOT RUN and does not justify creating accounts. Business mutation=NO. Exactly two reviewed function/schema migrations applied. Frontend deployment evidence follows; no forced CLOSED claim.

Pre-commit scope recheck: exact19 files (9 tracked modified +10 new) verified; no unrelated path. Post-cache-bust browser fixture matrix ADMIN/rating-only/audit-only/BOTH/normal PASS at1280 and390; expanded workflows and no page overflow verified, no real session implied.

WP-C9D pre-commit gates repeated PASS:20/20 frontend; WP-C9 Rating/Audit; Rating Initial integrity/advisory concurrency; Player Permission; WP-C2 promotion; ACC07B. Syntax/AST/encoding/whitespace/cached diff check PASS. Production browser currently shows login only; no authenticated smoke/session available, no credential/account created.

## 13. WP-C9D final deployment status — 2026-10-07

**DEPLOYED / PARTIALLY VERIFIED.** Both reviewed backend migrations and frontend published; no observed implementation/production contract failure. Do not force CLOSED while authenticated runtime evidence is missing. Final Reconciliation NOT performed.

Implementation commit 1a3513ffe35fa78681ce01b151b1894909ae7cb6 (feat: enable delegated rating and audit capabilities), exactly19 reviewed files, +1159/-21. Push main -> origin/main PASS; HEAD/local origin/main/live refs/heads/main matched implementation SHA at verification. No unrelated file staged. Pages run37623208917 completed SUCCESS, matching implementation SHA: https://github.com/hainhobkhn-droid/B-B/actions/runs/37623208917 .

Production https://hainhobkhn-droid.github.io/B-B/ verified after publish. HTTP200 and exact byte/SHA256 parity against implementation Git blobs (not CRLF working-tree bytes) for index.html, app.js, account.js, players.js, app.css, matches.js and fund.js. Four changed assets use wp-c9-capability-surfaces-20261007-1; unchanged matches/fund tags preserved. Browser DOM confirms all four tags after reload; production shows login, no captured console error. No authenticated ADMIN/delegated/normal session exists in this browser context; runtime smoke NOT RUN, no credential/account created.

Asset SHA256:
- index.html: 47e68d6ef8db9f29cb8f2a1ff3ec15acb5c6f5378cf427121160ec95944a6972
- app.js: bfe6526820c7ac8739be67042c4384366a7a8a8c77d1bfbb6e50f7c83246027d
- account.js: 725e58e93c9a5091dc80b1a124a5e90ba844377ac279b0d831e240c35f598a35
- players.js: 8b91dd83f5871c85f46474e607b43ca8c7b8f0baf2d21fd778734aa2cf16c872
- app.css: 5d6cafe7b483bc09dea1874dda0f9a2cd04de4e1e045f8717cbcf07d732e6c83
- matches.js: 48ce887b92eebdb213cfc32873562e606f75533d50dbf0b06ab19f7fbfda3bab
- fund.js: b4479b26ba8d29e9f3449b3c94a7679c8ec65eda4eb20dd071009d0683e3fd05

Security evidence split: production SQL authenticated-role/transaction-local JWT authorization checks PASS ADMIN and normal/no-cap denial; this is not verified browser token/session behavior. Delegated Rating/Audit production identity absent, NOT RUN; exact-capability local backend/frontend matrices and browser fixtures PASS. Initial Rating exact ADMIN source unchanged and no-cap direct-call denial PASS; delegated Initial denial covered locally, not claimed live. No raw Audit grant expansion. Schema cache/API signature visibility PASS via named-function anonymous denial, authenticated positive REST runtime NOT RUN.

Audit bounded small-data read smoke PASS (540 catalog rows; cap50 and two disjoint pages); large-data performance NOT VERIFIED. No aggressive production benchmark. Rating projection mismatch remains0 and all pre/post Rating aggregate hashes/counts identical. Both schema migrations were executed through SQL Editor; no extra migration-history registration SQL was applied and automated migration bookkeeping parity was not verified.

Residual verification: authenticated ADMIN Rating/Audit browser read/render, delegated exact-capability browser/real JWT positive calls when a suitable approved identity exists, normal MEMBER live browser, authenticated positive PostgREST readiness, large-data Audit query plans/performance, migration bookkeeping convention verification. Do not create accounts/capabilities or perform business writes just to fill these gaps. Other previously recorded workstream issues are unchanged; no Final Reconciliation conducted.

Production business-data mutation=NO. Production schema/function mutation=exactly the two reviewed migrations. No ad-hoc grants/RLS/Edge mutation. All20 frontend suites, Rating/Audit backend/security, Rating Initial integrity/concurrency, Player permission, WP-C2 promotion, ACC07B and applicable WP-C2–C8 frontend regressions PASS. Syntax/AST/UTF8/noBOM/no U+FFFD/whitespace/cached diff checks PASS. Local test database stopped. Eight unrelated untracked entries preserved. This deployment-evidence update is eligible only for a separate report-only documentation commit.
