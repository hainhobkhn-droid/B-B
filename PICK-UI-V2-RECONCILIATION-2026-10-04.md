# PICK WEBAPP — WP-B Full UI/UX & PICK UI System v2 Reconciliation

Ngày audit: 2026-10-04

Repo baseline: `76a4cbd feat: split player management permissions`

Phạm vi: read-only UI/UX reconciliation. Không sửa application source, backend, production hoặc dữ liệu. Không commit/push/deploy.

# 1. Executive summary

WP-B đã review 10 surface theo 6 context role × device. Runtime read-only dùng session ADMIN hiện có tại localhost với viewport desktop 1280px và mobile 390px. Delegated MEMBER và normal MEMBER được review bằng source/static evidence vì không có session phù hợp; các kết luận cần role runtime được giữ là `UNKNOWN / NEEDS RUNTIME`.

Kết quả:

- 24 findings: P0 = 3, P1 = 17, P2 = 4.
- UI CONTRACT MISMATCH = 8.
- FUNCTIONAL UI BUG = 2.
- AUTH PRESENTATION MISMATCH = 3.
- RESPONSIVE ISSUE = 3.
- SHARED-COMPONENT DRIFT = 3.
- ACCESSIBILITY = 3.
- TECH DEBT = 1.
- UNKNOWN / NEEDS SOURCE = 1.

Ba P0:

1. `RATING-SCOPE01` đang được frontend tiêu thụ và có thể hiển thị lịch sử Rating của Player khác cho MEMBER. Đây là biểu hiện UI của production issue đã VERIFIED OPEN; UI không phải security fix.
2. Delegated Guest→Member có đúng action gate nhưng Guest candidate direct SELECT bị production RLS scope xuống own Player, thường tạo false-empty “không có VĐV khách” hoặc lỗi tải; workflow không dùng được.
3. Match League selectors đọc `rows('leagues')` trong khi loader không khai báo/tải `leagues`; path attach League là silent-empty/dead path.

Runtime ADMIN xác nhận toàn trang không overflow ngang ở 1280px hoặc 390px. Mobile bottom navigation có target 52–60 × 54px. Action Accordion headers chính nằm trong 49–54px, phù hợp V2. Tuy vậy mobile Match cao khoảng 6.914px cho page 20 record, Player khoảng 3.864px không pager, Ranking khoảng 1.853px không pager, Contribution khoảng 1.427px; nhiều action/shortcut chỉ cao 35–42px.

WP-B không coi hai Player CJS fixture là runtime PASS. Chúng giữ trạng thái local patched, Node runtime chưa verify.

# 2. UI V2 source-of-truth

Thứ tự authority đã dùng:

1. `PICK-PROJECT-STATE-2026-10-04.md` — authoritative project state.
2. `PICK-FRONTEND-AUTH-SURFACE-AUDIT-2026-10-04.md` — authoritative WP-A frontend/auth map.
3. `docs/PICK-UI-SYSTEM-V2.md` — `VERIFIED CURRENT / REQUIRED` UI contract.
4. `AGENTS.md` — current repository UI rules.
5. V1 chỉ mang tính `HISTORICAL / SUPERSEDED`; Action Accordion vẫn bắt buộc vì V2 §13 giữ lại rõ ràng.

Các rule V2 được dùng trực tiếp:

- §3, §5, §16, §17: decision-first; pending/exception trước history và ordinary actions.
- §4, §29–31: same capability = same workflow; frontend visibility không cấp authority.
- §6–10, §34: search/filter/pagination, compact record, detail on demand.
- §11–12, §32–33: desktop comparison; mobile sequential task flow; no horizontal overflow.
- §13–15: Action Accordion dimensions, semantic colors, one primary action.
- §18–24: domain standards cho Player, Match, Fund, Tournament, Rating, Audit, Account.
- §25–28: loading/empty/error/success/state transition.
- §35: shared component reuse.

Không có rule V2 quy định exact breakpoint ngoài review desktop/mobile, exact font size cho mọi component, hoặc ngưỡng record tuyệt đối để gọi dataset “long”. Các chi tiết đó không được biến thành requirement riêng.

# 3. Shared shell/navigation

## Verified behavior

- Desktop: sidebar chứa tám destination; topbar có eyebrow, page title, actor summary, refresh, logout.
- Mobile 390px: bottom bar chỉ giữ Tổng quan, Trận đấu, VĐV, BXH, Quỹ và menu “Thêm” cho Cống hiến/Giải đấu/Tài khoản.
- Runtime mobile: sáu target điều hướng hiển thị rộng 52–60px, cao 54px; document width = scroll width = 390px.
- Footer và shared notice/panel/badge/table utilities tồn tại.
- Mobile business order của primary destinations là hợp lý; secondary destinations nằm trong “Thêm”, không duplicate navigation.

## Reconciliation

- **PASS:** navigation touch size và no page-level horizontal overflow trong ADMIN runtime.
- **UI CONTRACT MISMATCH UI2-020:** ADMIN nav được tạo trước khi profile load nên label vẫn “Tài khoản”, trong khi page title là “Quản trị tài khoản”. Normal MEMBER label “Tài khoản” là đúng.
- **ACCESSIBILITY UI2-016:** shared `notice()` không tự gắn `role=status/alert` hoặc live region; từng module tự gắn không nhất quán.
- Delegated/normal navigation runtime: **UNKNOWN / NEEDS RUNTIME**.

# 4. Auth surfaces

## Source/static review

- Login có label, required fields, autocomplete username/current-password, primary CTA rõ.
- Signup là long form nhưng nằm trong panel hidden mặc định; có label, required/min/max/pattern, password confirmation, cancel.
- Forgot password và recovery là panel riêng, có labels, native required, role alert message.
- Forced-password surface chặn business rendering và gọi Edge `change-my-password`; duplicate submission được disable.
- Mobile CSS chuyển auth form grid về một cột, story panel ẩn, card fit viewport.

## Runtime status

Không logout session ADMIN và không xóa session storage chỉ để audit. Vì vậy login/signup/forgot/recovery/forced-password visual runtime ở 1280/390 là **UNKNOWN / NEEDS RUNTIME** (UI2-019). Static contract không cho thấy action hierarchy hoặc label bug rõ ràng.

`admin-confirm-user` consumer nằm trong Account nhưng deployed Edge source missing repo; UI path cần giữ nguyên khi chưa source-sync.

# 5. Overview

## Verified behavior

- Runtime hierarchy: hero/primary summary → “Cần xử lý” capability cards → short leaderboard.
- Fund attention dùng authoritative `amount_remaining`; unavailable không fallback legacy.
- Management cards dùng capability helpers, destination actions vẫn do backend enforce.
- Desktop không overflow; mobile document không overflow.
- Dashboard table trên mobile nằm trong internal scroll wrapper, table width runtime khoảng 590px trong viewport 390px.

## V2 reconciliation

- Decision-first hierarchy: **PASS**.
- Long history embedded: không có; leaderboard chỉ 5 rows và link tới module: **PASS**.
- Shortcut buttons trên mobile cao runtime 38px: thuộc cross-surface tap issue UI2-011/UI2-013 family.
- **UI CONTRACT MISMATCH UI2-015:** mobile leaderboard vẫn là wide table/horizontal pan thay vì compact mobile comparison; page không overflow nhưng content control yêu cầu horizontal scan.
- `can_adjust_rating` card wording hứa nghiệp vụ được ủy quyền nhưng destination không có delegated action: UI2-004.

# 6. Matches

## Verified behavior

- ADMIN và delegated approver dùng cùng `adminMatchCenter` theo source.
- Normal/delegated MEMBER self workflow: create, opponent confirmation/reject, creator edit, resubmit.
- Table utility page size 20, status/date filter, desktop table, mobile cards.
- Reject/invalid dùng red; create/approve green; void gray. Semantic colors khớp V2.
- Busy guards, error messages, success reloads và stale/session checks tồn tại.
- Edit + Resubmit vẫn là hai RPC, partial-success được giải thích; đây là known technical debt, không phải finding UI mới.

## Runtime evidence

- Desktop 1280: no page overflow, history table 20 rows + pager.
- Mobile 390: no page overflow nhưng content height khoảng 6.914px; 20 record cards và action sets rất dài.
- Nhiều per-record action target cao 42px.

## V2 reconciliation

- **FUNCTIONAL UI BUG UI2-003:** League source không load nên select attach League silent-empty.
- **ACCESSIBILITY UI2-008:** Action Accordion biến `h2` thành `role=button`, keyboard handler thủ công, có `aria-expanded` nhưng không `aria-controls`; heading semantics bị thay thế.
- **RESPONSIVE ISSUE UI2-011:** 20 rich mobile records tạo page quá dài, action targets 42px.
- **UI CONTRACT MISMATCH UI2-023:** ADMIN “Tạo trận mới” được render trước pending/approval/exception center, ngược decision-first order.

# 7. Players

## Verified behavior

- Permission presentation đúng current contract: create/edit = `can_manage_players`; lifecycle = `can_manage_player_lifecycle`; promotion = BOTH; initial rating/hard delete = ADMIN-only.
- Sáu ADMIN action accordion runtime đều collapsed, cao 54px, semantic colors create green, edit/info blue, delete red.
- Player cards compact ở desktop/mobile, long names wrap, rating aligned, one detail open.
- Detail tách stats, form history và Rating history on demand.
- Runtime no horizontal overflow ở cả hai viewport.

## V2 reconciliation

- **FUNCTIONAL UI BUG UI2-002:** delegated promotion candidate list lệch RLS và thường false-empty/error.
- **UI CONTRACT MISMATCH UI2-009:** Player deactivate submit dùng amber warning; Account deactivate dùng red. V2 xếp deactivate vào danger/red.
- **RESPONSIVE ISSUE UI2-010:** current list render toàn bộ Player, không search/status/type filter/pager. Runtime mobile khoảng 3.864px cho 25 Player.
- **UI CONTRACT MISMATCH UI2-022:** global hard-delete accordion được đặt ở action stack đầu trang, tách xa selected Player context; V2 yêu cầu destructive action gần record/detail và không cạnh tranh với routine actions.
- Two local Player fixture runtime: **UNKNOWN / NEEDS TEST**, không PASS.

# 8. Ranking

## Verified behavior

- Card hierarchy rõ rank, name, rating, Rated matches; top ranks có visual hierarchy.
- One detail open; Rating/form history chỉ render on demand.
- Long name wrap và mobile grid không overflow.
- Personal member history accordion có pager/table handling.

## V2 reconciliation

- **AUTH PRESENTATION MISMATCH UI2-001:** backend RPC leak được frontend dùng để dựng club Player histories; normal/delegated MEMBER có thể mở lịch sử Player khác. Đây là UI exposure của known backend issue.
- **UI CONTRACT MISMATCH UI2-012:** main club ranking `.forEach()` toàn bộ rows, không search/filter/pager; runtime 14 cards khoảng 1.853px mobile. Ngưỡng dataset “long” không được V2 định lượng, nhưng implementation không scale.

# 9. Fund

## Verified behavior

- Information hierarchy: KPI → exceptions → personal portal (MEMBER) / actions → debt → history/reconciliation.
- Fund manage và collect tách đúng; collector-only không đọc raw ledger.
- NET balances fail closed; no gross fallback khi read model unavailable.
- Collection, campaign, expense là separate native details; one open within action group.
- Debt/history có filters/search/client pager 20.
- Runtime action headers 50–52px, semantic green create/collect, amber expense, neutral history; no overflow desktop/mobile.

## V2 reconciliation

- Core Fund workspace hiện phù hợp V2 trong dataset hiện có.
- `fundCollapse` top-level là custom button disclosure, inner actions là native details; duplication được ghi UI2-006/UI2-017, chưa cần merge business-specific allocation/ledger state.
- Empty notice runtime có node `.notice` với empty text; minor cleanup nằm trong shared notice remediation, không tách finding.

# 10. Contribution

## Verified behavior

- Read-only derived “góc vui”; three summary groups, disclosure buttons, no management action.
- Wording mô tả contribution generated, không tự nhận là NET outstanding.
- Desktop no overflow.

## V2 reconciliation

- **RESPONSIVE ISSUE UI2-013:** all derived cards render without search/pager; runtime mobile khoảng 1.427px và three disclosure targets chỉ cao 35px.
- Exact threshold for pagination is **UNSPECIFIED BY V2**; remediation chỉ bắt buộc khi dataset dài, nhưng 35px target cần sửa độc lập.

# 11. Tournament / League

## Verified behavior

- `can_manage_tournaments` và `can_collect_tournament_fee` tách đúng.
- Create/edit/status/register actions dùng same component path cho ADMIN/delegated actors.
- Current empty-state runtime compact và hướng user về create.
- Action headers runtime 49px; create/register green, edit blue, lifecycle neutral.
- No desktop/mobile page overflow với empty fixture.

## V2 reconciliation

- **FUNCTIONAL UI BUG UI2-003:** League source missing, ảnh hưởng Match attachment.
- **ACCESSIBILITY UI2-007:** custom Tournament buttons toggle hidden bodies nhưng không set `aria-expanded`/`aria-controls`; runtime AX không công bố collapsed/expanded.
- **UI CONTRACT MISMATCH UI2-014:** action forms precede operational pending summary/list; populated registration/payment list không có evidence search/pager/exception-first đầy đủ.
- Populated Tournament finance/status runtime remains **UNKNOWN / NEEDS RUNTIME**.

# 12. Account / Admin

## Verified behavior

- Personal summary tách Account status và Player status.
- ADMIN actions remain ADMIN-only: approval/rejection, permissions, lifecycle, hard delete, confirmation, provisioning/config.
- Account member directory is selection-driven, one detail open, search/filter/pagination.
- Native details Action Accordion runtime cao 54px, exposes collapsed state in AX.
- Create green, edit/info blue, neutral config, reject/delete red.
- Lifecycle deactivate is red; reason/confirm used for destructive actions.
- Desktop/mobile no page overflow; mobile forms stack.

## V2 reconciliation

- **UI CONTRACT MISMATCH UI2-024:** personal “Đổi mật khẩu” appears before “Thành viên”; pending signup/member attention is not surfaced before routine personal action on ADMIN workspace.
- `admin-confirm-user` UI path is present and clear, but source dependency is **UNKNOWN / NEEDS SOURCE** and included in UI2-019 dependency notes.
- Native details implementation should be the semantic reference when consolidating Action Accordion, while data loaders/business-specific bodies remain local.

# 13. Role × device matrix

| Context | Evidence | Surfaces covered | Result |
|---|---|---|---|
| ADMIN Desktop 1280px | Live localhost ADMIN session, source | All eight signed-in pages + shared shell | Runtime reviewed; no page-level horizontal overflow |
| ADMIN Mobile 390px | Live localhost ADMIN session, source | All eight signed-in pages + mobile nav | Runtime reviewed; density/tap issues found |
| Delegated MEMBER Desktop | Source gates + WP-A/backend map | All capability surfaces | Static reviewed; **UNKNOWN / NEEDS RUNTIME** |
| Delegated MEMBER Mobile | Source gates + responsive CSS | All capability surfaces | Static reviewed; **UNKNOWN / NEEDS RUNTIME** |
| Normal MEMBER Desktop | Source personal workflows + WP-A map | Overview/Match/Player/Ranking/Fund/Tournament/Account | Static reviewed; **UNKNOWN / NEEDS RUNTIME** |
| Normal MEMBER Mobile | Source personal workflows + responsive CSS | Same | Static reviewed; **UNKNOWN / NEEDS RUNTIME** |

Delegated MEMBER không được giả định có toàn bộ capabilities. Static matrix đánh giá từng capability riêng. Không có credential/account được tạo hoặc sửa trong WP-B.

# 14. Shared-component drift

| Pattern | Implementations | Classification | Recommendation |
|---|---|---|---|
| Action Accordion | `accountAction`, `collapsibleAdminSection`, `makeMatchActionAccordion`, `fundCollapse`, Tournament toggles | **SHARED-COMPONENT CANDIDATE** | Shared semantic shell/API; keep data loading and business body local |
| Panel | shared `panel()` + local nested panels | Existing shared + minor drift | Keep shared; prevent duplicate hidden headings |
| Notice | shared `notice()` + manual role alert/status | **SHARED-COMPONENT CANDIDATE** | Add explicit status/error live semantics in one helper |
| Badge/status chip | shared `badge()` + Account scoped variants | **SHARED-COMPONENT CANDIDATE** | One semantic map/tokens; domain labels local |
| Form group/actions | shared class names, local builders | **SHARED-COMPONENT CANDIDATE** | Share layout/required/busy conventions, not field schemas |
| Destructive confirmation | reason + `confirm()` per workflow | **BUSINESS-SPECIFIC — KEEP LOCAL** | Shared danger styling; business text/guards local |
| Empty/loading/error | module-local notices | **SHARED-COMPONENT CANDIDATE** | Shared compact state component with retry/accessibility |
| Pagination/filter | shared table utility + Account/Fund custom pagers | **UI DRIFT** | Shared pager/toolbar contract; query/state local |
| Mobile record cards | table utility, Match, Player, Ranking, Fund custom cards | **UI DRIFT** | Shared identity/status/action frame; domain summary local |
| Summary/KPI cards | shared `ui-kpi-grid`/`ui-summary-card` | Existing shared | Keep tokens; validate odd-card mobile layouts |

Do not merge Fund allocation state, Match confirmation state, Account selected-member state or Player lifecycle preview into generic business logic.

# 15. Responsive/mobile findings

Runtime viewport evidence:

| Surface | Desktop 1280 | Mobile 390 | Main observation |
|---|---:|---:|---|
| Overview | 1.076px content height | 1.577px | No page overflow; internal 590px table; 38px shortcuts |
| Matches | 2.589px | 6.914px | Mobile record/action density too high; 42px actions |
| Players | 2.560px | 3.864px | No pager/filter; cards otherwise stable |
| Ranking | 1.290px | 1.853px | No pager/search; cards stable |
| Fund | 595px | 679px | Compact; no overflow |
| Contribution | 433px | 1.427px | 35px disclosure targets |
| Tournament (empty) | 316px | 329px | Compact; populated state not runtime-tested |
| Account (collapsed) | 697px | 688px | Compact; native details semantics good |

Page-level horizontal overflow = 0 for all ADMIN pages at both viewports. This does not turn internal horizontal table scroll into V2 PASS.

# 16. Accessibility/basic UX findings

Positive evidence:

- Auth inputs have explicit labels/autocomplete/required attributes.
- Player/Ranking detail toggles have `aria-expanded`, `aria-controls` and descriptive labels.
- Player Action Accordion has `aria-expanded`, `aria-controls`, exclusive open and close button.
- Account/Fund inner native details expose disclosure semantics.
- Mobile nav touch targets meet 44px.
- Focus-visible rules exist for main button/module contexts.

Gaps:

- Tournament custom accordion lacks disclosure ARIA (UI2-007).
- Match uses heading-as-button without controlled-region linkage (UI2-008).
- Shared notices lack unified live semantics (UI2-016).
- Several mobile action targets are below 44px (UI2-011/UI2-013).

This is a basic UX/accessibility review, not a full WCAG audit.

# 17. UI contract mismatches

## UI2-001 — Rating scope leak is actively exposed by UI

- **Surface/module:** Ranking, Player detail; `app.js`, `players.js`.
- **Severity / priority:** HIGH / P0.
- **Classification:** AUTH PRESENTATION MISMATCH.
- **Role/device:** delegated and normal MEMBER; Desktop/Mobile.
- **Source evidence:** non-ADMIN loader calls `get_member_rating_events`; Ranking/Player detail consume shared events per Player. WP-A/production baseline verifies RPC returns all events.
- **V2 reference:** §22, §29; backend authoritative and rating history scoped by permission.
- **Expected:** MEMBER receives and sees only backend-authorized Rating history.
- **Current:** backend returns club-wide events and UI lets MEMBER inspect Player histories; client filtering is presentation only.
- **Recommended remediation:** fix RATING-SCOPE01 backend first, then confirm Ranking/Player empty/personal states.
- **Dependency:** exact production `pg_get_functiondef`, forward-only migration, security regression. UI-only fix prohibited.

## UI2-002 — Delegated Guest promotion candidate list is unusable

- **Surface/module:** Players; `players.js` promotion accordion.
- **Severity / priority:** HIGH / P0.
- **Classification:** FUNCTIONAL UI BUG.
- **Role/device:** delegated MEMBER with both required capabilities; Desktop/Mobile.
- **Source evidence:** candidate MEMBER RPC plus direct `client.from('players')` GUEST/ACTIVE query; production Player RLS = ADMIN or own Player.
- **V2 reference:** §4, §27, §30.
- **Expected:** same promotion workflow/data for ADMIN and correctly delegated MEMBER.
- **Current:** delegated read normally returns zero Guest rows or read error; UI reports “Không có VĐV khách” or generic load failure although backend mutation authority exists.
- **Recommended remediation:** add/extend scoped candidate read RPC and distinguish true empty from authorization/read failure.
- **Dependency:** backend read-model contract; do not broaden table RLS blindly.

## UI2-003 — League attachment path is silent-empty

- **Surface/module:** Matches / League; `app.js`, `matches.js`.
- **Severity / priority:** HIGH / P0.
- **Classification:** FUNCTIONAL UI BUG.
- **Role/device:** ADMIN, delegated approver/manager, normal MEMBER self-create where type eligible; Desktop/Mobile.
- **Source evidence:** `matches.js` reads `rows('leagues')`; `app.js.tables` has no `leagues`, so loader never populates error/data.
- **V2 reference:** §19, §25–27.
- **Expected:** eligible League list or explicit unavailable/error state.
- **Current:** empty select/dead path without source error notice.
- **Recommended remediation:** source-close League read contract, then load via correct RLS/RPC and add explicit empty/error state.
- **Dependency:** production League RLS/read model verification.

## UI2-004 — `can_adjust_rating` advertises an action that does not exist

- **Surface/module:** Overview → Players.
- **Severity / priority:** HIGH / P1.
- **Classification:** AUTH PRESENTATION MISMATCH.
- **Role/device:** delegated MEMBER with `can_adjust_rating`; Desktop/Mobile.
- **Source evidence:** Overview includes capability in “VĐV & Rating”; Player initial-rating accordion is gated `isAdmin()`.
- **V2 reference:** §4, §22, §30.
- **Expected:** capability card opens the same backend-authorized adjustment workflow, or wording does not promise one.
- **Current:** shortcut/hint exists but destination has no delegated Rating action.
- **Recommended remediation:** first define current backend capability scope; then wire correct shared workflow or remove misleading hint.
- **Dependency:** exact backend contract; initial-rating correction must stay ADMIN-only.

## UI2-005 — `can_view_audit` has no surface

- **Surface/module:** Shared nav/Account permission model.
- **Severity / priority:** HIGH / P1.
- **Classification:** AUTH PRESENTATION MISMATCH.
- **Role/device:** ADMIN and delegated MEMBER with capability; Desktop/Mobile.
- **Source evidence:** helper/profile/permission editor contain capability; no route/read model/browser consumer.
- **V2 reference:** §4, §23, §30.
- **Expected:** capability-backed Audit browsing component with filters/pagination.
- **Current:** permission can be granted but produces no visible functionality.
- **Recommended remediation:** close Audit backend/data-scope contract before adding route/component.
- **Dependency:** Audit RPC/ACL/source inventory.

## UI2-006 — Five Action Accordion implementations drift

- **Surface/module:** Account, Players, Matches, Fund, Tournament.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** SHARED-COMPONENT DRIFT.
- **Role/device:** all roles; Desktop/Mobile.
- **Source evidence:** `accountAction`, `collapsibleAdminSection`, `makeMatchActionAccordion`, `fundCollapse`, Tournament custom toggles.
- **V2 reference:** §13, §35.
- **Expected:** shared semantic shell with 49–58px header, icon, variant, ARIA, close/exclusive behavior.
- **Current:** dimensions/colors mostly align, but semantics, exclusive-open, close controls and ARIA differ.
- **Recommended remediation:** create shared presentation primitive; keep module loaders/forms local.
- **Dependency:** regression matrix for every existing accordion state.

## UI2-007 — Tournament accordion state is not exposed

- **Surface/module:** Tournament; `app.js`.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** ACCESSIBILITY.
- **Role/device:** ADMIN/delegated tournament manager; Desktop/Mobile.
- **Source evidence:** create/edit/lifecycle/register buttons toggle `hidden` and text only; runtime AX reports plain button, no collapsed/expanded.
- **V2 reference:** §13, §33, §37 basic accessible interaction.
- **Expected:** `aria-expanded`, `aria-controls`, keyboard/native disclosure semantics.
- **Current:** visual state only.
- **Recommended remediation:** adopt shared/native Action Accordion shell.
- **Dependency:** none beyond UI regression.

## UI2-008 — Match accordion replaces heading semantics

- **Surface/module:** Matches; `matches.js`.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** ACCESSIBILITY.
- **Role/device:** all Match actors; Desktop/Mobile.
- **Source evidence:** `h2` receives `role=button`, tabindex and manual key handler; has `aria-expanded` but no controlled region ID.
- **V2 reference:** §13, §35.
- **Expected:** native button/summary with accessible name and controlled region while preserving heading structure.
- **Current:** heading role is overwritten and relation to body is implicit.
- **Recommended remediation:** shared accordion header with heading text inside a real button.
- **Dependency:** Match keyboard/action regression.

## UI2-009 — Deactivate semantic color differs by module

- **Surface/module:** Players vs Account.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** UI CONTRACT MISMATCH.
- **Role/device:** ADMIN and lifecycle-delegated MEMBER; Desktop/Mobile.
- **Source evidence:** Player `.player-lifecycle-warning` amber; Account `.lifecycle-deactivate` red.
- **V2 reference:** §14–15: deactivate is danger/red.
- **Expected:** same danger semantics for deactivate; reactivate remains positive.
- **Current:** Player deactivate reads as warning while Account deactivate reads as danger.
- **Recommended remediation:** unify semantic variant at final selected action, not necessarily whole bidirectional accordion.
- **Dependency:** none.

## UI2-010 — Player workspace lacks V2 list controls

- **Surface/module:** Players.
- **Severity / priority:** HIGH / P1.
- **Classification:** RESPONSIVE ISSUE.
- **Role/device:** all roles; Desktop/Mobile.
- **Source evidence:** cards iterate entire `playerRows`; no name search/status/type filter/pager. Mobile runtime ~3.864px for 25 rows.
- **V2 reference:** §6, §8, §18, §34.
- **Expected:** search, status/type filters, 20–25 page size, preserved selection.
- **Current:** full card list; user scrolls through every Player.
- **Recommended remediation:** shared toolbar/pager around existing compact cards.
- **Dependency:** preserve role-scoped dataset and one-open-detail state.

## UI2-011 — Match mobile page is operationally too long

- **Surface/module:** Matches.
- **Severity / priority:** HIGH / P1.
- **Classification:** RESPONSIVE ISSUE.
- **Role/device:** all roles, especially ADMIN/delegated approver; Mobile.
- **Source evidence:** runtime mobile ~6.914px for page size 20; repeated action sets; several buttons 42px.
- **V2 reference:** §12, §19, §33–34.
- **Expected:** compact identity/status/main action with secondary detail; comfortable targets.
- **Current:** too much action metadata per card and long sequential scroll.
- **Recommended remediation:** reduce mobile card summary, move secondary actions/detail on demand, enforce ≥44px targets.
- **Dependency:** preserve approval/confirmation proximity and status grouping.

## UI2-012 — Main Ranking has no scalable list controls

- **Surface/module:** Ranking.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** UI CONTRACT MISMATCH.
- **Role/device:** all roles; Desktop/Mobile.
- **Source evidence:** `rankingRows.forEach()` renders all cards; no search/pager; mobile runtime ~1.853px for 14 rows.
- **V2 reference:** §6, §8, §22, §34.
- **Expected:** pager/search when list becomes long; detail/history on demand.
- **Current:** detail is correct, main list does not scale.
- **Recommended remediation:** add shared pager and optional name search; retain rank order and tie semantics.
- **Dependency:** no Rating business change.

## UI2-013 — Contribution mobile targets and list do not scale

- **Surface/module:** Contribution.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** RESPONSIVE ISSUE.
- **Role/device:** all roles; Mobile.
- **Source evidence:** runtime ~1.427px; disclosure buttons 35px; all derived cards render.
- **V2 reference:** §12, §33–34.
- **Expected:** comfortable targets and paging/filtering when dataset is long.
- **Current:** targets below 44px and unlimited derived list.
- **Recommended remediation:** raise target size; paginate only when dataset justifies, documenting threshold.
- **Dependency:** none.

## UI2-014 — Tournament workspace is action-first, not exception-first

- **Surface/module:** Tournament.
- **Severity / priority:** HIGH / P1.
- **Classification:** UI CONTRACT MISMATCH.
- **Role/device:** ADMIN/delegated tournament manager/collector; Desktop/Mobile.
- **Source evidence:** four action accordions render before tournament/registration/payment operational data; no complete search/pager contract evident.
- **V2 reference:** §3, §5, §16, §21.
- **Expected:** pending registrations, unpaid fees, active/settlement work before forms/history.
- **Current:** create/edit/status/register actions dominate top of page.
- **Recommended remediation:** add attention summary/queue then selected Tournament workspace; paginate registrations/payments.
- **Dependency:** populated-state runtime fixture and existing backend scopes.

## UI2-015 — Overview mobile requires horizontal table scanning

- **Surface/module:** Overview leaderboard.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** UI CONTRACT MISMATCH.
- **Role/device:** all roles; Mobile.
- **Source evidence:** runtime viewport 390px, table width ~590px inside scroll wrapper.
- **V2 reference:** §12, §17, §33.
- **Expected:** compact mobile rows/cards with decision-relevant values, no horizontal scan.
- **Current:** page itself fits but leaderboard needs horizontal pan.
- **Recommended remediation:** mobile compact leaderboard cards/rows; keep desktop table.
- **Dependency:** none.

## UI2-016 — Shared notices lack unified live semantics

- **Surface/module:** all modules; `notice()`.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** ACCESSIBILITY.
- **Role/device:** all roles; Desktop/Mobile.
- **Source evidence:** helper changes text/class/hidden only; some callsites separately set role alert/status, others do not.
- **V2 reference:** §25–27, §35.
- **Expected:** success/status and error/alert semantics consistently announced.
- **Current:** announcement behavior depends on callsite.
- **Recommended remediation:** shared notice API with severity/live mode and no empty visible notice.
- **Dependency:** avoid duplicate announcements in callsites already carrying roles.

## UI2-017 — Pagination/filter controls are visually equivalent but separate

- **Surface/module:** shared table, Account, Fund, Rating history.
- **Severity / priority:** MEDIUM / P1.
- **Classification:** SHARED-COMPONENT DRIFT.
- **Role/device:** all roles; Desktop/Mobile.
- **Source evidence:** generic `table()` pager plus custom Account/Fund/Rating controls with different state handling.
- **V2 reference:** §6–8, §35.
- **Expected:** same pager labels, target sizes, state preservation and toolbar rhythm.
- **Current:** each implementation recreates controls and reload behavior.
- **Recommended remediation:** shared pager/toolbar primitives; query/domain state remains local.
- **Dependency:** preserve selection/filter/page after mutation.

## UI2-018 — Client-side 10k snapshots undermine UI scalability

- **Surface/module:** loader/all client-derived modules.
- **Severity / priority:** MEDIUM / P2.
- **Classification:** TECH DEBT.
- **Role/device:** all roles; Desktop/Mobile.
- **Source evidence:** generic loader pages up to 10.000 rows then UI paginates locally; many mutations call full `load()`.
- **V2 reference:** §6–8, §28, §34.
- **Expected:** smallest relevant reload and backend-paged long datasets where practical.
- **Current:** client pagination can still transfer/recompute full snapshots and lose module context.
- **Recommended remediation:** incremental migration to paged read models, starting Tournament/Match/Player; retain current RLS/RPC authority.
- **Dependency:** backend read-model contracts; not a WP-C visual-only quick fix.

## UI2-019 — Four role/device/auth contexts lack runtime evidence

- **Surface/module:** all, especially Auth and delegated/normal workflows.
- **Severity / priority:** MEDIUM / P2.
- **Classification:** UNKNOWN / NEEDS SOURCE.
- **Role/device:** delegated MEMBER Desktop/Mobile; normal MEMBER Desktop/Mobile; unauthenticated Auth Desktop/Mobile.
- **Source evidence:** no suitable session/credential was created; WP-B intentionally preserved current ADMIN session.
- **V2 reference:** §30–33, §37.
- **Expected:** runtime matrix for every applicable role/device before implementation commit.
- **Current:** source/static evidence only.
- **Recommended remediation:** use existing safe fixtures/test sessions in WP-C; do not create production credentials solely for checkbox completion.
- **Dependency:** test credentials/session fixtures; `admin-confirm-user` source remains missing.

## UI2-020 — ADMIN navigation label is stale

- **Surface/module:** Shared shell/Account.
- **Severity / priority:** LOW / P2.
- **Classification:** UI CONTRACT MISMATCH.
- **Role/device:** ADMIN; Desktop/Mobile.
- **Source evidence:** runtime nav says “Tài khoản”, page title says “Quản trị tài khoản”; nav labels are constructed before profile load using `isAdmin()`.
- **V2 reference:** §5 information hierarchy, §24 Account/IAM clarity.
- **Expected:** ADMIN destination label reflects management surface; MEMBER remains “Tài khoản”.
- **Current:** stale initial label.
- **Recommended remediation:** refresh nav labels after profile load or derive label at render.
- **Dependency:** none.

## UI2-021 — Mobile record shells are duplicated

- **Surface/module:** Match, Player, Ranking, Fund, generic table.
- **Severity / priority:** LOW / P2.
- **Classification:** SHARED-COMPONENT DRIFT.
- **Role/device:** all roles; Mobile.
- **Source evidence:** separate card grids/actions/status layouts and different target heights.
- **V2 reference:** §12, §30, §35.
- **Expected:** shared mobile record frame with domain-specific slots.
- **Current:** equivalent structure implemented per module.
- **Recommended remediation:** share identity/status/action frame after P0/P1 workflow corrections.
- **Dependency:** do not flatten domain-specific decision fields.

## UI2-022 — Player hard delete is detached from record context

- **Surface/module:** Players.
- **Severity / priority:** HIGH / P1.
- **Classification:** UI CONTRACT MISMATCH.
- **Role/device:** ADMIN; Desktop/Mobile.
- **Source evidence:** permanent-delete accordion sits in global action stack before Player list; selected Player is chosen inside form.
- **V2 reference:** §5F, §10, §15, §18.
- **Expected:** destructive action near selected Player detail/danger zone, after preview and ordinary lifecycle choice.
- **Current:** global red action competes with routine top-level actions.
- **Recommended remediation:** move entry into selected Player detail or a clearly subordinate danger zone; keep backend preview/recheck.
- **Dependency:** no business logic change.

## UI2-023 — Match create precedes pending work

- **Surface/module:** Matches.
- **Severity / priority:** HIGH / P1.
- **Classification:** UI CONTRACT MISMATCH.
- **Role/device:** ADMIN/delegated approver; Desktop/Mobile.
- **Source evidence:** runtime first heading is “Tạo trận mới”; `matchesPage()` renders create/management forms before history and pending center is not the first decision summary.
- **V2 reference:** §3, §5, §16, §19.
- **Expected:** confirmation/approval/rejected/invalid work before create/history for authorized manager.
- **Current:** create is visually first.
- **Recommended remediation:** attention summary/status queues first, create accordion after primary pending work.
- **Dependency:** keep MEMBER personal create priority when no management capability.

## UI2-024 — ADMIN Account does not surface pending members first

- **Surface/module:** Account/Admin.
- **Severity / priority:** HIGH / P1.
- **Classification:** UI CONTRACT MISMATCH.
- **Role/device:** ADMIN; Desktop/Mobile.
- **Source evidence:** runtime order is personal summary → Đổi mật khẩu → Thành viên → provisioning/config.
- **V2 reference:** §3, §5, §16, §24.
- **Expected:** pending signup/member attention before routine personal password/config actions.
- **Current:** pending work is inside second management accordion after personal password.
- **Recommended remediation:** add compact pending count/queue at top and route into selected member detail; preserve ADMIN-only authority.
- **Dependency:** existing pending-signup RPC only; no backend change required.

# 18. Unknown / needs runtime/source

- Delegated MEMBER Desktop/Mobile visual/runtime for each individual capability: **UNKNOWN / NEEDS RUNTIME**.
- Normal MEMBER Desktop/Mobile personal workflows: **UNKNOWN / NEEDS RUNTIME**.
- Auth login/signup/forgot/recovery/forced-password visual runtime: **UNKNOWN / NEEDS RUNTIME**.
- Populated Tournament registrations/payments/finance mobile runtime: **UNKNOWN / NEEDS RUNTIME**.
- Two patched Player CJS fixture runtime: **UNKNOWN / NEEDS TEST**, explicitly not PASS.
- `admin-confirm-user` deployed source: **UNKNOWN / NEEDS SOURCE**.
- `can_adjust_rating` actionable backend scope and Audit read model: **UNKNOWN / NEEDS SOURCE**.
- Exact long-dataset threshold and pixel breakpoint preferences: **UNSPECIFIED BY V2**.

# 19. Prioritized remediation backlog

## P0 — Functional/security presentation blockers (3)

1. UI2-001 — RATING-SCOPE01 backend fix + UI regression.
2. UI2-002 — delegated promotion candidate read model.
3. UI2-003 — League source/read contract and explicit state.

## P1 — Core V2 consistency (17)

1. UI2-004 — close `can_adjust_rating` presentation contract.
2. UI2-005 — close Audit capability/product contract.
3. UI2-006 — shared Action Accordion shell.
4. UI2-007 — Tournament disclosure ARIA.
5. UI2-008 — Match semantic accordion header.
6. UI2-009 — unify deactivate semantic red.
7. UI2-010 — Player search/filter/pagination.
8. UI2-011 — compact Match mobile cards/tap targets.
9. UI2-012 — Ranking scalable controls.
10. UI2-013 — Contribution target size/scaling.
11. UI2-014 — Tournament decision-first workspace.
12. UI2-015 — Overview mobile leaderboard.
13. UI2-016 — shared notice live semantics.
14. UI2-017 — shared pagination/filter primitives.
15. UI2-022 — contextual Player hard delete.
16. UI2-023 — Match pending-first ordering.
17. UI2-024 — Account pending-member attention.

## P2 — UX polish/debt (4)

1. UI2-018 — backend-paged reads/smallest reload.
2. UI2-019 — close role/auth runtime gaps.
3. UI2-020 — refresh ADMIN nav label.
4. UI2-021 — shared mobile record frame.

# 20. Recommended next work package

## WP-C — P0 source closure and functional repair

Recommended order:

1. **WP-C1 RATING-SCOPE01:** export exact production function, forward-only own-player scope, security tests, then Ranking/Player MEMBER UI regression.
2. **WP-C2 Player promotion read model:** authoritative candidate RPC for delegated actors, true-empty vs error behavior, ADMIN/delegated desktop/mobile fixture.
3. **WP-C3 League source closure:** verify production RLS/RPC, load `leagues`, explicit loading/error/empty states, Match create/edit/self regression.

Sau P0 mới bắt đầu WP-C4 shared Action Accordion + decision-first reorder. Không gộp backend security repairs với visual refactor trong một patch.

WP-C validation cần có:

- ADMIN, relevant delegated MEMBER, normal MEMBER where applicable.
- Desktop 1280px và Mobile 390px.
- Two existing Player CJS fixtures được chạy thật, không chỉ static patch.
- UTF-8 no BOM, U+FFFD = 0, syntax/regression checks, `git diff --check`.
- Không coi frontend visibility là authorization.
