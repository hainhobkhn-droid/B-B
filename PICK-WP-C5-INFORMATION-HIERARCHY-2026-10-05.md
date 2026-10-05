# 1. Scope

WP-C5 chuẩn hóa information hierarchy theo `docs/PICK-UI-SYSTEM-V2.md`: việc actor cần xử lý trước, thao tác chủ động sau, rồi dữ liệu/history. Package chỉ đổi DOM/source order và heading tối thiểu; không đổi authorization, RPC, RLS, backend, search/filter/pagination, responsive density hoặc live-region.

Baseline: `HEAD/origin/main 340366c1a5a25d4851f063fa9138bd16b2e081fa`. Production mutation, commit, push và deploy trong WP-C5: **NO**.

# 2. V2 hierarchy contract

Các rule áp dụng trực tiếp:

- management UI là decision-first;
- pending/exception mà actor được phép giải quyết xuất hiện trước completed/history;
- long action forms tiếp tục dùng shared Action Accordion và collapsed mặc định;
- không tạo queue “Cần xử lý” giả khi không có actionable item;
- không render management action group cho actor không có capability;
- frontend visibility không cấp quyền;
- Desktop và Mobile dùng cùng business order trong DOM, không dùng CSS `order` để đảo thứ tự.

# 3. Current-order audit

| Surface | Trước WP-C5 | Kết luận |
|---|---|---|
| Overview | Hero → Cần xử lý → KPI → BXH ngắn | Giữ nguyên; đã decision-first |
| Matches ADMIN | Tạo trận → status groups → history | Lệch: generic create đứng trước pending |
| Matches MEMBER | Tạo trận → opponent/rejected queue → history | Lệch: create đứng trước việc actor cần xử lý |
| Players | Sáu action ngang cấp → directory/detail | Không có pending queue thật; cần heading rõ |
| Fund | KPI/exceptions → member portal → Thao tác quỹ → Công nợ → history | Lệch khi còn outstanding/error |
| Contribution | Notice/summary/list member-facing | Không có management queue; giữ nguyên |
| Tournament | Action forms → tournament list/detail | Thiếu pending-registration attention trước actions |
| League | Không có page riêng; chỉ data source/selectors trong Match/Tournament | Audit-only, không invent surface |
| Account ADMIN | Self → Đổi mật khẩu → Thành viên/pending → generic actions | Lệch: generic self action đứng trước member review |
| Ranking | Context notice → ranking list → detail/history on demand | Giữ nguyên; search/filter/pagination ngoài scope |

# 4. Matches

- MEMBER confirmation/rejected-resubmit accordion được mount trước nhóm “Thao tác” tạo trận.
- Accordion actor queue ẩn hoàn toàn khi authoritative RPC trả empty; hiện lỗi khi RPC fail, không giả empty.
- Sửa reference `heading` của confirmation accordion để cập nhật count qua shared title node, không đổi workflow/RPC.
- ADMIN: pending group đứng trước “Thao tác”; heading “Cần xử lý” chỉ render khi pending count > 0. Create action đứng sau pending group. Completed/invalid/voided nằm sau heading “Dữ liệu trận đấu”.
- P1.2/P1.2b eligibility, confirm/reject/edit/resubmit và approval logic không đổi.

# 5. Players

- Không tạo “Cần xử lý” vì Player page không có authoritative operational queue.
- Tạo role-aware section “Thao tác” chỉ khi actor là ADMIN, `can_manage_players` hoặc `can_manage_player_lifecycle`.
- Guest promotion vẫn cần member + player; Rating initial/hard delete vẫn ADMIN-only.
- Directory “Hồ sơ & thành tích VĐV” tiếp tục sau action group.

# 6. Fund

- KPI/exceptions và MEMBER own portal giữ nguyên.
- Khi authoritative NET remaining > 0, “Cần xử lý” + Công nợ đứng trước “Thao tác quỹ”.
- Khi debt read model/error chưa đầy đủ, Công nợ error đứng trước actions; không hiển thị false-empty.
- Khi remaining = 0 và data complete, actions đứng trước optional debt reference workspace; không tạo heading “Cần xử lý” rỗng.
- `can_collect_fund` và `can_manage_fund` tiếp tục tách; ledger/history vẫn cuối trang.

# 7. Contribution

Contribution là read/recognition surface. Không có mutation queue hoặc management capability riêng, nên không thêm “Cần xử lý” hay “Thao tác”. Order hiện tại được giữ.

# 8. Tournament / League

- ADMIN/delegated tournament manager nhận “Cần xử lý” khi có registration status `DANG_KY`.
- Loading/error của registration inventory hiện trước action group; ready-empty không render attention section.
- Pending registration buttons mở đúng tournament detail, không mutate dữ liệu.
- Management/self-registration accordions nằm trong role-aware “Thao tác”.
- Tournament fee collection vẫn nằm gần registration record/detail và giữ capability riêng; WP-C5 không invent fee outstanding formula.
- League không có standalone page; loader/selectors WP-C3 giữ nguyên.

# 9. Account / Admin

- Self identity giữ đầu trang.
- “Quản lý thành viên” chứa workspace lifecycle/directory và pending signup queue, đứng trước generic actions.
- “Thao tác” chứa đổi mật khẩu, tạo member, xác nhận email, cấu hình, sinh nhật và reference data.
- Normal MEMBER có self summary/profile trước role-aware “Thao tác” đổi password/nickname.
- ACC03–ACC07B authorization và backend calls không đổi.

# 10. Overview

Overview đã có order Hero → Cần xử lý → compact KPI → leaderboard ngắn, phù hợp V2. Không đổi source trong WP-C5.

# 11. Ranking

Context notice → ranking list → selected detail/history vẫn phù hợp scope. Không thêm management headings. Search/filter/pagination và mobile comparison thuộc package riêng.

# 12. Role-aware hierarchy

- ADMIN: full actions theo boundary hiện hành.
- Delegated MEMBER: action section chỉ tồn tại khi capability caller tương ứng trả true.
- Normal MEMBER: không có empty management wrapper; chỉ personal workflows.
- Shared `actionAccordion(options)` không thay đổi và không chứa authorization.

# 13. Mobile order

DOM order dùng chung Desktop/Mobile; WP-C5 CSS không dùng `order`. ADMIN runtime 390px xác nhận Matches, Players, Fund, Tournament và Account giữ đúng heading order, không horizontal overflow. Density/touch refinements defer WP-C6.

# 14. Tests

- New `wp-c5-information-hierarchy-ui-test.cjs`: DOM/source order, role-aware empty sections, Match actor queue, Account order, Fund NET/error order, Tournament loading/error/pending, mobile no-CSS-order and cache tag.
- Toàn bộ frontend CJS suites: PASS.
- WP-C4 Action Accordion regression: PASS.
- Player lifecycle, WP-C2 promotion, Rating initial, FUND04 và WP-C3 League fixtures: PASS.
- JS/CJS syntax, Python AST, UTF-8 no BOM, U+FFFD, trailing whitespace và `git diff --check`: PASS.

# 15. Remaining findings

Ngoài scope WP-C5:

- Notice/live-region consistency;
- search/filter/pagination và long dataset density;
- mobile ranking/table comparison;
- action touch density;
- contextual placement của Player hard delete;
- delegated/normal MEMBER live browser sessions;
- `can_adjust_rating` và `can_view_audit` surface completeness.

# 16. Deployment evidence

- Implementation commit: `6b1109e1afa4132aa2dec8bdea66111ed82fb6f0` (`refactor: prioritize actionable workflow sections`).
- Push `main -> origin/main`: PASS; `HEAD == origin/main`.
- GitHub Pages workflow `37273584873`: `completed / success` for the implementation SHA.
- Served `index.html` contains exactly six references to cache tag `wp-c5-information-hierarchy-20261005-1`.
- Production SHA-256 parity: PASS for `app.js`, `account.js`, `players.js`, `matches.js`, `fund.js` and `app.css`; no stale asset mix.
- Production business/database mutation: **NO**. WP-C5D did not run SQL, deploy migrations/Edge Functions, submit forms or mutate application data.

# 17. Runtime verification

The production origin had no authenticated session and remained at the login screen. No credential was created, copied or entered. Authenticated ADMIN smoke therefore ran on `http://localhost:8000/` using the same six frontend assets proven byte-identical to the served production files.

Desktop 1280px:

- Matches: no false `Cần xử lý` section when pending count is zero; `Thao tác` precedes `Dữ liệu trận đấu`.
- Players: `Thao tác` precedes `Hồ sơ & thành tích VĐV`; no fake attention section.
- Fund: current NET outstanding is 320,000 VND; DOM order is `Cần xử lý` -> `Công nợ` -> `Thao tác quỹ`.
- Tournament: current ready-empty registration data renders `Thao tác` and the empty notice without a fake attention section.
- Account: `Quản lý thành viên` precedes generic `Thao tác`.
- All five surfaces: no horizontal overflow and no console error.

Mobile 390px:

- All five surfaces use the same business DOM order as Desktop.
- `clientWidth == scrollWidth == 390` on every checked surface; no horizontal overflow.
- Workflow headings are not duplicated by responsive CSS.
- Shared Action Accordion buttons remain full-width and collapsed by default.

Action Accordion regression:

- native buttons, `aria-expanded`, `aria-controls`, controlled body visibility and unique IDs: PASS;
- opening the Player promotion accordion closes the previously open create accordion: PASS;
- Player hard delete retains `action-accordion-danger`: PASS;
- normalized helper hash matches pre-WP-C5 `HEAD`: `16C228E28D7538348DFB6A991446F114E0C4B835EA9612EAB08186757C1C6CB8`.

Role evidence:

- ADMIN Desktop/Mobile: PASS on exact production-byte localhost assets.
- Delegated MEMBER browser session: NOT RUN / residual runtime gap; capability branches covered by CJS fixtures.
- Normal MEMBER browser session: NOT RUN / residual runtime gap; empty-wrapper and personal-workflow branches covered by CJS fixtures.
- Production-origin authenticated ADMIN: NOT RUN because the existing production tab had no session; production publish and asset parity are verified independently.

# 18. Final status

`CLOSED / VERIFIED PRODUCTION`

This status records successful Pages publication, production asset parity, full frontend regression and authenticated ADMIN Desktop/Mobile runtime on byte-identical assets. It does not claim that the three missing production-origin/delegated/normal authenticated browser sessions were run; they remain documented residual verification gaps rather than implementation blockers.
