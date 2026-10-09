# MEMBER MATCH CONFIRMATION + MY MATCHES + ADMIN CREATOR VISIBILITY

Date: 2026-10-09. MATCH-D status: **DEPLOYED / PARTIALLY VERIFIED**. Backend gate and release gates PASS; Pages and production asset parity verified. Live authenticated production browser sessions NOT RUN.

# 1. Scope

Match frontend, scoped participant history, management creator identity and focused regressions only. Calibration is paused. No Rating formula, capability model, production data, RLS/table grant, Edge or application workstream outside Match changed. Existing unrelated working-tree changes are preserved.

Authoritative UI: `docs/PICK-UI-SYSTEM-V2.md`; shared WP-C4/C5/C6/C7/C8 patterns reused. Before editing, `matches.js` and `index.html` were backed up outside the repository at `C:\Users\hainh\.codex\.chatgpt-projects\g-p-6a9ef55bf47881919ff2a6045b843a72\match-backup`. Calibration file hashes were captured there and compared after preparation.

# 2. Current Match backend workflow

VERIFIED CURRENT: production catalog captured read-only at `2026-10-09T02:04:36.486958+00:00`, project `bflwaqlvnesuqoyikxar`. Function hashes matched the tracked `supabase/source-snapshots/2026-10-08/production-catalog.json`. Local tests load exact catalog definitions, preserving function-body newlines for source-hash assertions.

| Function | Contract |
|---|---|
| create_my_pending_match(timestamptz,text,text,integer,integer,uuid,uuid,uuid,uuid,text) | Active business-enabled MEMBER, linked ACTIVE CLUB Player, four valid distinct roster Players, own Player must participate; creator is auth.uid() |
| create_pending_match(timestamptz,integer,text,text,integer,integer,uuid,uuid,text) | Administrative creation; lineup set separately |
| confirm_match_by_opponent(uuid) | Eligible opposite-team MEMBER; standard rated PENDING match, not rejected; calls existing approval engine |
| reject_match_by_opponent(uuid,text) | Same opposite-team boundary; reason 3–1000 trimmed characters; leaves status PENDING and sets rejection fields |
| update_my_rejected_pending_match(uuid,timestamptz,text,text,integer,integer,uuid,uuid,uuid,uuid,text) | Original creator edits rejected pending submission |
| resubmit_my_rejected_match(uuid) | Original creator clears rejection and resubmits |
| approve_match_active(uuid) / approve_match(uuid,text) | ADMIN or active can_approve_matches; no participant requirement |
| reject_pending_match(uuid,text) | Administrative intervention; PENDING -> INVALID |

All business entry points retain current_user_business_access_active(). Existing mutation functions, advisory lock, target-row locks, audit and downstream Rating/Fund processing are untouched.

# 3. Creator-team detection

VERIFIED CURRENT: mutation/read helper looks up earliest CREATE_MY_PENDING_MATCH audit matching matches.created_by, then new_data.member_player_id, then its match_players.team. The caller's team is resolved independently from current linked Player and lineup. Team A is not assumed to be the creator team.

# 4. MEMBER confirmation eligibility

Current mutation requires an active MEMBER linked to ACTIVE CLUB Player, participation, a different team from original creator, standard CLUB_RATED/FRIENDLY_RATED match, no tournament/league, PENDING and no rejection awaiting resubmit. Creator account itself is denied. Either opponent can act; approval immediately prevents a second confirmation.

Finding and prepared minimal fix: get_my_pending_match_confirmations previously checked active MEMBER profile but not linked Player ACTIVE/CLUB, while mutation did. The draft adds only those Player conditions to this read helper. No mutation RPC was rewritten. A production-definition MD5 assertion fails closed if the audited read helper drifts.

# 5. ADMIN override

VERIFIED CURRENT / local PASS: ADMIN without linked Player approves and rejects both creator-team configurations. Delegated can_approve_matches retains the same management workflow. MEMBER opponent eligibility never narrows administrative authority.

# 6. Eligibility matrix

Local PostgreSQL executes all 16 creator/caller pairs for Confirm and all 16 for Reject:

| Creator | A1 | A2 | B1 | B2 | unrelated C1 | ADMIN |
|---|---|---|---|---|---|---|
| A1 | deny | deny | allow | allow | deny | administrative allow |
| A2 | deny | deny | allow | allow | deny | administrative allow |
| B1 | allow | allow | deny | deny | deny | administrative allow |
| B2 | allow | allow | deny | deny | deny | administrative allow |

Allow denotes both Confirm and Reject through their respective contract. ADMIN uses administrative RPCs, not the MEMBER-specific RPC.

# 7. Confirm flow

Only the section title is clarified as “Cần xác nhận & xử lý kết quả”; workflow code is otherwise preserved. Existing native Confirm button, confirmation dialog, state.writeBusy and disabled guard retained. RPC success precedes authoritative reload/render; no optimistic approval. Stale MATCH_NOT_PENDING reload path retained. Local second confirmation rejects and leaves exactly four Rating events. Disconnected browser fixture confirmed the actionable card disappears and My Matches approved summary increases after stub success; this does not prove live backend transport.

# 8. Reject flow

Existing reason entry, minimum length and max length, native submit/cancel, busy guard and shared notice retained. Browser fixture verified opening Reject focuses the reason textarea. Backend rejection leaves PENDING with opponent_rejected_by/at/reason; it does not create Rating events. Rejected UI state is derived presentation, not a new DB enum.

# 9. Edit/resubmit

Local P1.2b regression executes opponent reject -> stale confirm denial -> creator update -> resubmit -> opponent confirm for both opponent positions and all creator positions. created_by remains original; database guard rejects changing created_by even in the fixture. Existing frontend Edit + Resubmit uses two RPC calls and remains non-atomic technical debt; saved edit with failed resubmit retains the existing explicit notice/retry behavior.

# 10. Member UI — Cần xác nhận

Existing backend can_confirm is the sole action-eligibility read signal. Rejected original-creator submissions remain actionable for editing. Shared Action Accordion and existing team/date/score cards retained. The page now orders confirmation/rejected work -> My Matches -> member creation actions. Existing administrative work and shared historical lookup are preserved.

# 11. My Matches read model

NEW DRAFT: public.get_my_matches() returns jsonb, no arguments. It resolves auth.uid(), requires business access and active MEMBER, then current_user_player_id(). Response is `{player_id, matches:[...]}`. A missing linked Player returns null/empty; no broad-history fallback.

Records expose only match identity/date/number/type/score mode/scores/status, rejection flag/reason, caller's team and deduplicated roster Player IDs/names/team. No auth/email/login fields, raw audit or arbitrary account lookup. Rows order played_at DESC, id DESC. This is full scoped history transport with client-side shared pagination; server pagination is not introduced in this package.

# 12. My Matches inclusion/security

EXISTS on match_players.player_id OR partner_player_id equals server-resolved Player. No creator-only filter and no arbitrary Player parameter. UNION roster expansion removes duplicate primary/partner appearances. Local tests compare exact returned IDs with authoritative participant IDs, including partner-only legacy representation and no-linked profile. Arbitrary-player signature fails; unauthenticated/forced-password/normal-MEMBER management context is denied. An unrelated caller receives only their own participant history.

The existing get_member_matches()/get_member_match_players() RPCs expose the shared club lookup dataset; they are not reused as the security boundary for My Matches and are unchanged. This package does not claim to narrow that historical feature's access.

# 13. My Matches UI

Summary: participated total, approved, wins/losses from approved scores and own team, pending without opponent rejection. Unknown scores/team are not counted as wins/losses. Cards show date, teams, score, status, match type and own team/result. Reject reason shown for rejected pending submissions. Safe unlinked wording: “Tài khoản chưa liên kết với hồ sơ VĐV.” RPC/schema errors display unavailable; no shared/gross/legacy fallback. Detached async results are ignored.

# 14. Search/filter/pagination

Actual WP-C8 paginatedList reused, 20 rows/page; search code/roster names; All/Pending/Approved/Rejected/Invalid/Voided filter. Context remains isolated per account. No new top-level navigation. CJS uses 28 records with long names/mixed statuses/types and tests search, filter and second page. Browser tests confirmed approved filter yields 25 rows and second page five rows.

# 15. ADMIN creator identity

NEW DRAFT: get_match_creator_context() returns `(match_id uuid, creator_name text, match_created_at timestamptz)`. Business gate + active ADMIN/can_approve_matches required. Authoritative LEFT JOIN profiles.id=matches.created_by. Only display name and match creation timestamp returned; no broad profile grant. Per-page one shared RPC promise; reused by pending/approved/invalid/voided management cards. Deleted/unresolved/empty creator gets “Người tạo: Không xác định”; RPC failure is distinctly unavailable.

# 16. Creator vs resubmitter

No created_by mutation or inference from A1/A2/B1/B2. No synthetic last-resubmitter field. Existing source lacks a separate authoritative last-resubmitter display field; this package does not invent one. All four creator identities tested against account full_name; reject/edit/resubmit preserve original creator. Missing profile fixture verifies NULL read-model name and frontend fallback.

# 17. ADMIN Match UI

Existing adminMatchCenter reused. Creator line inserted below date/type in the shared management renderCard, therefore pending and history reuse the same presentation. ADMIN/delegated cards and administrative buttons preserved. Browser fixture verified creator labels on pending and expanded approved history. Administrative action authority proved by real local SQL definitions; no production match approved/rejected for testing.

# 18. Rating integration regression

Existing production _approve_match_internal and Rating rebuild source used locally. Pending/rejected/edit do not produce new match Rating events. Valid MEMBER or ADMIN/delegated approval produces four events; repeat confirmation rejects without another event set. Formula/settings were not changed. Fixture schema uses historical frozen data read-only as test input, not Calibration calculations or workflows. Fund approval dependency runs existing source with fixture rules; no business data touched remotely.

# 19. Security/RLS

Production catalog: matches/match_players/profiles RLS enabled; authenticated SELECT exists, direct INSERT/UPDATE/DELETE absent. Existing restrictive business-access policy and role/capability policies unchanged. New read RPCs SECURITY DEFINER, fixed public,pg_temp search_path, explicit identity/business checks; PUBLIC/anon execute revoked and authenticated/service_role execute granted, with authorization still required. No table grant or RLS change. Existing read-helper ACL is preserved by CREATE OR REPLACE. New functions created under the migration owner's normal postgres deployment context; verify owner/catalog before any future release.

# 20. Desktop/mobile

Disconnected browser fixture uses actual matches.js, shared el/button/Action Accordion/notice/pagination source and current app.css; RPCs are explicitly synthetic in-memory stubs, no Supabase access.

| Surface | Local browser fixture | Live production role session |
|---|---|---|
| MEMBER creator/teammate/opponents/unrelated | PASS visibility, confirmation/rejected work and scoped history fixtures | NOT RUN |
| MEMBER Desktop 1280px | PASS search/filter/pager | NOT RUN |
| MEMBER Mobile 390px / 320px | PASS long-name wrap, controls, no horizontal overflow | NOT RUN |
| ADMIN Desktop 1280px / Mobile 390px / 320px | PASS pending/history creator and existing management cards | NOT RUN |
| Delegated approval surface | PASS shared management fixture | NOT RUN |

Observed scrollWidth <= viewport on tested widths. Reject textarea focus PASS. Actual application post-render focus behavior covered by WP-C7 suite; not claimed live E2E. Actual screen reader NOT RUN. Browser native confirmation click emitted an automation timeout while fixture action completed; subsequent state showed approved record and updated summary. Backend double-submit authority is proven separately locally.

# 21. Tests

- 11/11 isolated PostgreSQL unittest methods PASS, including 32 creator/caller subcases, ADMIN/delegated intervention, create security, P1.2/P1.2b, Rating events, scoped history, creator, inactive read eligibility, partner-only inclusion, source-drift transaction rollback, ACL/search_path/security.
- 21/21 current executable frontend CJS suites PASS (20 existing + new focused Match suite; fixture-only CJS helper excluded).
- JS/CJS syntax, Python AST, UTF-8/no BOM/no U+FFFD, trailing whitespace and git diff --check PASS. Calibration: all 187 pre-existing file hashes unchanged. Disposable Match databases removed and fixture PostgreSQL stopped.
- No separate named P1.2/P1.2b runner exists in supabase/tests; their exact production RPCs are exercised in the new local suite. No Calibration runner was executed.

Commands: `python -X utf8 supabase/tests/member-match-confirmation-local-test.py` (localhost PostgreSQL 17, port 55439, existing test roles); `node supabase/tests/member-match-confirmation-ui-test.cjs`; build disconnected browser fixture with `python supabase/tests/member-match-browser-fixture.py --out <temporary-directory>` and serve only on localhost. Local databases are cloned/dropped per test; no production connection exists in these test runners.

# 22. Backend changes

Prepared `supabase/migrations/202610090002_member_my_matches_creator_context.sql`: additive get_my_matches(), additive management creator context, minimal get_my_pending_match_confirmations read eligibility alignment. One transactional forward-only migration, expected once; not an idempotent repeat script. Source-drift assertion rolls the entire transaction back. Existing mutation function signatures/bodies, Rating/Fund formula and workflow, RLS and table grants unchanged.

# 23. Deployment plan

Not authorized in this package. Future separate approval: verify audited read helper hash/schema and deploy draft migration before frontend, reload API schema cache if needed, verify function owner/ACL/search_path/auth and scoped no-linked/foreign history behavior, then release reviewed frontend/cache tag `matches.js?v=member-match01-20261009-1`. Live MEMBER creators/opponents/unrelated and ADMIN/delegated browser smoke must follow. Do not release frontend ahead of its two new RPCs. No automatic deployment performed.

# 24. Final status

**PARTIALLY VERIFIED**. Production contract audit, prepared local backend/security regressions, all frontend suites and disconnected browser Desktop/Mobile fixture verification PASS. New backend RPCs have NOT been applied; real Supabase/PostgREST sessions for this prepared workflow are NOT RUN. This is the residual verification gap, not a claim of live success.

Production mutation = NO. Stage/commit/push/deploy = NO. Calibration artifacts/frozen protocol/formula unchanged. Do not resume Calibration or ship this preparation without a separately authorized release.


# 25. MATCH-D production deployment evidence

Explicit action-time approval received directly from user on 2026-10-09 after an automatic approval review initially rejected authorization contained only in the attached request. The rejected command did not execute. The subsequent approved command applied exactly `supabase/migrations/202610090002_member_my_matches_creator_context.sql` to `bflwaqlvnesuqoyikxar` via Supabase CLI Management API. Execution exit 0, rows empty, followed by direct catalog verification.

## Baseline and migration review

Production precheck PASS: all function definition hashes, columns, constraints, table privileges and policies matched the audited baseline. New RPCs were absent before apply. Reviewed scope is additive read RPCs plus ACTIVE/CLUB read-helper alignment only; Confirm/Reject/approval mutations and Rating formula unchanged.

## Post-catalog

| Function | pg_get_functiondef MD5 |
|---|---|
| get_my_matches() returns jsonb | 8392271d94dc433ba06676f199520fae |
| get_match_creator_context() returns table(match_id uuid, creator_name text, match_created_at timestamptz) | 2575151a21779459a8733d68a801d5fc |
| get_my_pending_match_confirmations() existing return signature preserved | 30879bb5a0fd57ab0f5108279a773bfd |

Exactly these three function definitions changed. All owner=postgres, SECURITY DEFINER=true, config=`search_path=public, pg_temp`, ACL=`{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; anon/PUBLIC EXECUTE absent. Each has a single catalog signature; no ambiguous overload introduced. Table privilege/RLS/schema/constraint inventory unchanged. Original confirmation and rejection mutations retain exact production hashes. ACTIVE/CLUB synchronization verified from post-definition; full mirrored eligibility remains covered by local fixtures.

## Production read verification and stop evidence

Rating projection mismatch **0**, verified through existing read-only projection query; no Rating mutation.

14 existing active, APPROVED, non-forced MEMBER profiles have linked Players; no qualifying unlinked MEMBER fixture exists. Read-only SQL uses `BEGIN READ ONLY`, `SET LOCAL ROLE authenticated`, and local request JWT claim settings, then calls get_my_matches() and compares exact match IDs to participant references from the existing member lineup read model. This is SQL role/claim-context evidence, not a live JWT session.

13 MEMBER contexts completed: exact participant-only IDs, no duplicates, participant present in returned roster, and intended safe field schema verified. The remaining context failed to complete because `supabase db query --linked --project-ref bflwaqlvnesuqoyikxar` timed out after **90 seconds** for `match-read-51799cc5-adda-4728-a36f-912e127bdde3.sql`. Python raised `subprocess.TimeoutExpired`; no backend SQL error or authorization mismatch was returned. The runner stopped before admin creator-data comparison, queue/API-route tests and final backend PASS. No retry, hotfix or permission widening was attempted after this gate failure.

Production browser at https://hainhobkhn-droid.github.io/B-B/ shows login, with no authenticated session available. Live MEMBER/ADMIN and Confirm/Reject mutations NOT RUN. No accounts, credentials or business fixtures created. Unlinked-profile safe behavior and arbitrary-player denial are locally PASS; not claimed verified on production data. PostgREST schema-cache/API visibility and authenticated JWT route verification remain NOT VERIFIED; catalog existence alone is not claimed as API proof.

## Release gate

Re-run local gates PASS: **21/21 frontend suites**, **11/11 backend/security tests**, JS/CJS syntax, Python AST, UTF-8/no BOM/U+FFFD=0/trailing whitespace and git diff --check. All 187 Calibration hashes remain unchanged. Match fixture databases cleaned and PostgreSQL fixture stopped.

Per MATCH-D failure rule, **STOP BEFORE FRONTEND COMMIT/PUSH**. Staged files/count: **0**. Implementation/documentation commit: NONE. Push/Pages/frontend asset parity verification: NOT RUN. Reviewed cache tag remains `member-match01-20261009-1` in the uncommitted frontend; production frontend still uses the previous source.

Final status: **BLOCKED — incomplete production verification due Management API timeout**. This is not a finding that deployed RPC logic is faulty. Production schema mutation: exactly approved migration only. Business-data mutation: NO. Calibration modified/staged/committed by Match package: NO. Next action requires resuming the outstanding read-only backend verification before any frontend stage/commit/push.

# 26. Read-only retry and five-filter preparation

This section supersedes section 25's timeout stop state. Migration was not reapplied; new production operations were read-only.

Backend gate PASS: 14 MEMBER SQL role/claim contexts return exact participant match IDs, without duplicates or foreign matches. ADMIN creator context has 80 rows and zero mismatches. The initial comparison against authenticated direct profiles SELECT reported 33 mismatches because profile RLS hid expected names. Comparing against privileged authoritative creator data resolves that verification artifact; production RPC was not changed. ADMIN My Matches denial and normal MEMBER creator-context denial PASS. Pending queue contains 8 rows with creator/rejected safety checks PASS. All three PostgREST routes resolve and reject anonymous EXECUTE with 42501, without PGRST202. Previously verified Rating projection mismatch remains 0; no Rating changes. Live authenticated browser/JWT sessions remain NOT RUN; SQL contexts and anonymous route visibility are not live session proof.

My Matches now has exactly five labeled controls: Tìm kiếm, Trạng thái, Từ ngày, Đến ngày, Số dòng / trang. Search/status/from/to combine with AND before pagination, preserving source order. Dates are inclusive calendar dates in Asia/Bangkok, independent of browser timezone. Invalid from>to explicitly reports an error and displays zero rows, without swapping dates. Existing MEMBER page sizes 20/50 are reused. Filter/size changes reset page 1, preserve other filters, and clearing filters preserves selected size. True-empty and filtered no-result remain distinct.

Shared paginatedList adds optional native date fields, validation and page-size selection. Existing consumers retain default behavior. Extended toolbar gives search more desktop width; existing mobile styles keep search full-width and remaining controls paired. Additional proposed scope: app.js shared helper and app.css five-line desktop-only sizing rule. index.html cache-bust includes those assets. No authorization or Confirm/Reject mutations changed.

Proposed exact release scope (nine files):

- matches.js
- app.js
- app.css
- index.html
- supabase/migrations/202610090002_member_my_matches_creator_context.sql
- supabase/tests/member-match-confirmation-local-test.py
- supabase/tests/member-match-confirmation-ui-test.cjs
- supabase/tests/member-match-browser-fixture.py
- PICK-MEMBER-MATCH-CONFIRMATION-MY-MATCHES-2026-10-09.md

Focused tests PASS: five labels/unique control IDs, search/status/combined filters, Bangkok date boundaries, inclusive dates, invalid range/no swap, 20/50 size changes, filter/page resets, pagination, true-empty/no-result. All 21 frontend suites PASS before the final CSS-only addition; final suite run recorded in console. Browser synthetic runtime PASS at Desktop 1280, Mobile 390 and Narrow Mobile 320: five controls, native date/size behavior, invalid range message, long names, no horizontal overflow. At 390 controls are approximately 343px search and 168px paired fields, heights >=45px; at 320 search is 288px and paired fields 140px. ADMIN/delegated management remains visible in fixture; delegated fixture is unlinked and shows the safe My Matches state. These are local fixture results, not live authenticated production UI verification.

Prepared extra files require explicit scope approval before staging. Staging count remains 0; commit/push/Pages deployment NOT RUN. Current status: PARTIALLY VERIFIED — local preparation complete, awaiting nine-file release scope approval; residual live authenticated role sessions NOT RUN. Production business-data mutation NO. Calibration artifacts untouched.


## Final expanded-scope review

The proposed release scope is now 13 files: the nine listed above plus supabase/tests/wp-c5-information-hierarchy-ui-test.cjs, supabase/tests/wp-c6-responsive-mobile-ui-test.cjs, supabase/tests/wp-c7-notice-focus-ui-test.cjs and supabase/tests/wp-c8-long-list-ui-test.cjs. Those four changes only update cache-tag assertions for changed app.js/app.css while retaining unchanged account.js/players.js tags. Initial final-run failures were stale cache assertions, not functional failures. All 21 suites were rerun after these corrections. Backend isolated regression rerun: 11/11 PASS. No shared consumer behavior or business contract changed. Extra-scope files remain unstaged pending approval.

# 27. MEMBER Match accordion alignment follow-up

This section supersedes the prior My Matches always-open placement and section 26's preparation structure. Backend gate remains PASS; production migration was not reapplied. No production SQL, business mutation, Confirm/Reject mutation or Rating change occurred in this follow-up.

## Architecture and reuse

MEMBER page keeps the confirmation/exception queue before Thao tác. Inside Thao tác, order is exactly Tạo trận của tôi → Trận đấu của tôi → Tra cứu trận đấu đã diễn ra. My Matches and history lookup use the existing shared actionAccordion, explicitly expanded=false. Create retains its navigation-intent behavior. No group is supplied, preserving the current independent multi-open behavior. ADMIN retains management workspace and a collapsed history lookup; no My Matches action is added to ADMIN.

The existing table desktop/mobile record-rendering block was extracted into tableRecords(host,title,data,columns,opts), used by table() and My Matches. It reuses the same table-wrap, table-mobile-cards, table-mobile-card-row, labels, values, typography and score-column structure. History's data source, sorting, filters and scope are unchanged. My Matches uses its RPC roster rather than broad table reads and does not infer creator identity. Both lists have the same seven column labels: Mã trận, Thời gian, Đội A, Tỷ số, Đội B, Thể thức, Trạng thái. Status remains a compact semantic badge. Both bodies use shared panel padding. No parallel mobile business workflow was introduced.

The five filters, AND combination, trimmed/case-insensitive search, Asia/Bangkok inclusive dates, explicit invalid range validation, 20/50 page sizes, page resets, preserved other filters and participant-only source remain. Lookup-layout options reuse existing tools/table-date-filter classes with shared pagination. Summary remains inside the closed accordion. True-empty text is Bạn chưa có trận đấu nào.; filtered no-result is Không tìm thấy trận đấu phù hợp với bộ lọc. Shared notice announces invalid range politely. Native hidden accordion bodies remove collapsed inputs from keyboard/accessible flow.

## Browser fixture evidence

All browser evidence is a synthetic disconnected fixture using current source, actual shared accordion, actual table(), actual tableRecords() and shared pagination. It is not production JWT/UI evidence.

| Check | Result |
|---|---|
| Initial order and closed state | PASS, all three MEMBER action headers observed in target order; My Matches/history aria-expanded=false and bodies hidden |
| Desktop 1280 | PASS, header 54px; both list panels padding 22px and table font 13px; same columns; no horizontal overflow |
| Mobile 390 | PASS, headers 50px; both panels padding 13px; both mobile cards padding 9px 10px, radius 12px; score visible; table view hidden; no overflow |
| Mobile 320 | PASS, full-width search ~236px and paired controls ~114px; input heights >=45px; score and pager visible; document width 320px, no overflow |
| Filters/date/validation | PASS, five fields; same-day inclusive returns 28 fixture records; From>To returns zero rows and shared polite validation announcement |
| Pagination | PASS, 20-row first page and 21–28 / 28 second page; 50 selection displays all 28 and preserves filters |
| Keyboard/collapsed controls | PASS, Enter opens and Space closes; aria-expanded updates; collapsed input/select nodes have no rendered client rects |
| ADMIN fixture | PASS, creator context remains visible, no My Matches, history initially closed; Mobile390 no overflow |
| Delegated fixture | PASS, target MEMBER action order plus approval workspace retained; safe-unlinked My Matches state; Mobile390 no overflow |
| Unrelated MEMBER fixture | PASS, My Matches true-empty state, no returned rows; Mobile390 no overflow |

Live authenticated production browser sessions remain NOT RUN. No production confirmation/rejection was performed to manufacture evidence.

## Regression and exact scope

All 21 frontend suites PASS, including focused filters, actual shared accordion/default collapse, actual desktop/mobile renderer and history-body integration. Existing confirmation/reject/edit/resubmit implementation remains unchanged except earlier title wording; isolated backend regression is rerun separately. Syntax/AST/UTF-8/no BOM/U+FFFD/trailing whitespace and Calibration preservation checks run before final report.

Within the approved thirteen-file scope, this follow-up modifies app.js (shared record-renderer extraction and lookup-layout options), matches.js (placement, shared accordions, record reuse), Match UI test, browser fixture, and this report. Existing cache changes and CSS sizing preparation remain. Migration is unchanged.

Exactly one additional file is needed outside that scope:

supabase/tests/wp-c4-action-accordion-ui-test.cjs — one assertion changes expected Match actionAccordion call count from 3 to 5, reflecting the two requested shared accordions. No other assertion or component behavior is changed. Initial suite failure 5 !== 3 was this obsolete count; after updating it, 21/21 suites PASS. The proposed complete commit scope is therefore 14 files, comprising the approved 13 plus this one test.

STOP BEFORE STAGING pending approval for that additional test. No files staged, no commit/push/Pages deployment. Current status: PARTIALLY VERIFIED — UI local/fixture gates PASS, production live role sessions NOT RUN, expanded scope approval pending. UI is locally ready for commit after that scope decision. No production mutation in this follow-up.


## Final gates and working tree

Backend isolated rerun: 11/11 PASS. Frontend: 21/21 PASS. Lookup table function is byte-equivalent to its pre-follow-up source except replacing its existing render block with the shared renderer call; filter/read/pagination logic unchanged. JS/CJS syntax, Python AST, UTF-8/no BOM/U+FFFD=0/trailing whitespace, git diff --check PASS. All 187 Calibration hashes unchanged. Staged count 0. Exact git status --short:

```text
 M analysis/rating-calibration01-b/monitor_checkpoint.py
 M app.css
 M app.js
 M index.html
 M matches.js
 M supabase/tests/wp-c4-action-accordion-ui-test.cjs
 M supabase/tests/wp-c5-information-hierarchy-ui-test.cjs
 M supabase/tests/wp-c6-responsive-mobile-ui-test.cjs
 M supabase/tests/wp-c7-notice-focus-ui-test.cjs
 M supabase/tests/wp-c8-long-list-ui-test.cjs
?? PICK-MEMBER-MATCH-CONFIRMATION-MY-MATCHES-2026-10-09.md
?? PICK-NEXT-CHAT-HANDOFF-2026-10-04.md
?? PICK-RATING-CALIBRATION01-B3-SEALED-FORECAST-2026-10-08.md
?? PICK-RATING-CALIBRATION01-B3A-TRUSTED-EVIDENCE-2026-10-08.md
?? PICK-RATING-CALIBRATION01-B3B-END-TO-END-WORKFLOW-2026-10-08.md
?? analysis/rating-calibration01-b3/
?? analysis/rating-calibration01-b3a/
?? analysis/rating-calibration01-b3b/
?? audit-output.txt
?? supabase/.temp/
?? supabase/migrations/202610090002_member_my_matches_creator_context.sql
?? supabase/tests/member-match-browser-fixture.py
?? supabase/tests/member-match-confirmation-local-test.py
?? supabase/tests/member-match-confirmation-ui-test.cjs
```

# 28. Shared My Matches / History filter alignment

This section supersedes the separate filter implementations and paired-column personal mobile layout described in sections 26–27. It is a frontend-only follow-up; production backend and migration remain unchanged.

Both surfaces now call one matchLookupList component, built on existing paginatedList. My Matches provides its RPC dataset, display-status resolver and roster search. History opts into the same component inside table(), preserving the existing loaded matches dataset, recent ordering, matchCols and tableRecords renderer. The opt-in is confined to Match lookup; other table consumers retain their existing path. There are no new reads, RPCs or authorization decisions.

Shared contract: Tìm kiếm → Trạng thái → Từ ngày → Đến ngày → Số dòng / trang → Xóa bộ lọc. Both use native labeled controls, the same page-size text (20 / 50 for MEMBER; ADMIN history retains its existing 100 option), the same neutral clear button, and result count immediately below the toolbar. Clear is disabled when search/status/dates are empty and preserves page size. Search is trimmed/case-insensitive, all filters combine with AND, changes reset page 1 while preserving other values, and pagination preserves source ordering. Both use inclusive Asia/Bangkok calendar dates through matchLookupDate and the same invalid-range message/notice. My Matches remains participant-only with no arbitrary Player input.

One shared stylesheet targets match-lookup-filter-toolbar / match-lookup-filter-field / match-lookup-filter-label. Desktop uses the same six-column grid, with widest search, matched From/To widths, compact page size and clear on the same row. At the existing 700px breakpoint both use one full-width column. Control and clear height is 46px. Label typography, gap, border/radius and result-count classes are shared; neither list has its own filter CSS block.

| Verification | Result |
|---|---|
| Desktop1280 parity | PASS: both toolbar widths ~992px and same left edge; search ~277px, status ~173px, dates ~138px each, size ~104px, clear ~111px; all heights 46px, radius 11px, font 16px |
| Mobile390 parity | PASS: both one column, all controls/clear ~291px wide and 46px high; filter/result left edges identical, no overflow |
| Mobile320 parity | PASS: both one column, controls/clear ~236px wide and 46px high; scores visible, document scroll width 320px |
| Field order/page-size/reset/count | PASS: exact same labels/order, options 20/50 text, disabled clear initially/after reset, count below toolbar |
| Browser combined filters | PASS: trimmed uppercase search + approved status gives 10 matching rows in each fixture surface |
| Browser inclusive day / invalid day range | PASS: inclusive same-day preserves 10 combined matches; invalid From>To blocks rows and reports same message on both |
| Browser size/reset | PASS: clear restores all filters, then selecting 50 yields 1–28 / 28 kết quả in both surfaces |
| Focused actual-source tests | PASS: both real component paths, same fields/classes/size options, search/status/reset/dates/validation/pagination |
| All frontend suites | PASS: 21/21 |

All runtime evidence uses the disconnected browser fixture; authenticated production UI remains NOT RUN. No production data or schema mutations, no migration application, no Rating/Calibration work.

Files changed in this follow-up: app.js, app.css, matches.js, supabase/tests/member-match-confirmation-ui-test.cjs, supabase/tests/member-match-browser-fixture.py, and this report. No new file outside the approved frontend/report scope. The previously prepared wp-c4-action-accordion-ui-test.cjs one-line count correction remains unchanged and still awaits separate release-scope approval. Nothing is staged; no commit/push/deploy.

Final local result: UI FILTERS ALIGNED. Package verification remains PARTIALLY VERIFIED because live authenticated production browser sessions were not run and prior extra-test release scope is pending. The earlier assertion that table() changed only by renderer extraction applies to the preceding follow-up; this follow-up additionally introduces the explicit Match-only shared-filter opt-in described above.


Current git status --short (prior unrelated changes preserved):

```text
 M analysis/rating-calibration01-b/monitor_checkpoint.py
 M app.css
 M app.js
 M index.html
 M matches.js
 M supabase/tests/wp-c4-action-accordion-ui-test.cjs
 M supabase/tests/wp-c5-information-hierarchy-ui-test.cjs
 M supabase/tests/wp-c6-responsive-mobile-ui-test.cjs
 M supabase/tests/wp-c7-notice-focus-ui-test.cjs
 M supabase/tests/wp-c8-long-list-ui-test.cjs
?? PICK-MEMBER-MATCH-CONFIRMATION-MY-MATCHES-2026-10-09.md
?? PICK-NEXT-CHAT-HANDOFF-2026-10-04.md
?? PICK-RATING-CALIBRATION01-B3-SEALED-FORECAST-2026-10-08.md
?? PICK-RATING-CALIBRATION01-B3A-TRUSTED-EVIDENCE-2026-10-08.md
?? PICK-RATING-CALIBRATION01-B3B-END-TO-END-WORKFLOW-2026-10-08.md
?? analysis/rating-calibration01-b3/
?? analysis/rating-calibration01-b3a/
?? analysis/rating-calibration01-b3b/
?? audit-output.txt
?? supabase/.temp/
?? supabase/migrations/202610090002_member_my_matches_creator_context.sql
?? supabase/tests/member-match-browser-fixture.py
?? supabase/tests/member-match-confirmation-local-test.py
?? supabase/tests/member-match-confirmation-ui-test.cjs
```


# 29. Final MATCH-D approved release scope

User directly approved V2 manual filter-pattern addition and the one-line WP-C4 count assertion. Review confirms prior V2 text unchanged, only Shared Data List Filter Pattern appended. WP-C4 diff only changes 3 to 5. Final approved scope is the following 15 files; no Calibration or unrelated files included:

- app.js
- app.css
- matches.js
- index.html
- docs/PICK-UI-SYSTEM-V2.md
- supabase/migrations/202610090002_member_my_matches_creator_context.sql
- supabase/tests/member-match-confirmation-local-test.py
- supabase/tests/member-match-confirmation-ui-test.cjs
- supabase/tests/member-match-browser-fixture.py
- supabase/tests/wp-c4-action-accordion-ui-test.cjs
- supabase/tests/wp-c5-information-hierarchy-ui-test.cjs
- supabase/tests/wp-c6-responsive-mobile-ui-test.cjs
- supabase/tests/wp-c7-notice-focus-ui-test.cjs
- supabase/tests/wp-c8-long-list-ui-test.cjs
- PICK-MEMBER-MATCH-CONFIRMATION-MY-MATCHES-2026-10-09.md

Frontend 21/21, backend 11/11, V2/source regression, browser fixtures 1280/390/320, syntax/AST/UTF-8 and git diff --check PASS. Production schema/business mutation in this release NO; already deployed migration is included solely for source parity and is not reapplied. Live authenticated production browser remains NOT RUN. Deployment evidence follows verification; final state must remain DEPLOYED / PARTIALLY VERIFIED if no authenticated session is available.

# 30. MATCH-D deployment evidence

Implementation commit: `07675508dc4d767e058ce9116f4d95f224dc7dff`. Exactly 15 approved files committed and pushed on main; no Calibration/unrelated files. HEAD == origin/main verified after push. Pages workflow SUCCESS: https://github.com/hainhobkhn-droid/B-B/actions/runs/37896302058.

Production index.html/app.js/app.css/matches.js exactly match committed bytes. Cache tag `member-match01-20261009-1` verified both in served HTML and live browser DOM. Asset SHA-256:

- index.html: `386038af14d4558250236f3f6bb1050a53577316620f5af7bf59a5082920d11c`
- app.js: `bf7fd1bcf1724287ce7ccfcf20f8661f0683c8b4bac86ee823e6463f5e48c564`
- app.css: `b5404e0b2e296c0c65b74d255bdced8f17a6c37eeefe5b2981447b99b87f26d8`
- matches.js: `f615438981c974e7f70c3c740b422ad76e879ff6ba7b1950de23e376dbcd5c97`

Production login runtime loads successfully; no authenticated browser session exists, so live MEMBER/delegated/ADMIN Match actions remain NOT RUN. No account/credential creation or production Confirm/Reject actions were performed. A disconnected fixture built from the exact served app.js/app.css/matches.js bytes PASS at 1280/390/320: two identical shared filter grids, correct one-column mobile layout, no overflow/runtime errors, same trimmed search results. This is production-byte fixture evidence, not live JWT/E2E evidence.

Pre-commit staged gates: frontend 21/21, isolated backend 11/11, V2 regression, desktop/mobile fixtures, syntax/AST/UTF-8 and cached diff check PASS. V2 diff only appends Shared Data List Filter Pattern; WP-C4 diff only changes count 3 to 5. No production SQL/migration or business-data mutation during MATCH-D. Previously deployed migration was committed for source parity only, not reapplied.

Final status: **DEPLOYED / PARTIALLY VERIFIED**. Residual gap: live authenticated Match UI sessions. Calibration artifacts remain unchanged and outside all Match commits. Documentation-only evidence update follows the implementation commit; no frontend source change.
