# PICK WEBAPP — current authoritative state after C1–C9

Requested filename date2026-10-07; actual reconciliation2026-10-08 Asia/Bangkok. Preparation record with FINAL-D closeout gate below; Git lock applies only after successful publication. Supersedes Oct4 state/handoff for CURRENT claims; old files remain historical evidence. Production catalog wins historical migration bodies. UI authority: docs/PICK-UI-SYSTEM-V2.md; AGENTS unchanged.

## Baseline

HEAD/origin/main `9c7c1f7f367c2c55ba7726663a73cb28c1b02d39`; WP-C9 implementation `1a3513ffe35fa78681ce01b151b1894909ae7cb6`. Pages implementation/docs workflows SUCCESS; index + six assets byte parity PASS Oct8. No tracked application source changes. No stage/commit/push/deploy or production mutation in reconciliation.

## Package status

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

## Current authorization

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

Current business gate: authenticated uid + is_active + APPROVED + must_change_password IS NOT TRUE. Backend RPC/RLS remains authority, not frontend display. No players direct authenticated DML or raw audit grant. Core isolation PASS; full agreement ISSUES from Fund-rule narrower UI and Account Edge source/gate gaps. No delegated identity fabricated.

## UI V2

Shared Action Accordion, decision-first information order, compact responsive layouts, shared notice/focus and client list controls deployed. Navy/Ivory/Electric Lime with semantic colors retained. Do not claim full V2/WCAG closure: contextual Player danger zone, populated Tournament finance/long histories, ADMIN nav, record reuse and large-data/server scalability remain. C5 closure accepted exactly as its report; other partials unchanged.

## Production backend source

All111 non-extension public definitions captured exactly with raw MD5/owner/ACL/config;31 policies/248 columns/user triggers/constraints/grants in `supabase/source-snapshots/2026-10-08/production-catalog.json`. Full per-function convergence matrix in README/manifest. This is read-only evidence, not bootstrap/install/deploy SQL. Runtime-source parity for login-by-nickname/admin-create-member/change-my-password PASS normalized. Missing admin-confirm-user exact source prepared in standard directory without deployment. admin-hard-delete-member production differs from reviewed ACC05 repo; both preserved. Provisioning/confirmation Edge check ADMIN+active only; explicit membership/password gate exemption not evidenced. Whole-project source/security closure remains PARTIALLY VERIFIED.

## Rating baseline locked as read-only evidence

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


## Residual verification / debt

Accepted residual: authenticated production-origin ADMIN/delegated/normal + C1 MEMBER history/positive JWT runtime. Future QA: actual screen reader, async mutation focus/busy, Account >25 page boundary, Audit large-data/performance, populated League/Tournament/mobile histories. Do not create production users or business writes solely for checkboxes.

42 migrations/41 unique versions;202609280001 duplicate; production migration ledger absent. No rewrite/repair performed. Preserve all historical files and use separately approved mapping/backup/isolated rehearsal procedure in final report. Match edit+resubmit non-atomic, 10k snapshot transport, Rating full-history rebuild/config semantics retained.

Original eight disposition:5 KEEP+COMMIT (WP-A/WP-B/C1 report/C1 migration/C1 test),3 KEEP LOCAL/IGNORE (stale handoff/generated audit/CLItemp),0 delete. Actual cleanup/staging not performed. Full20 frontend suites and relevant C1/C2/C9/ACC07B/Initial/Player backend PASS. Exact111 hash verification and production projection0 PASS.

## Historical preparation gate / next workstream

Final reconciliation PARTIALLY VERIFIED. CALIBRATION READY: NO to start immediately: authoritative snapshots/current state/C1 evidence need approved closeout commit and clean locked baseline. Rating technical preconditions otherwise PASS; Account Edge contract review and ledger remain explicit separate debt/blockers for global closure. Do not start Calibration or Account changes under this document. Next Rating workstream RATING-CALIBRATION01-A only after its entry gate is reassessed.

See PICK-FINAL-RECONCILIATION-2026-10-07.md for complete16-section finding/operational/verification record and `supabase/source-snapshots/2026-10-08/manifest.json` for exact source/migration checksums.

## FINAL-D current gate — supersedes preparation status after publication

Direct user approval permits exactly19 closeout artifacts to be staged/committed/pushed. No production SQL/Edge/business mutation or residual fix. Current production recheck2026-10-08T02:07:23.555506+00:00:111 function hashes unchanged; Rating recheck02:07:28.9501+00:00:projection0,25 players,60 rated matches,240 events,0 adjustments,baseline hashes unchanged. Counts are time-sensitive observations; function hashes are the source contract.

Artifact/sensitive scan and admin-confirm-user fresh deployed-source parity PASS. All20 frontend suites and C1/C2/C9/ACC07B/Initial Rating/Player Permission backend/security gates PASS; syntax/AST/UTF8/noBOM/U+FFFD/staged diff PASS. Exact19 path list is the Git commit containing this state document. Frontend runtime assets are unchanged and excluded.

Upon verified successful commit/push, HEAD==origin/main, Pages SUCCESS if triggered, unchanged production runtime assets and clean tracked tree: final reconciliation **CLOSED WITH DOCUMENTED RESIDUALS**; **CALIBRATION READY: YES**. These are conditional publication gates, not claims that publication happened before commit. Failure stops the package and keeps readiness NO. C1–C9 partial/closed statuses remain exactly as reported; no live browser/screen-reader test invented.

Remaining Account Edge convergence/gate evidence, delegated Fund-rule UI, migration ledger/version collision and runtime/scale QA are classified non-blocking for Rating Calibration because no material Rating correctness/security impact was found. They remain unresolved and are not exemptions, fixes or global security PASS. Original local-only stale handoff/audit-output/CLItemp retained, never staged. RATING-CALIBRATION01-A is not started here.
