# WP-C6 Responsive / Mobile Density — 2026-10-05

## 1. Scope

Preparation only against HEAD d7642765da4b417f49c16b6e0489637f052411c9. No stage, commit, push, deploy, backend changes or production business mutation. Application JS and authorization/workflow order are unchanged. Backup: C:\Users\hainh\.codex\.chatgpt-projects\g-p-6a9ef55bf47881919ff2a6045b843a72\wp-c6-backup-20261005.

## 2. V2 responsive contract

docs/PICK-UI-SYSTEM-V2.md is authoritative; V1 is historical. Preserve compact comparison rows, readable decision data, wrapping names, semantic colors, shared components, role-specific workflows and business order across desktop/mobile. Action Accordion header approximately 49–58px and icon approximately 27–32px remain governed by WP-C4. No changes to actionAccordion(). A 44px touch target follows existing implementation convention; it is not an exact size mandated by V2. Exact card heights and the new spacing values are implementation choices, UNSPECIFIED BY V2.

## 3. Mobile audit

ADMIN localhost browser: Overview, Matches, Players, Ranking, Fund, Contribution/Cống hiến, Tournament and Account checked at 390px; all eight additionally checked at stable 320px viewport. documentElement.scrollWidth equals 320px for all eight. Initial measurements taken immediately after viewport switching were transient and discarded; stable viewport observation is the overflow evidence.

## 4. Matches

Keep existing lookup cards and management cards. Reduce lookup padding/gap and label column to 76px; seven existing fields remain visible. Typical lookup card height at 390px reduced 245px to 211px. Management teams use three comparison columns, names wrap and action targets have minimum 44px height. No edit/resubmit or approval behavior changed.

## 5. Players

Compact identity/rating/detail header with wrapped names. Typical closed card reduced 123px to 66px at 390px; long names increase height naturally. Detail/lifecycle/promotion contracts and authorization are unchanged.

## 6. Ranking

Preserve rank/name/rating/match count/detail comparison in one mobile row. Typical card reduced 106px to 64px at 390px. Long names wrap; height is content-driven. No rating formula, sorting or data scope change.

## 7. Fund

No Fund source/style changes required. Existing compact workspaces retained. ADMIN mobile debt list and collection form opened read-only; no page overflow observed. No payment submitted. Matrix/history internal scrolling remains existing behavior; exhaustive populated history permutations not tested.

## 8. Contribution

This is the recognition/Cống hiến surface, not a financial payment portal. Reduce card/icon/podium spacing; retain long names without ellipsis, align values, and increase detail toggle to 44px minimum. Typical summary cards reduced 442/424/424px to 331/315/315px at 390px. Expanded history table permutations remain a verification gap.

## 9. Tournament

Existing ready-empty surface checked desktop/mobile; no style/source changes. Populated competition and registration states were not created for visual testing.

## 10. Account/Admin

Existing collapsed ADMIN surface checked desktop/mobile; no style/source changes. Inline member details, search/filter/pagination and business actions remain covered by existing suites. Exhaustive expanded long forms were not browser-tested in this package.

## 11. Long-list findings

Players and Matches retain existing list pagination. Density improved without removing decision data or inventing a second mobile business DOM. Ranking still grows with dataset size; no pagination added.

## 12. Touch targets

Overview shortcuts/hero actions, Match actions, Ranking details and Contribution details use minimum 44px height. Existing Player details already meet this convention. No claim of exhaustive accessibility compliance (WP-C7 deferred).

## 13. Overflow/wrapping

Overview short leaderboard now fits mobile container rather than retaining 590px table minimum. Names wrap in Player/Ranking/Contribution rows. No new horizontal-scroll workaround or hidden decision fields. Eight top-level surfaces passed page overflow check at 320px and 390px.

## 14. Desktop verification

ADMIN localhost 1280px smoke across all eight surfaces. New CSS is scoped to max-width:700px; desktop density/order remain unchanged. No production browser verification claimed.

## 15. Mobile verification

ADMIN local 390px screenshots inspected for Ranking, Players and Fund; Match lookup measured after reload/data readiness. 320px stable overflow checks passed across all eight surfaces. Delegated MEMBER and normal MEMBER live browser sessions: NOT RUN, no credentials/accounts created. Offline permission fixtures PASS. Expanded populated histories/long forms and Tournament populated state remain residual gaps.

## 16. Tests

- All 16 frontend CJS suites PASS, including WP-C2/C3/C4/C5/C6, Player lifecycle, initial rating, Account/IAM and Fund regressions.
- JS/CJS syntax: 21 files PASS.
- Python AST: 18 existing test files PASS; no Python source changed.
- UTF-8, no BOM, no U+FFFD and trailing whitespace checks PASS on changed implementation/tests.
- git diff --check PASS; Git CRLF conversion warnings are informational.
- New WP-C6 test asserts CSS scope, wrapping/comparison rows, touch heights, unchanged business DOM and asset cache scope. It is a static regression, not a replacement for browser screenshots.

## 17. Deferred scalability/search issues

No search/filter/pagination work added. Ranking large-dataset scaling and exhaustive long-form/expanded history visual fixtures require a later package. WP-C7 accessibility/live-region and WP-C8/C9 remain out of scope.

## 18. Deployment plan

Changed files: app.css, index.html, supabase/tests/wp-c5-information-hierarchy-ui-test.cjs, supabase/tests/wp-c6-responsive-mobile-ui-test.cjs, this report. Only CSS cache tag changed to wp-c6-responsive-mobile-20261005-1; five JS assets retain WP-C5 tag. Nothing staged. Preserve unrelated untracked workstreams. Production deployment and asset verification require separate authorization.

## 19. Final status

PARTIALLY VERIFIED. Local implementation/static regression and ADMIN top-level desktop/mobile smoke PASS. Residual role-session and expanded-state browser coverage above prevents claiming comprehensive runtime verification. Production mutation = NO; stage/commit/push/deploy = NO.
