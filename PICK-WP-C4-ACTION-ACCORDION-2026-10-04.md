# 1. Scope and baseline

WP-C4 chuẩn hóa Action Accordion theo `docs/PICK-UI-SYSTEM-V2.md` trên frontend hiện tại, không thay đổi authorization, RPC, Edge Function, RLS, dữ liệu hoặc workflow business. Baseline là `HEAD/origin/main 4083014e1633394eb2547d715acc3c1f659e38a3`.

Working tree trước WP-C4 đã có thay đổi ngoài phạm vi. Đặc biệt, `player-lifecycle01e-ui-test.cjs` và `rating-initial01c-ui-test.cjs` đã có patch capability mới; WP-C4 giữ nguyên các patch đó và chỉ bổ sung pseudo-DOM/assertion cho shared accordion. Backup của bảy asset production đã được tạo trước khi sửa.

# 2. V2 Action Accordion contract

Các rule VERIFIED CURRENT từ V2:

- substantial/long-form action forms collapsed mặc định;
- header khoảng 49–58px;
- icon khoảng 27–32px vuông;
- compact vertical spacing, title có thể wrap;
- hover desktop chỉ dịch nhẹ 1–2px;
- create/approve/success dùng green; edit/information dùng blue; pending/warning dùng amber; reject/invalid/danger/destructive dùng red; neutral/void dùng gray/neutral;
- shared component được tái sử dụng giữa module;
- native `<button type="button">`, `aria-expanded`, `aria-controls`, panel id duy nhất và panel collapsed thực sự hidden.

`UNSPECIFIED BY V2`: thuật toán sinh id, animation timing, callback lifecycle và việc các accordion có bắt buộc exclusive-open hay không. WP-C4 giữ exclusive-open ở nhóm Player và Tournament vì đó là behavior hiện hành.

# 3. Existing implementation inventory

| Implementation | File | Consumers | Classification before migration |
|---|---|---|---|
| `accountAction()` | `account.js` | Account self/admin/system configuration actions | SHARED-COMPONENT CANDIDATE |
| `collapsibleAdminSection()` | `players.js` | 6 Player management workflows | SHARED-COMPONENT CANDIDATE |
| `makeMatchActionAccordion()` | `matches.js` | ADMIN create, MEMBER create, MEMBER confirmation | UI DRIFT / SHARED-COMPONENT CANDIDATE |
| `fundCollapse()` + native Fund action `<details>` | `fund.js` | Member/report drill-down and 3 Fund mutations | MIXED: action forms candidate; read drill-down local |
| 5 custom Tournament toggles | `app.js` | 4 ADMIN actions + MEMBER self-registration | SHARED-COMPONENT CANDIDATE |

Legacy differences included clickable `<h2>`, native `<details>/<summary>`, hand-written arrow text, incomplete ARIA linkage, duplicated icon CSS and multiple open/close implementations.

# 4. Shared component design

Shared helper nằm trong `app.js`, cạnh `el()` và `button()`, rồi được truyền qua `create(context)` vào Account, Players, Matches và Fund. Cách này giữ architecture module hiện tại, không thêm file runtime hoặc circular dependency.

Helper sở hữu DOM header chuẩn, icon container, title, chevron, semantic class, unique id, ARIA, hidden state, optional `onOpen`, optional exclusive group và content callback. Module vẫn sở hữu capability gate, data load, validation, busy state, RPC/Edge và business messages.

# 5. Shared component API

Tên helper: `actionAccordion(options)` tại `app.js`.

Options đang dùng:

- `root`: nơi mount, optional để caller giữ order hiện hành;
- `title`: bắt buộc;
- `semantic`: `create | info | warning | danger | neutral`;
- `icon`: optional;
- `expanded`: mặc định `false`;
- `group`: optional array cho exclusive-open;
- `onOpen`: optional lazy/reload callback, chỉ chạy closed → open;
- `render(body, controller)`: xây business content;
- `className`: compatibility spacing class.

Return contract: `{ wrapper, toggle, body, title, setExpanded() }`. API không nhận role, capability, RPC name hoặc business entity.

# 6. Modules migrated

- Players: Tạo VĐV; Guest → Member; Sửa VĐV; Điều chỉnh Rating ban đầu; Vòng đời VĐV; Xóa vĩnh viễn.
- Account: 11 callsite Account/admin/system-config dùng adapter `accountAction()` trên shared helper.
- Matches: Tạo trận mới; Tạo trận của tôi; Xác nhận & xử lý kết quả. Legacy `makeMatchActionAccordion()` đã xóa.
- Fund: Tạo khoản phải đóng; Thu quỹ; Chi quỹ.
- Tournament: Tạo giải; Sửa giải; Chuyển trạng thái; Đăng ký VĐV; MEMBER tự đăng ký giải.

Tổng cộng 28 substantial action callsite dùng shared contract.

# 7. Modules intentionally kept local

`BUSINESS-SPECIFIC — KEEP LOCAL`:

- Match status groups và match record/detail accordion;
- Player card detail, Ranking detail và Rating history;
- `fundCollapse()` cho “Quỹ của tôi”, outer workspace “Thao tác quỹ” và “Công nợ”;
- “Lịch sử & đối soát” Fund;
- Account permission detail và reject sub-form;
- Tournament record/detail cards.

Các surface này là navigation, status grouping, record detail hoặc history disclosure; ép vào Action Accordion sẽ đổi information hierarchy ngoài WP-C4.

# 8. CSS consolidation

`app.css` có một structural contract mới: `.action-accordion`, `.action-accordion-toggle`, `.action-accordion-icon`, `.action-accordion-title`, `.action-accordion-chevron`, `.action-accordion-panel` và 5 semantic modifiers.

Đã xóa:

- 7 legacy rule của `.match-action-collapsible`;
- 10 Player-scoped selector/rule không còn consumer sau migration, gồm legacy `.app-action*`, amber lifecycle action và mobile body override.

Compatibility CSS còn lại có chủ đích cho các local disclosures chưa migrate: `.app-action` (Account reject/Rating history) và `.fund-action` (Fund history/reconciliation). Match action-card CSS còn dùng bởi các business-specific Match panels.

# 9. Semantic colors

Presentation nằm hoàn toàn trong CSS:

- create → green;
- info/edit → blue;
- warning → amber;
- danger → red;
- neutral → Navy/neutral surface.

Player “Ngừng hoạt động” đã đổi từ amber class sang `player-lifecycle-danger` red. Reactivate giữ primary/success behavior hiện tại. Backend lifecycle semantics không đổi.

# 10. Authorization preservation

Capability/role conditions vẫn nằm nguyên tại caller:

- Player create/edit: `can_manage_players`; lifecycle: `can_manage_player_lifecycle`; promotion: cả member + player; Rating initial và hard delete: ADMIN-only.
- Account lifecycle/hard delete giữ boundary hiện hành.
- Match approval và P1.2/P1.2b conditions không đổi.
- Fund `can_manage_fund` và `can_collect_fund` vẫn tách.
- Tournament management và fee collection vẫn tách.

Shared helper không đọc profile/role/capability và không gọi backend.

# 11. Accessibility

- header là native button `type="button"`;
- `aria-expanded` đồng bộ `true/false`;
- `aria-controls` trỏ đúng id của panel;
- id dùng `state.generation` + sequence tăng dần, không trùng trong render cycle;
- icon và chevron `aria-hidden=true`;
- collapsed panel dùng `hidden`;
- Enter/Space do native button xử lý;
- focus-visible global hiện có không bị override.

Test component xác nhận collapsed, optional expanded, expand/collapse, exclusive group, semantic modifier, unique id, ARIA và `onOpen` chỉ chạy khi mở.

# 12. Desktop verification

ADMIN localhost, viewport override 1280×800:

| Surface | Shared actions | Header | Overflow | Result |
|---|---:|---:|---|---|
| Players | 6 | 54px | No | PASS |
| Fund | 3 | 54px | No | PASS |
| Tournament | 4 ADMIN actions | 54px | No | PASS |
| Account | 10 DOM actions; 3 nested hidden until parent opens | 54px visible | No | PASS |
| Matches | 1 ADMIN action | 54px | No | PASS |

Icon là 30×30px, forms collapsed mặc định, Navy + Ivory + semantic color hiển thị đúng. Browser console không có lỗi ứng dụng; chỉ có warning Tailwind CDN đã tồn tại trước WP-C4.

# 13. Mobile verification

ADMIN localhost tại 390×844:

- header 50px, icon 28×28px;
- no horizontal document/action overflow;
- title và tap target không clip;
- Players exclusive-open PASS;
- Player deactivate red semantic PASS;
- Matches, Players, Fund, Tournament và Account render PASS;
- nested Account actions ở trong panel parent, không làm layout tràn.

Delegated MEMBER và normal MEMBER browser session: `NOT RUN / NEEDS RUNTIME` vì không có session phù hợp; không tạo account production. Static authorization fixtures cho delegated/normal MEMBER PASS.

# 14. Regression results

- JS syntax trên toàn bộ frontend/test file changed: PASS.
- Toàn bộ 14 CJS frontend suites hiện có: PASS.
- `player-lifecycle01e-ui-test.cjs`: PASS.
- `rating-initial01c-ui-test.cjs`: PASS.
- Player promotion WP-C2: PASS.
- FUND04 UI/read-model: 67 assertions PASS.
- WP-C3 League: PASS.
- Account ACC03/ACC04/ACC05/ACC06/ACC06B: PASS.
- Match/P1.2/P1.2b source wiring regression: PASS qua WP-C3 và Rating boundary assertions.
- New `wp-c4-action-accordion-ui-test.cjs`: PASS.

# 15. Remaining UI drift

- Compatibility `.app-action`/`.fund-action` vẫn tồn tại cho record/history/sub-form disclosures cố ý giữ local.
- V2 không quy định exact animation/callback/exclusive-open algorithm; implementation hiện tại được giữ nhỏ và deterministic.
- Delegated MEMBER và normal MEMBER chưa có live browser identity; fixture permission matrix đã PASS.
- Full-page information order và non-action accordions thuộc package UI sau, không xử lý ở WP-C4.

# 16. Deployment plan

WP-C4 chỉ chuẩn bị local. WP-C4D nên:

1. review exact diff và bảo toàn các unrelated working-tree files;
2. stage đúng 14 file WP-C4;
3. commit/push theo approval riêng;
4. chờ GitHub Pages publish;
5. verify cache tag `wp-c4-action-accordion-20261004-1` cho sáu JS/CSS asset đã đổi;
6. chạy ADMIN production smoke và, nếu có sẵn session, delegated/normal MEMBER smoke.

Production mutation trong WP-C4: **NO**. Commit/push/deploy: **NO**.

# 17. Final status

`READY FOR PRODUCTION DEPLOY`
