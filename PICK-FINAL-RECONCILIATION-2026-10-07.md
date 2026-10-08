# PICK Final Reconciliation / Closeout — FINAL-D baseline lock

Requested filename date 2026-10-07; actual audit performed 2026-10-08 Asia/Bangkok. This does not backdate evidence.

# 1. Scope

Read all required Oct4 project/WP-A/WP-B/V2/AGENTS and C1–C9 reports. Current source and production catalog take precedence over historical statements. No app refactor, formula/calibration change, staging, commit, push, deploy, migration repair, Edge deploy or business-data mutation. Only new reports/state and source evidence prepared. Original eight untracked entries preserved; no deletion.

# 2. Production baseline

HEAD and local origin/main `9c7c1f7f367c2c55ba7726663a73cb28c1b02d39`, branch main, tracked worktree clean/staging empty before this package. WP-C9 implementation `1a3513ffe35fa78681ce01b151b1894909ae7cb6`. Pages workflows37623208917 and37623806855 rechecked SUCCESS. Production URL https://hainhobkhn-droid.github.io/B-B/ ; Supabase bflwaqlvnesuqoyikxar main production.

Current index plus six assets HTTP200 and exact byte/SHA256 parity with reviewed implementation Git blobs PASS. Four assets retain wp-c9-capability-surfaces-20261007-1; matches C8 and fund C5 retained. No deploy performed. Production tab has no authenticated role evidence; old localhost/fixture results are reported as such.

# 3. WP-C1–C9 closure matrix

| WP | Implementation | Production | Verification / final status | Gap classification |
|---|---|---|---|---|
| C1 Rating scope | Complete; exact own-player predicate | Backend deployed; migration/test/report still untracked | DEPLOYED / PARTIALLY VERIFIED | MEMBER real JWT/history browser missing: ACCEPTED RESIDUAL |
| C2 promotion read model | Complete; BOTH capability RPC | Backend + Pages deployed | DEPLOYED / PARTIALLY VERIFIED | BOTH-cap identity/browser unavailable: ACCEPTED RESIDUAL |
| C3 League source | Complete; loader/error states | Pages deployed; existing RLS retained | DEPLOYED / PARTIALLY VERIFIED | Populated League + authenticated production roles: FUTURE QA / ACCEPTED RESIDUAL |
| C4 Action Accordion | Complete shared helper | Pages deployed | DEPLOYED / PARTIALLY VERIFIED | Production-origin ADMIN/delegated/normal sessions: ACCEPTED RESIDUAL |
| C5 information hierarchy | Complete | Pages deployed | CLOSED / VERIFIED PRODUCTION (existing approved gate) | Same documented role/origin residuals retained; no new closure invented |
| C6 responsive/mobile | Complete | Pages deployed | DEPLOYED / PARTIALLY VERIFIED | Populated expanded histories/role sessions: FUTURE QA / ACCEPTED RESIDUAL |
| C7 notice/accessibility | Complete | Pages deployed | DEPLOYED / PARTIALLY VERIFIED | Real screen reader + async write focus: FUTURE QA; live roles: ACCEPTED RESIDUAL |
| C8 long-list | Complete; client paging + Account lazy-open repair | Pages deployed | DEPLOYED / PARTIALLY VERIFIED | Account >25 boundary, large transport/role/speech: FUTURE QA / ACCEPTED RESIDUAL |
| C9 Rating/Audit capability | Complete; backend and shared UI | Two exact migrations + Pages deployed | DEPLOYED / PARTIALLY VERIFIED | Delegated identity, authenticated positive REST/browser and Audit scale: ACCEPTED RESIDUAL / FUTURE QA |

Implementation matrix COMPLETE; verification ISSUES retained. Earlier preparation BLOCKED statements inside C9 are HISTORICAL/SUPERSEDED by its deployment section, not current blockers. C1 security fix is production deployed, not still an open cross-Player leak.

# 4. Residual verification gaps

| Gap | Classification | Rationale / closure evidence needed |
|---|---|---|
| Production-origin authenticated ADMIN browser across deployed packages | ACCEPTED RESIDUAL | Source parity + representative authenticated localhost/fixtures exist; no real production session claimed |
| Delegated/normal MEMBER live browser + positive real JWT REST | ACCEPTED RESIDUAL | Exact backend/local matrices PASS; no suitable C9 delegated identity; do not create users solely for testing |
| C1 MEMBER production Rating history browser | ACCEPTED RESIDUAL | Own-player production hash/context tests + local isolation PASS; real Auth session rendering still needed |
| Actual screen-reader speech | FUTURE QA | DOM/keyboard fixtures cannot prove spoken announcements |
| Async mutation success/error/busy/focus runtime | FUTURE QA | Fixture checks exist; do not manufacture production writes |
| Account server page-boundary >25 | FUTURE QA | Live directory16 below limit25; existing server/fixture contract preserved |
| Audit large-data query plans/latency | FUTURE QA | Bounded pages small-data540 checked previously; no broad benchmark/index invented |
| Populated League/Tournament/expanded history/mobile permutations | FUTURE QA | Empty/representative and synthetic branches PASS; real populated permutations not claimed |
| Player fixtures “patched, Node not run” | OBSOLETE | Current20-suite execution includes both and PASS |
| C2 direct Guest SELECT bug / C3 absent League loader / C9 missing capabilities | OBSOLETE | Superseded by deployed read model/loader/capability contracts |
| Missing exact production SQL definitions | OBSOLETE for source evidence after preparation | All111 archived with hash; bootstrap/migration replay remains debt |
| Account hard-delete Edge source drift | BLOCKING for full Account source/production convergence | Reviewed ACC05 completion/recovery behavior absent in deployed Edge; separate approved decision/deployment required |
| ADMIN provisioning/confirmation Edge business gate | BLOCKING for unqualified global security closure | Exact source checks ADMIN+active only; membership/password gate or explicit audited exemption not evidenced. No live bypass test performed |
| Clean committed pre-calibration source evidence | BLOCKING for starting Calibration now | New authoritative snapshots/current state are not yet committed, intentionally preparation-only |

No documented partial package promoted to CLOSED; C5's existing closure accepted with its expressly retained gaps.

# 5. Authorization/capability final matrix

All operational SQL business RPCs are checked against current catalog, not old migration names. Frontend helpers check active + ADMIN/exact flag; overall loader/render gates membership/password. Helpers alone do not authorize a server call.

| Capability / action | ADMIN | Delegated MEMBER with exact flag | Normal MEMBER | Backend authority / agreement |
|---|---|---|---|---|
| can_collect_tournament_fee | Action | Payment action; shared finance read | Hidden payment; own registration remains | create/refund_tournament_payment; distinct from management: PASS |
| can_approve_matches | Action | Same approval center | Hidden management; personal confirm remains | approve_match_active/reject/void + management readers: PASS |
| can_manage_tournaments | Action | Management forms | Hidden management; own registration remains | create/update/status/registration/finance RPCs: PASS exposed actions; backend-only finance paths remain |
| can_manage_fund | Action | Campaign/expense/ledger; no collect CTA without collect flag | Hidden management | Fund management RPCs/readers: PASS core; Fund rule-version UI narrower than backend: MISMATCH |
| can_manage_members | Action | Promotion only with can_manage_players also | Hidden promotion/admin | candidates/preview/promote conjunction: PASS; never Account lifecycle proxy |
| can_manage_players | Action | Create/edit; promotion only with member flag also | Read directory; no management | create_player/update_player/management reader: PASS |
| can_manage_player_lifecycle | Action | Preview/status; never hard-delete | No lifecycle management | preview/set status: PASS; references do not prevent INACTIVE |
| can_adjust_rating | Manual adjustment; initial separately ADMIN-only | Manual adjustment only; no Player/lifecycle/initial rights | Hidden adjustment | *_active wrappers -> exact capability internals + business gate: PASS; correction backend authorized but no correction UI |
| can_collect_fund | Action | Payment/batch/refund authority; no raw ledger | Own/transparency read; no collect action | collection/balance RPCs refund-aware NET; manage/collect separated: PASS |
| can_view_audit | Safe read | Same safe read-only accordion | Hidden; direct RPC denied | get_audit_events; seven allowlisted fields, no raw table grant: PASS |
| Initial Rating / Player hard-delete | Action | Hidden / denied | Hidden / denied | ADMIN-only, business gate, locks and authoritative references: PASS |
| Account lifecycle/approval/permissions/hard-delete | Action | Hidden / denied | Hidden / denied | ADMIN RPCs; Edge deployed parity gap described below |
| Guest promotion | Action | Requires BOTH member + player | Hidden / denied | Backend is final authority; no cross-cap proxy |

Core action isolation/local negative tests PASS. Full frontend/backend agreement is **ISSUES / FAIL strict matrix**: delegated Fund-rule creation remains backend-allowed but hidden by ADMIN Account configuration; correction RPC is backend-only; deployed Account hard-delete source differs. No unauthorized new direct grants identified. Normal MEMBER owns personal/bootstrap/self workflows, not management actions.

# 6. UI V2 final state

docs/PICK-UI-SYSTEM-V2.md remains VERIFIED CURRENT / REQUIRED; V1 historical except explicitly retained patterns. Navy/Ivory/Lime + semantic create green, edit blue, pending amber, danger red retained. C4 shared native Action Accordion, compact 49–58px header/27–32px icon, ARIA/hidden/unique IDs; C5 decision-first DOM order; C6 compact wrapping/touch/mobile; C7 shared polite/critical notice and conservative focus; C8 shared bounded rendered lists; C9 shared Rating/Audit capability workflows implemented.

Original UI2 findings reconciled:001=C1;002=C2;003=C3;004/005=C9;006–009=C4;010/012=C8;011/013/015=C6 plusC8;016=C7;023/024=C5.017 partially addressed (Account/Fund retain domain-specific pagination);014 partially addressed (pending hierarchy done, populated Tournament finance/decomposition remains);018 snapshot transport debt;019 role/runtime residual;020 ADMIN nav refresh remains an open presentation finding;021 domain record shells remain reuse debt;022 Player hard-delete remains a global action stack rather than selected-record danger zone. Do not claim complete V2 compliance or WCAG certification. Exact unspecified pixel thresholds/animation/exclusive algorithm remain implementation choices.

# 7. Backend source convergence

Read-only catalog capture `2026-10-08T01:45:58.464571+00:00` contains111 non-extension public functions,31 policies,248 columns and trigger/constraint/grant inventory. Full per-function signature/raw hash/repo reference/YES-NO status is in `supabase/source-snapshots/2026-10-08/README.md` and manifest.json. This covers dynamic-patched Match/Rating/Fund/profile functions without inventing their bodies. 111/111 definition hashes recomputed PASS. Exact evidence is source-converged in the prepared tree; migration replay/bootstrap parity NOT VERIFIED.

| Edge | Deployed download SHA-256 | Convergence |
|---|---|---|
| admin-confirm-user | `554cb1f2474e0951daf681b48ac1fd1e74e5b981a4fa0afc8f5eed7f58d9737e` | PREPARED exact missing source; not committed/deployed |
| admin-create-member | `b309b8ecf0ac8ad04a90bba3a06a520f26ec474cc5547680db4d9f3f1f5abfd4` | YES, normalized text parity |
| admin-hard-delete-member | `ef7cf8afaf853d462722ddf6bc5f78ffde54e3695a15b0a748d4bbb60e469a93` | NO: runtime repo/deployed definitions differ; exact archive preserved |
| change-my-password | `f463287c5e227c4b75c63d69ad6050da2e99bd378fd83da7c4bbe970af82f131` | YES, normalized text parity |
| login-by-nickname | `c4ad99c786e953fc7bd7efbfec13484b5ab04320a12fa374e63ba3cce2d6dde5` | YES, normalized text parity |

admin-confirm-user exact source is now PREPARED in normal function directory and archived; not committed, tested live or redeployed. It validates JWT via getUser, ADMIN+active, target UUID and Auth user, then email_confirm true; success/already_confirmed response, no business audit call. Missing source gap closed locally; authority gap separately retained.

admin-create-member normalized source parity PASS but same limited actor check. admin-hard-delete-member drift exact differences: production accepts object-shaped cleanup without success=true, does not call complete_member_hard_delete_auth after Auth deletion, lacks some recovery metadata and special404/user_not_found handling. Repo retained unchanged. Full snapshot convergence is YES, operational Edge deployment agreement NO. Do not deploy downloaded older source over reviewed ACC05 code.

Public SECURITY DEFINER authenticated functions lacking a direct textual business helper are current_user_is_admin/current_user_membership_active/bootstrap get_signup_rating_config; no unexplained new SQL business gate omission found in this inventory. Helper current_user_business_access_active includes authenticated uid, active, APPROVED, not forced password. Fifteen restrictive membership policies call that helper; players authenticated I/U/D=false; raw audit SELECT/I/U/D=false. Snapshot is evidence, not full security proof of every nested call or Auth Edge exemption.

# 8. Migration ledger/tooling debt

42 local SQL files,41 unique versions; duplicate202609280001 is IAM06 legacy login name vs PERM01D legacy treasurer index removal. Current production to_regclass('supabase_migrations.schema_migrations')=NULL, checked read-only now; no ledger exists, not merely empty. SQL Editor deployments including C9 did not register history. Applied status cannot be inferred from filenames.

| Local version | Exact file |
|---|---|
| `202609210001` | `202609210001_mp01_member_fund_readonly.sql` |
| `202609210002` | `202609210002_mp01_harden_legacy_fund_rpc.sql` |
| `202609210003` | `202609210003_tournament_registration_event_normalization.sql` |
| `202609220001` | `202609220001_sec01_harden_sensitive_rpc_exposure.sql` |
| `202609220002` | `202609220002_sec01b_harden_leagues_privileges.sql` |
| `202609240001` | `202609240001_fund03_obligation_campaigns.sql` |
| `202609250001` | `202609250001_fund03_payment_engine_v2.sql` |
| `202609250002` | `202609250002_fund03_refund_payment.sql` |
| `202609250003` | `202609250003_fund03_cancel_campaign.sql` |
| `202609250004` | `202609250004_perm01a_member_permission_schema.sql` |
| `202609250005` | `202609250005_perm01b1_match_permissions.sql` |
| `202609250006` | `202609250006_perm01b2_tournament_permissions.sql` |
| `202609250007` | `202609250007_perm01b3_fund_permissions.sql` |
| `202609250008` | `202609250008_perm01b4_member_permissions.sql` |
| `202609250009` | `202609250009_perm01c_admin_permission_management.sql` |
| `202609280001` | `202609280001_iam06_legacy_login_name.sql` |
| `202609280001` | `202609280001_perm01d_remove_legacy_single_treasurer_index.sql` |
| `202609280002` | `202609280002_iam05a_member_account_lifecycle.sql` |
| `202609280003` | `202609280003_iam05b_member_deletion_preview.sql` |
| `202609280004` | `202609280004_iam05d1_signup_membership.sql` |
| `202609280005` | `202609280005_iam05d2_member_approval.sql` |
| `202609280006` | `202609280006_iam05e_safe_member_hard_delete.sql` |
| `202609290001` | `202609290001_fund03_payment_net_paid.sql` |
| `202609290002` | `202609290002_fund03_collection_balances.sql` |
| `202609290003` | `202609290003_fund04_member_batch_collection.sql` |
| `202610010001` | `202610010001_acc05_hard_delete_integrity_recovery.sql` |
| `202610020001` | `202610020001_acc06b_forced_password_completion.sql` |
| `202610020002` | `202610020002_acc06d_forced_password_cutover.sql` |
| `202610020003` | `202610020003_acc07b_business_access_gate.sql` |
| `202610030001` | `202610030001_player_lifecycle01a_reference_inventory.sql` |
| `202610030002` | `202610030002_player_lifecycle01b_status_transition.sql` |
| `202610030003` | `202610030003_player_lifecycle01c_conditional_hard_delete.sql` |
| `202610030004` | `202610030004_player_lifecycle01d_inventory_convergence.sql` |
| `202610030005` | `202610030005_rating_initial01b_pre_history_edit.sql` |
| `202610030006` | `202610030006_player_permission01a_capability_schema.sql` |
| `202610030007` | `202610030007_player_permission01b_account_capability_reset.sql` |
| `202610030008` | `202610030008_player_permission01c_player_rpc_authorization.sql` |
| `202610030009` | `202610030009_player_permission01d_player_management_directory.sql` |
| `202610040001` | `202610040001_rating_scope01_member_rating_events_own_player.sql` |
| `202610040002` | `202610040002_player_permission01_promotion_read_model.sql` |
| `202610070001` | `202610070001_wp_c9_rating_capability.sql` |
| `202610070002` | `202610070002_wp_c9_audit_read_model.sql` |

Formal safe procedure (NOT EXECUTED): (1) freeze deploys and archive exact catalog plus function/schema/Edge hashes; (2) map each historical file to catalog postconditions and deployment evidence, classify applied/superseded/unknown; (3) resolve duplicate IDs through a reviewed manifest/tooling strategy, preserving original files/checksums—do not rename historical deployments casually; (4) restore a full schema into an isolated environment and test the proposed ledger baseline/CLI dry-run, including one-time guarded migrations and absent bootstrap; (5) obtain explicit production repair approval and backup/rollback plan; (6) register only proven history using reviewed migration repair operations, no blind --include-all/db push/pull/reset; (7) verify ledger unique mapping/catalog unchanged and prospective single forward migration dry-run. No repair command is authorized in this preparation. CLI query/export now works without Docker; full db dump/bootstrap still not established. No tooling installation.

# 9. Untracked file disposition

Classification of the ORIGINAL eight, independent of new artifacts:

| Item | Disposition | Reason |
|---|---|---|
| PICK-FRONTEND-AUTH-SURFACE-AUDIT-2026-10-04.md | KEEP + COMMIT | Historical architecture evidence; current report supersedes old findings |
| PICK-UI-V2-RECONCILIATION-2026-10-04.md | KEEP + COMMIT | Historical V2 finding register, not current package status |
| PICK-WP-C1-RATING-SCOPE01-2026-10-04.md | KEEP + COMMIT | Security deployment evidence |
| supabase/migrations/202610040001_rating_scope01_member_rating_events_own_player.sql | KEEP + COMMIT | Exact deployed forward fix; never rewrite |
| supabase/tests/rating-scope01-local-test.py | KEEP + COMMIT | Own-player/security regression PASS |
| PICK-NEXT-CHAT-HANDOFF-2026-10-04.md | KEEP LOCAL / IGNORE for current closeout | Stale operational handoff says leak OPEN/two fixtures unverified; new authoritative state supersedes it. Future historical commit only after explicit header review |
| audit-output.txt | KEEP LOCAL / IGNORE | Generated baseline/search output; no source authority; preserve without deletion |
| supabase/.temp/ | KEEP LOCAL / IGNORE | CLI versions/project linkage/pooler metadata; no source authority; do not publish |

Commit candidates5; local/ignore3; delete candidates0. No .gitignore/exclude change or deletion executed. Future closeout may explicitly exclude local artifacts; current short status still shows them. New prepared source/state/report files require separate exact-scope review; no git add .

# 10. Rating pre-calibration baseline

Captured READ ONLY 2026-10-08T01:48:07.558423+00:00.

| Metric | Value |
|---|---:|
| Players / ACTIVE / INACTIVE | 25 / 23 / 2 |
| Historical matches / lineup rows readable | 64 / 256 |
| APPROVED positive-weight rated matches | 60 |
| rating_events | 240 |
| Manual source adjustments / derived adjustment events | 0 / 0 |
| Projection mismatch (tolerance 0.0005) | 0 |
| Adjustment integrity mismatch / orphan Rating events | 0 / 0 |

Projection hash `14ccd4ca817758c3de810cee37436e9a`; event hash `9c4c8fd471f19c35721ea6c1b0d40fcc`; empty adjustment hash `d41d8cd98f00b204e9800998ecf8427e`. These equal the C9 recorded baseline. The projection comparison uses active-version MATCH/ADJUSTMENT replay order, reverse timestamp/type/match_number/replay_order/business event id, and initial_rating when no event exists. It is a projection consistency test, not an independent complete numerical engine recalculation.

Active V1.1; V1.0 retained inactive. Initial/default=4, min=2, max=8, K=0.55, expected sensitivity=0.9, provisional=5, stable=10, half-life=60 days, recency floor=0.35, match delta cap=0.35. Weights: Tournament1, League0.95, ClubRated0.9, FriendlyRated0.6, SelfReported0.4, Training0.

Exact engine source: mean current team ratings; expected=1/(1+exp((opponent-team)/sensitivity)); actual=point share for POINTS, result share for RESULT; gap=actual-expected; provisional multiplier1.25 before5 prior Match events,1.10 before10,1 thereafter; recency=max(floor,0.5^(nonnegative days from latest approved positive-weight match / half-life)); delta=gap*K*matchWeight*recency*provisional, capped +/-0.35; rating clamped2..8. Replay resets from initial_rating and orders event_time ASC, MATCH before ADJUSTMENT, match_number, replay_order, business event id. Adjustments are source ledger rows, not Match events/provisional counts.

Config version creation deactivates old settings, creates new active version and rebuilds full history in the same transaction. There is NO implemented future-only/grandfather calibration behavior. Locks: Rating writes/rebuild advisory726184501; config writes726184503 followed by rebuild. Do not call config creation to inspect readiness.

Initial Rating pre-history correction is ADMIN-only with reason, advisory + Player lock, authoritative history guard; assigns initial/current together without history/reset or capability expansion. Signup uses configuration validation and trigger assignment. Manual signed delta requires reason/effective time/request UUID, non-finite rejection, idempotency, append-only ledger, rebuild/projection/audit; correction appends an inverse delta. WP-C1 zero-argument MEMBER RPC returns linked own Player history only; no link => empty, other business states denied. Actual MEMBER browser smoke remains unperformed.

| Relevant exact production function | Raw MD5 |
|---|---|
| `_get_active_rating_version()` | `d2f0aeada41cdf2ec0746324ba266957` |
| `_approve_match_internal(uuid,text,uuid,uuid)` | `f453af5f5da1bbf3618be571a8b25ffb` |
| `_rebuild_ratings_internal(text,uuid)` | `b3b434e407c1828bbb6dbf2907148104` |
| `approve_match_active(uuid)` | `ce955e39a2d955c5210e6057b2ed7f23` |
| `rebuild_ratings_active()` | `2bffd38448262aa35456e582a55e0bc1` |
| `admin_create_rating_settings_version(text,numeric,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,numeric)` | `8d496aaa788bc561ef0f249c65dfec89` |
| `admin_update_rating_match_weight(text,numeric,text)` | `0d4e189749113e53de50e13c8e46dc65` |
| `record_rating_adjustment_active(uuid,uuid,numeric,text,timestamp with time zone)` | `511cead28025ae378827a9e18c4ce5c5` |
| `record_rating_adjustment(uuid,uuid,numeric,text,timestamp with time zone,text)` | `8e46d18334aab4af27f8cc1264178460` |
| `correct_rating_adjustment_active(uuid,text)` | `6121a66c5b4b9933f6e7e7e498d5bf82` |
| `correct_rating_adjustment(uuid,text,text)` | `8c738f269f2a8b7a9f8411b8043a606d` |
| `set_player_initial_rating_before_history(uuid,numeric,text)` | `4f8a480037ef04a8e0b223739bce5652` |
| `get_member_rating_events()` | `f972e7f7e1117466237d80b6c64abacd` |
| `current_user_business_access_active()` | `d5a196e9bfb9522d559e3422c6669c01` |
| `get_audit_events(integer,integer,timestamp with time zone,timestamp with time zone,uuid,text,text)` | `9dd6c825591f6c018fa94ee94796a86c` |

Audit normalized (CR removed) definition MD5: `1f2511bef9a66067151653952d973a4a`. Every full definition is in the production source archive; no formula was modified.


# 11. Security status

C1 own-history isolation, C2 BOTH capability reader, C9 exact manual Rating/Audit authorization, safe projection, no raw Audit privileges, Initial/Player/lifecycle separation and ACC07B matrix PASS. No unresolved demonstrated Rating data-scope leak remains in current exact source. Positive delegated Auth/JWT runtime still a residual, not fabricated PASS.

Newly verified source concerns: Account hard-delete deploy drift; ADMIN provisioning/confirmation Edge actor checks lack membership/password gating without recorded exemption. These are not silently accepted as recovery exemptions. Safe next step: dedicated Edge contract review, synthetic denied-state tests and an explicitly approved forward convergence rollout. No Edge policy/code behavioral patch made here. Advisor leaked-password-protection warning observed in Dashboard is existing operational security debt, not modified or fully audited in this package.

# 12. Production technical debt

Ledger absence/version collision/bootstrap incompleteness; Account Edge drift/authority decision; delegated Fund-rule UI narrower; Match edit+resubmit non-atomic; 10k snapshots and client aggregation; large selected Rating histories/Match personal queues; Tournament finance/decomposition; contextual Player hard-delete; ADMIN nav/reuse debt; Audit scale/index evidence; real role/JWT/screen-reader/focus gaps. No formula or business scope silently expanded.

# 13. Historical preparation Calibration entry criteria

| Criterion | Result |
|---|---|
| Projection/adjustment integrity/orphans zero | PASS now |
| Production Rating hashes captured | PASS exact archive |
| Exact engine/helper/config/initial/manual/scope source available | PASS prepared; not yet locked in Git |
| Current migrations preserved | PASS originals unchanged; ledger reconstruction separate DEBT |
| Historical matches/events readable | PASS aggregate reads |
| No unresolved demonstrated Rating authorization bug | PASS exact scope/capability/local guards; real JWT residual explicit |
| Formula/version/replay documented | PASS; no future-only calibration implemented |
| No unrelated dirty tracked source | PASS |
| Clean committed pre-calibration authoritative baseline | FAIL / pending approved closeout commit |

**CALIBRATION READY: NO (start now).** Exact blocker: authoritative source snapshot/current-state/C1 source evidence remain uncommitted by this preparation-only rule. Technical Rating evidence is ready for review; after explicit closeout commit/clean baseline verification, reassess entry without rerunning destructive production actions. Account Edge/security findings block unqualified whole-project closure and Account deletion changes; they do not establish a Rating formula bug or authorize a calibration change. No requirement to create delegated credentials or run destructive production concurrency.

# 14. Recommended cleanup actions

Review exact prepared files + five original commit candidates; keep three local-only artifacts outside commit. Preserve old Oct4 state as historical; new current-state wins. Review Account Edge drift/gate intent separately before claim all backend behavior converged. Approve ledger reconciliation as its own operational package, never as incidental cleanup. No source deployment or stale handoff activation. No stage/commit/delete performed.

# 15. Final project status

**PARTIALLY VERIFIED.** C1–C9 implementation/deploy evidence complete; C5 closed as recorded, other package statuses unchanged. Source evidence greatly improved but actual Account Edge operational convergence/security contract and clean committed baseline remain unresolved. No new app implementation regression observed.

Quality rerun:20/20 frontend suites PASS; C1, C2, C9 Rating, C9 Audit, ACC07B, Initial Rating integrity/concurrency and Player Permission backend/security PASS on isolated localhost PostgreSQL. Production projection integrity PASS; exact catalog111 hashes PASS. JS/CJS, downloaded TS syntax, Python AST, UTF-8/no BOM/no U+FFFD and diff checks PASS. No fresh visual suite required because app assets unchanged; historical fixture/runtime limitations retained.

Production schema/business mutation=NO submitted DDL/DML; catalog/aggregate SELECT only. Edge download only. Stage/commit/push/deploy=NO. No user/credential created. Local synthetic test cluster stopped after tests.


## FINAL-D authoritative closeout record — 2026-10-08

Direct user authorization supersedes preparation-only Git restrictions for exactly the19 reviewed artifacts. It does not authorize production SQL/Edge/business mutation or any residual fix. The earlier PARTIALLY VERIFIED/CALIBRATION READY:NO statements record the preparation gate. This section supersedes that gate once the commit containing this record is successfully pushed and its publication checks pass.

Review and pre-commit evidence: exact19 approved paths; original disposition5 commit candidates/3 local-only/0 delete unchanged. All111 production function hashes rechecked unchanged at2026-10-08T02:07:23.555506+00:00. Rating counts/config/projection/event hashes unchanged at2026-10-08T02:07:28.9501+00:00:25 players,60 rated matches,240 events,0 adjustments,0 projection/integrity/orphan mismatches. These counts are time-sensitive observations; function hashes are the immutable source baseline. Count drift from legitimate future activity alone is not engine drift.

admin-confirm-user fresh deployed download matches both repo and archive byte-for-byte; this commit represents already-deployed source only, introduces no production privilege/behavior, and is not an Edge deployment. Sensitive scan found no credential values, access/refresh tokens, JWTs, cookies, private keys, credential URLs, password secrets or .env content. Environment variable names and synthetic fixture identifiers are not credential values. Snapshots remain reference evidence, never migration replacements.

Pre-commit gates PASS:20/20 frontend suites; C1/C2/C9 Rating/C9 Audit/ACC07B/Initial Rating/Player Permission isolated backend tests; current production projection and hashes; JS/CJS/TS and browser-inline syntax; Python AST; UTF-8/noBOM/U+FFFD=0; staged/unstaged diff checks. Existing runtime assets are excluded from this commit and must remain byte-identical. No new runtime smoke is claimed.

Final closeout status, effective after successful exact-scope commit/push, HEAD==origin/main, Pages SUCCESS (if triggered), unchanged frontend asset parity and clean tracked tree: **CLOSED WITH DOCUMENTED RESIDUALS**. This closes the evidence/baseline package, not each partially verified WP. WP-C1–C9 statuses above remain unchanged. Commit identity is the Git commit containing this record; push/workflow result is independently verified during FINAL-D execution, not invented before publication.

**CALIBRATION READY: YES**, effective only when the publication/clean-tree conditions above are verified. All ten FINAL-D criteria are satisfied by zero projection mismatch, captured exact Rating hashes/source, preserved migrations, readable history, current scope/capability guards, documented V1.1 formula and committed/pushed clean baseline. No unresolved demonstrated Rating correctness/security bug was identified. Account hard-delete Edge drift, provisioning/confirmation gate/exemption evidence, delegated Fund-rule UI mismatch, ledger absence/version collision and live role/speech/Audit-performance residuals remain documented non-blocking debt for Calibration under the user's FINAL-D classification. They still prevent unqualified global security/source convergence or unrelated Account deletion changes. No exemption or residual fix is introduced.

If commit/push/Pages/assets/clean-tree verification fails, this conditional YES does not take effect: stop with the exact blocker. No Calibration work starts in FINAL-D. Local-only stale handoff, audit-output.txt and supabase/.temp/ remain untracked and are not deleted or published.

# 16. Next workstream

First review/approve preparation artifacts and closeout source baseline; separately resolve Account Edge source/security convergence and ledger debt. Next Rating workstream remains RATING-CALIBRATION01-A, but not started here. Its first step must read new current state/Rating exact archive and preserve V1.1 historical semantics until a separately authorized design exists.
