# 1. Scope

WP-C8 preparation against HEAD/origin/main `ca44d3f16e53d70b250770f5ace16b3faaefd900`. Tracked tree was clean; eight unrelated untracked entries remain untouched. No stage, commit, push, deployment, production business mutation, backend/RLS/Edge/migration/capability change or Rating calculation change.

Authoritative contract: `docs/PICK-UI-SYSTEM-V2.md`, especially sections 5–12, 18–19, 25–28, 30, 32–36. V1 is historical except patterns retained by V2. Page size 20 follows V2's Players/Matches defaults. Ranking/recognition use the same size as an implementation choice; V2 does not prescribe their exact size. No infinite scroll or virtual scrolling.

Read project state, reconciliation, WP-C6/WP-C7 reports, AGENTS and relevant current source boundaries in app.js, players.js, matches.js, account.js, fund.js, app.css and index.html. Source wins over old report wording: the historical WP-C6 statement that Players already retained pagination is inaccurate for this baseline; playerDetailSection rendered all playerRows.

Backup: `C:\Users\hainh\.codex\.chatgpt-projects\g-p-6a9ef55bf47881919ff2a6045b843a72\wp-c8-backup-20261005`. Initial six assets and cache-test files copied before writes; original versions of three additional harness files retained from clean HEAD. Exact replacement assertions stopped before any write on ambiguous boundaries.

# 2. Current list inventory

VERIFIED CURRENT source inventory; runtime counts are from the existing ADMIN localhost session, not a fresh production-origin login.

| Surface | Data / role visibility | Existing order / controls | Baseline rendering / states | Decision |
|---|---|---|---|---|
| Players directory | state players; ADMIN direct SELECT; delegated player/lifecycle managers get_member_management_players; other MEMBER get_player_directory plus own contact read | ACTIVE first, then Vietnamese name; no directory search/filter/pager | All 25 cards, including hidden detail/history DOM; shared source/error panel; true empty paragraph | Search + status/type filter + pagination |
| Main Ranking | ranking() derives state players + current-version rating_events; backend loader/RLS/RPC scope unchanged | ACTIVE CLUB with official minimum Rated matches; rating DESC/name; tied global competition ranks | All 14 eligible cards; detail exclusive-open; separate MEMBER own history | Search + pagination; no new eligibility filter |
| Account primary member directory | ADMIN get_admin_member_lifecycle(p_limit=25,p_offset); current session 16 rows | Server order preserved; page-local name/nickname/email search; membership and active filters; server pager | At most 25 fetched rows, one inline detail. Existing loading/error notices. Stale details toggle listener prevented initial lazy load under shared accordion | Existing search/filter/pagination retained; explicit count/reset + repair open callback |
| Account pending review / permissions / birthday | ADMIN pending queue first 5; selected approval/perms workflows; permissions reader limit 50; birthday shared table | Pending-first hierarchy; selected record editors; existing paging/search as applicable | Not an all-member editor wall. No new total/search contract invented | No change needed |
| Match management status groups | ADMIN/delegated canApproveMatches; state matches + lineup + players | Existing PENDING → APPROVED → INVALID → VOIDED; played_at DESC then match_number DESC | All 60 approved, 3 invalid, 1 voided cards, even in collapsed groups; empty group text | Search + pagination per existing status group |
| Match lookup/history | Existing role-scoped loader; management/member Match RPCs for non-ADMIN | Shared table search/status/date, default 20 and page-size choices | Already paginated; load error distinct from no result | No change needed |
| MEMBER confirmation/rejected queue | get_my_pending_match_confirmations + authoritative can_confirm/creator rejection | Existing personal action priority and P1.2/P1.2b handlers | Actionable rows rendered together; actual MEMBER queue size not observed in this session | Defer queue-specific scaling until populated role evidence; do not alter eligibility/workflow |
| Contribution/Cống hiến | Derived active CLUB participation + approved Matches/lineup + authorized fund_contributions snapshot | Existing three recognition orders/tied ranks; top 3 podium; exclusive detail | Three all-row detail tables; representative first table 14 rows. Missing sources stop summary before render | Search + pagination in detail tables; top 3 unchanged |
| Fund obligations/payments/ledger | Existing authoritative NET read models and capability-specific RPCs | Debt/obligation/history pagers 20; batch preview 10; history search and local business filters | Already bounded list/history DOM; distinct unavailable/read-model states | No change needed; fund.js unchanged |

# 3. Dataset/scalability assessment

Current data is modest, but all-at-once Players/Ranking/approved Match groups and recognition details grow without a DOM bound. Client paging is appropriate because these surfaces already consume loaded snapshots. Generic direct-table loader still fetches up to 10,000 rows; RPC snapshot sizes remain backend-defined. This package bounds rendered rows, not network transfer, aggregate computation or database result size.

No backend pagination redesign. Account already has backend paging; fetching every page to simulate global search would defeat its current contract and was not added.

# 4. Players

Reuse existing card renderer inside shared paginatedList(), 20 per page. Search displayed player name via existing playerName(); case/trim/accent-insensitive. AND filters use only existing ACTIVE/INACTIVE and CLUB/GUEST. Preserve ACTIVE-first/name sort, card/rating/detail markup, private-field handling, create/edit/lifecycle/promotion/initial-rating/hard-delete gates and RPC payloads. Read filters do not authorize actions.

Error/true-empty directory remains explicit. Filtering to zero produces a different no-result message. Offline lifecycle fixture now checks the actual prohibited action button rather than mistaking the read-only INACTIVE filter label for a management action.

# 5. Ranking

ranking() is unchanged. Filtering/slicing occurs after full eligibility/sort/global rank derivation. Visible explanatory text says ranks are global. Real ADMIN search `PHAM QUANG` returned one card still showing #5. Ties remain 1,1,3 in actual-function tests. No invented status/type filter: all ranked rows already satisfy the existing active CLUB contract.

Keep one open detail and stable toggle IDs, own-member history section and existing rating/data scope. Ranking scale fixture uses actual ranking() in CJS plus the shared pager; synthetic browser Ranking cards are a control/layout fixture, not a claim of executing the complete Ranking page with 100 production records.

# 6. Account

Preserve 25-row backend pages, page-local search/filter wording, pending hierarchy, one inline detail, lifecycle/permissions and ADMIN-only boundary. Add reset button and polite result count labelled as current-page count. Do not label it as club-wide total or global search.

Verified regression repaired: adminMemberLifecycle listened for native details toggle/open after WP-C4 migrated its wrapper to shared button/panel. accountAction now forwards an optional loader returned by its content renderer into the existing onOpen callback. Only the primary lifecycle directory returns that loader. Its open checks use panel hidden state. Shared actionAccordion() itself is unchanged. Reload/write/stale-response guards and offset stay unchanged.

Browser after repair: 16 rows load on opening; no-result is 0/16; APPROVED AND active gives 14/16. Search `test` gives 1/16 at 390px. One inline detail opens directly under its row. Server page-boundary runtime is not manufactured because this session has fewer than 25 entries; existing RPC paging contract and fixtures remain PASS.

# 7. Matches

Each existing management status group gets shared search and a 20-card page. Participant search explicitly joins teamA and teamB arrays from matchPlayerNames(), not stringifying the team object. Preserve existing group order/count badges, sort, action handlers, participant eligibility and P1.2/P1.2b edit/resubmit flow.

Approved next page displays 21–40/60. Searching PHAM QUOC HUY finds 18 matches and resets to page 1. Mobile no-result disables both navigation buttons. Existing general lookup table remains unchanged. Personal confirmation queue scaling remains a documented deferred item, not an assertion that its live size is small.

# 8. Contribution

This surface is recognition, not a new payment portal. Keep recognition calculations, original global/tied rank fields, columns, top-three podium and exclusive detail behavior. Only detail table tbody is paged, with search across its existing displayed values. No payment state/date semantics invented.

Expanded first table search PHAM finds 2 rows. At 390px the existing 590px detail table scrolls inside table-wrap; page scrollWidth remains 390. This package does not redesign those business tables. Fund page and all Fund authoritative NET behavior unchanged.

# 9. Shared controls

paginatedList() in app.js is a small vanilla helper used by Players, Ranking, Match management and recognition details. Dependencies: native el/button, existing fold, notice and session identity for UI context only. API supplies root/key/data/content/renderRows/searchText/searchLabel, optional existing-state filters, page size, empty text and unavailable flag. It contains no role/capability/eligibility/RPC logic.

Module ctx adds only paginatedList to Players/Matches. Account keeps its distinct backend pager. Existing generic table/Fund pagers are not rewritten. Shared controls have unique native label/control IDs and stable controls while only list rows redraw.

# 10. Search behavior

Use existing fold() normalization: NFD combining accents removed, Đ/đ folded, lower case; trim query for matching. Empty query restores all authorized loaded rows in original order. Reset clears search and filters. Selected data is never fetched from another scope to satisfy search.

Account retains its existing Unicode/case-insensitive page-local search helper; accent-insensitive expansion of that separate contract is not added. Query/filter/page state for the four new client-list patterns is kept across same-session page rerenders in a session-keyed map; it is not shared between accounts or persisted to storage.

# 11. Filter behavior

Players uses only existing type/status options. Search and filters are AND. Account retains existing PENDING/APPROVED/REJECTED and active/inactive account options, distinct from Player status. Ranking and recognition add no inappropriate filters. Match existing status group is the filter boundary; no duplicate status dropdown.

# 12. Pagination behavior

Default 20. Search/filter/reset returns client page to 1; refresh clamps retained page after data shrinks. Native previous/next disabled at boundaries, including zero results. Range/filtered-total and page/total-pages visible. Pagination preserves source order; no sort control or infinite scroll added. Account's existing page-local filters do not implicitly switch its server offset; global server search/filter remains deferred.

# 13. Empty/no-result states

Shared helper distinguishes real empty data, filtered zero results and unavailable source. App's existing busy render/loading screen prevents premature page rendering. Players/Ranking source errors are not described as legitimate empty lists. Contribution keeps its existing ready() gate. Account loader retains loading/error notices and does not convert authorization failures into successful empty data. Count only states current authorized snapshot/filter scope.

# 14. Responsive/mobile

ADMIN localhost Desktop 1280px: Players/Ranking/Account/approved Match group/expanded Contribution search and reset verified. Players live next/prev and Match group next verified. Ranking live has 14 records, so large-page behavior covered with fixtures.

390px: Players page/filters/no-result/reset, Ranking name search/global #5, Account search/reset/one inline detail, Match page/no-result/reset and Contribution expanded table verified. Page scrollWidth equals viewport. 320px Players/Ranking also equal viewport; native pager buttons 44px high. Ranking keyboard detail retains its toggle focus and ARIA expanded state. Existing WP-C6 name wrapping/card structures retained.

Offline browser fixture: actual Players module, 100 synthetic mixed-state/type rows and long Vietnamese names; 20 rendered, no page overflow at 320px, Unicode search resets page. Synthetic Ranking header/control fixture: 100 rows, native keyboard next/prev, #21 on page 2, long-name search/wrapping with no page overflow. No Supabase client, credentials, session or seed data in fixture.

# 15. Accessibility

Native separately associated labels/input/select/buttons, no excessive ARIA. Result count changes delivered through existing WP-C7 polite notice channel; the delivery target sits in sr-only host, preventing duplicate visible notices. Initial client-list render/refresh is silent; unchanged notices are deduplicated by notice(). Account count is a single implicit polite role=status updated only when text changes. No assertive alert for normal search/no-result. Native disabled navigation; existing focus-visible styling retained.

Actual screen-reader speech not tested. Keyboard detail/pager and DOM semantics verified; this is not a WCAG certification. Delegated and normal MEMBER authenticated browser sessions were unavailable; offline permission/regression fixtures PASS, without inventing live role evidence or creating accounts.

# 16. Performance

| List | Before | After / bound |
|---|---:|---:|
| Live Players cards | 25 | 20 first page, 5 second |
| Synthetic Players cards | 100 | 20 |
| Live main Ranking cards | 14 | 14, bounded to 20 |
| Synthetic Ranking helper | 100 | 20 |
| Approved management Match cards | 60 | 20 per page |
| All populated management status groups | 64 | 24 initially: 20 approved + 3 invalid + 1 voided |
| First recognition detail tbody | 14 | 14, bounded to 20 |
| Account directory | Server limit 25 | Same limit 25; live 16 |

Counts are DOM record bounds, not a latency/memory benchmark. Player detail histories still use existing hidden/detail construction for current page; extensive history-specific paging/aggregate optimization is deferred. No claim that client paging fixes full-snapshot transfer or algorithm complexity.

# 17. Tests

PASS all 18 frontend CJS suites (17 existing + WP-C8). Includes Account/IAM, ACC05, forced password, dashboard NET, Fund04, Player lifecycle, initial rating, WP-C2 promotion, WP-C3 League, WP-C4 accordion, WP-C5 hierarchy, WP-C6 responsive and WP-C7 notice/focus.

New real-helper tests: 25/100 rows; accent/case/trim; AND filters; reset/page clamp; native disabled pager; true empty versus no-result versus error; per-account context isolation; actual global/tied ranking function; Account page-local filters; shared Account lazy-open callback. Three old module harnesses now inject the actual helper using wp-c8-list-fixture.cjs rather than a fake pager. Cache assertions changed only for changed assets.

PASS 24 JS/CJS syntax checks plus browser fixture inline script; 18 Python AST checks; UTF-8 no BOM, U+FFFD=0, no trailing spaces/tabs; git diff --check. No staging. New file EOF checked explicitly because untracked files are not covered by git diff --check.

Run: `node supabase/tests/wp-c8-long-list-ui-test.cjs`; run every `supabase/tests/*test.cjs` separately. Browser fixture: `http://localhost:8000/supabase/tests/wp-c8-browser-fixture.html`. Main browser smoke used existing ADMIN session with read-only interactions; no captured console errors.

# 18. Deferred server-side scalability

Full-snapshot transport/10,000-row cap, global Account server search/filter/total contract, large selected Rating histories and large personal pending Match queue require measured follow-up. No RPC changes invented. Remaining WP-C9 capability-surface findings (Audit/can_adjust_rating and live role parity/source gaps) remain untouched; WP-C8 does not close backend/source or MEMBER browser verification gaps from earlier packages.

# 19. Deployment plan

Exact WP-C8 files (16):

- app.js
- account.js
- players.js
- matches.js
- app.css
- index.html
- supabase/tests/player-lifecycle01e-ui-test.cjs
- supabase/tests/rating-initial01c-ui-test.cjs
- supabase/tests/wp-c3-league-data-source-ui-test.cjs
- supabase/tests/wp-c5-information-hierarchy-ui-test.cjs
- supabase/tests/wp-c6-responsive-mobile-ui-test.cjs
- supabase/tests/wp-c7-notice-focus-ui-test.cjs
- supabase/tests/wp-c8-list-fixture.cjs
- supabase/tests/wp-c8-long-list-ui-test.cjs
- supabase/tests/wp-c8-browser-fixture.html
- PICK-WP-C8-LONG-LIST-2026-10-05.md

Only five changed assets use `wp-c8-long-list-20261005-1`: app.js, account.js, players.js, matches.js, app.css. Unchanged fund.js retains WP-C5 cache tag. Nothing deployed or staged. Preserve all unrelated entries; later deployment requires separate approval and production asset/runtime verification.

# 20. Final status

**PARTIALLY VERIFIED.** Implementation, all local gates and ADMIN Desktop/390px/320px representative smoke PASS. Residual authenticated delegated/normal MEMBER browser evidence, actual screen-reader speech and populated backend Account page-boundary/runtime coverage are explicitly not claimed PASS. No known implementation blocker remains from observed WP-C8 regression; the primary Account lazy-load regression was repaired and verified.

Production mutation = NO. Stage/commit/push/deploy = NO. WP-C9 not started.
