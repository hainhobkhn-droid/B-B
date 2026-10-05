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

## 20. WP-C6D deployment evidence

The preparation record above is historical. Direct user approval authorized this deployment and a report-only follow-up commit.

- Implementation commit: `0da7b380768c08de60c8a9f822ff02362137a548`, exactly five reviewed files.
- Pre-deploy source drift: PASS. Only responsive CSS, stylesheet cache tag and corresponding tests/report changed; no application JS, business DOM order, RPC, backend or capability changes.
- Pre-commit gates: all 16 frontend CJS suites PASS, 21 JS/CJS syntax checks PASS, 18 Python AST checks PASS, UTF-8/no BOM/no U+FFFD/trailing whitespace PASS, staged diff check PASS.
- Initial push was blocked by automatic approval review. After direct user confirmation, normal push `main -> origin/main` succeeded; HEAD and origin/main both equal the implementation SHA.
- GitHub Pages workflow [37285502683](https://github.com/hainhobkhn-droid/B-B/actions/runs/37285502683): completed / success for this SHA. GitHub deployment status success; published URL https://hainhobkhn-droid.github.io/B-B/.
- Served index stylesheet tag: `wp-c6-responsive-mobile-20261005-1`, PASS. The five unchanged JS tags retain WP-C5.
- Exact byte/SHA-256 parity PASS for app.css, app.js, account.js, players.js, matches.js and fund.js. CSS SHA-256: `3af47a81f23e37b75444f0d98086fd24b953b753b6968d96676ee2cffa5e64a1`.

### Runtime evidence and limitations

Production-origin tab had no authenticated session and displayed login. No credentials were copied/entered and no account was created. Authenticated ADMIN smoke used the existing localhost session on the six byte-identical served production assets. This is production-asset runtime verification, not a claim of authenticated production-origin browser execution.

- Desktop 1280px: eight pages PASS for navigation/layout and no page overflow.
- Mobile 390px: eight pages PASS for navigation/layout and no page overflow.
- Narrow 320px: Matches, Players, Ranking and Contribution PASS for navigation/layout and no page overflow.
- Ranking retains rank, name, rating and match count; long names wrap. Narrow screens naturally require more name lines; no sorting/formula/own-player scope changed. ADMIN session cannot prove normal MEMBER own-player context.
- Contribution remains recognition/Cống hiến, not a separate obligations portal. Financial obligations, amounts and status are Fund surface data. Contribution summary values remain readable; exhaustive expanded history permutations NOT RUN.
- Expanded Player create, Match create, Fund collection, Tournament create and Account member-create forms at 390px: PASS for opening and page overflow, respectively 7/15/7/9/5 visible fields. No submit or mutation. Account screenshot inspected. No captured console errors in the smoke session.
- Populated Match/Fund/Contribution expanded-history permutations: NOT RUN / residual gap; no destructive or payment action used to manufacture data.
- Delegated MEMBER browser: NOT RUN. Normal MEMBER browser: NOT RUN. Existing offline permission fixtures PASS; no new production identity created.
- WP-C5 hierarchy, WP-C4 shared accordion, WP-C3 League, WP-C2 promotion and Match P1.2/P1.2b regression suites PASS. No ad-hoc runtime source patch.

### Final deployment gate

**DEPLOYED / PARTIALLY VERIFIED.** Pages publication and asset parity PASS; ADMIN production-asset desktop/mobile runtime PASS. Missing authenticated production-origin/delegated/normal sessions and exhaustive expanded-history states remain explicit verification gaps. Do not claim CLOSED.

Production business/database mutation = NO. No SQL/migration/Edge deployment. WP-C7/WP-C8/WP-C9 not started. Remaining accessibility/live-region and large-dataset/search concerns are deferred. Report-only documentation follow-up is allowed; no additional source is staged.
