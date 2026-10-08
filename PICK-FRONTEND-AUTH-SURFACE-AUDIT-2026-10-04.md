# PICK WEBAPP — WP-A Frontend Architecture & Authorization Surface Audit

Ngày audit: 2026-10-04
Repo baseline: `76a4cbd feat: split player management permissions`
Phạm vi: frontend architecture, data source, authorization surface và các điểm ảnh hưởng PICK UI System v2.
Không thuộc phạm vi: sửa source ứng dụng, thay RPC/RLS, redesign UI, deploy production.

Nguồn authoritative đã dùng:

- `AGENTS.md` — **VERIFIED CURRENT**.
- `docs/PICK-UI-SYSTEM-V2.md` — **VERIFIED CURRENT / REQUIRED**.
- `PICK-PROJECT-STATE-2026-10-04.md` — **VERIFIED CURRENT** baseline đã reconciliation với production catalog.
- `PICK-NEXT-CHAT-HANDOFF-2026-10-04.md` — **VERIFIED CURRENT** handoff constraints.
- `PICK-UI-SYSTEM-V1.md` — **HISTORICAL / SUPERSEDED**; chỉ Action Accordion và các pattern được V2 giữ rõ ràng còn hiệu lực.
- Frontend source tại HEAD: `app.js`, `account.js`, `players.js`, `matches.js`, `fund.js`, `index.html`, `app.css` — **VERIFIED CURRENT** đối với repo source.

Nhãn dùng trong tài liệu: **VERIFIED CURRENT**, **HISTORICAL / SUPERSEDED**, **UNKNOWN / NEEDS SOURCE**, **OPEN ISSUE**, **TECH DEBT**. Khi nói đến production authority, production catalog trong baseline thắng migration lịch sử.

# 1. Executive summary

## 1.1 Kết luận kiến trúc

**VERIFIED CURRENT** — `app.js` là composition root: tạo Supabase client, quản lý session/profile, giữ shared state, tải dữ liệu, định tuyến tám trang và truyền dependency vào bốn module IIFE. `account.js`, `players.js`, `matches.js`, `fund.js` sở hữu workflow tương ứng. Overview, Ranking, Contribution và Tournament vẫn nằm trong `app.js`.

**VERIFIED CURRENT** — frontend có đúng 10 capability helper hiện hành. `hasCapability()` chỉ trả true khi profile active và actor là ADMIN hoặc cột capability tương ứng true. Việc ẩn/hiện này là presentation; authority thật nằm ở RLS, RPC `SECURITY DEFINER`, Edge auth và business-access gate.

**VERIFIED CURRENT** — loader không có một data strategy duy nhất. ADMIN thường đọc trực tiếp 14 bảng trong allow-list; MEMBER/delegated MEMBER được chuyển sang read-model RPC cho Match, Player, Fund và một phần Tournament. Profile hiện tại và own Player vẫn được đọc trực tiếp. Không có direct business table mutation trong năm file frontend chính; mutation đi qua RPC, Edge hoặc Supabase Auth API.

**VERIFIED CURRENT** — static inventory tìm thấy:

- 15 table targets được đọc trực tiếp (14 bảng loader + `profiles`), qua 5 source callsite `.from(...)`; một callsite Guest promotion dùng target động nhưng thực tế là `players`.
- 62 `client.rpc(...)` callsite; do một số callsite chọn tên RPC động, chúng biểu diễn 66 endpoint RPC có thể gọi.
- 5 Edge callsite/endpoint.
- 10 capability types và 144 lần gọi helper role/capability trong năm file JS chính (bao gồm guard lặp lại lúc render/submit).

## 1.2 Mismatch có tác động bảo mật/chức năng cao

1. **OPEN ISSUE — RATING-SCOPE01.** `get_member_rating_events()` trả toàn bộ `rating_events` cho active MEMBER. Ranking có thể lọc khi render, nhưng dữ liệu đã rời backend; frontend không phải security fix.
2. **OPEN ISSUE — UI CONTRACT MISMATCH.** Guest→Member hiện ra cho delegated MEMBER có cả `can_manage_members` và `can_manage_players`, đúng backend contract, nhưng danh sách Guest tải bằng direct SELECT `players`. Production RLS `players` chỉ cho MEMBER đọc own Player; delegated workflow có thể hiện nhưng không lấy được Guest.
3. **OPEN ISSUE.** `matches.js` dùng `rows('leagues')` cho tạo/sửa Match loại League, nhưng `leagues` không có trong `app.js.tables`, không được loader tải và không có label/error state. UI League attach vì vậy nhận mảng rỗng một cách im lặng.
4. **OPEN ISSUE — UI CONTRACT MISMATCH.** `can_adjust_rating` tạo shortcut “VĐV & Rating” trên Overview nhưng không mở một action được capability này cho phép. Action “Điều chỉnh Rating ban đầu” là ADMIN-only theo contract hiện hành.
5. **OPEN ISSUE — UI CONTRACT MISMATCH.** `can_view_audit` được tải, chỉnh trong Account và có helper, nhưng không có Audit page/component/consumer frontend.

## 1.3 Trạng thái V2 cần đưa sang WP-B

**VERIFIED CURRENT** — Overview đã decision-first; Match/Fund/Player/Account có progressive disclosure; Player/Ranking/Fund có responsive rules; normal MEMBER có personal workflows. Fund và Tournament tách collection capability khỏi management capability.

**OPEN ISSUE — UI CONTRACT MISMATCH** — Action Accordion được triển khai riêng tại Account, Player, Match, Fund và Tournament thay vì một shared component. Các comment `V1` không làm pattern hết hiệu lực vì V2 giữ Action Accordion, nhưng implementation duplication mâu thuẫn quy tắc shared component.

**OPEN ISSUE — UI CONTRACT MISMATCH** — Tournament/Contribution và một số danh sách tổng hợp vẫn render từ snapshot lớn, chưa chứng minh đầy đủ search/filter/pagination, pending-first và preservation of context theo V2. Đây là input cho WP-B, chưa phải yêu cầu redesign trong WP-A.

**TECH DEBT** — generic loader có thể tải tới 10.000 row/bảng vào client rồi mới tổng hợp/paginate. Client-side pagination giảm DOM nhưng không giảm network/data exposure; mọi read model phải tiếp tục được backend-scope.

# 2. Frontend module map

| File/module | Trách nhiệm hiện tại | Data/auth boundary | V2 architecture note | Status |
|---|---|---|---|---|
| `index.html` | Auth forms, shell, nav targets, script order | Tải Supabase UMD/config rồi `matches.js`, `players.js`, `fund.js`, `account.js`, cuối cùng `app.js` | Module load order đúng; cache tag mang tên workstream cũ là naming debt | **VERIFIED CURRENT / TECH DEBT** |
| `app.js` | Composition root; state/load/render; auth; Overview; Ranking; Contribution; Tournament; wrappers | Direct tables + read RPC routing + auth/Edge | Quá nhiều surface trong một file; không tự nó là authorization bug | **VERIFIED CURRENT / TECH DEBT** |
| `account.js` | Personal profile/nickname/password; ADMIN member/account/config workflows | RPC, 3 Edge, Auth `updateUser` | Selection-driven detail và Action Accordion; Account administration ADMIN-only | **VERIFIED CURRENT** |
| `players.js` | Create/edit Player; initial rating; lifecycle/delete; Guest promotion; list/detail/history | RPC + one direct Guest `players` query | Current capability split được dùng; promotion direct read mismatch | **VERIFIED CURRENT / OPEN ISSUE** |
| `matches.js` | MEMBER create/confirm/edit/resubmit; management approve/reject/void/replacement; history | RPC + state from loader | Same approval workspace cho ADMIN/delegated; League source missing | **VERIFIED CURRENT / OPEN ISSUE** |
| `fund.js` | Personal Fund portal; collection; campaign/expense; debt; history/reconciliation | State/read models + 4 mutation RPC | Fund manage/collect split đúng; authoritative balance readiness fail closed | **VERIFIED CURRENT** |
| `app.css` | Shared tokens/components plus module-specific responsive rules | Không cấp authority | Navy/Ivory/Electric Lime và semantic variants hiện diện; nhiều equivalent component implementations | **VERIFIED CURRENT / TECH DEBT** |

Script contracts:

- `window.PickAccount = Object.freeze({ create })` và `window.PickMatches = Object.freeze({ create })` — **VERIFIED CURRENT**.
- `window.PickPlayers` và `window.PickFund` expose `create` nhưng object chưa freeze — **TECH DEBT**, không phải authorization issue.
- `app.js` fail loudly nếu module `create` không tồn tại — **VERIFIED CURRENT**.

Shared state contract đáng chú ý:

- `state.profile` chứa role, lifecycle, forced-password flag và đủ 10 capability.
- `state.data`, `errors`, `partial` giữ table/read-model snapshots.
- `state.fundCollectionBalancesReady` chỉ true sau `get_fund_collection_balances()` thành công và response hợp lệ — **VERIFIED CURRENT**.
- `generation`, `AbortController`, session identity checks và module-local request version giảm stale async writes — **VERIFIED CURRENT**.

# 3. Page/surface matrix

## 3.1 Overview

| Mục | Data source | Visibility/action | Backend authority | Status |
|---|---|---|---|---|
| MEMBER personal KPI | Shared state: own Player, own/member-scoped Match/Fund/Tournament data | Normal và delegated MEMBER | Read RLS/RPC scope của loader | **VERIFIED CURRENT** |
| Management “Cần xử lý” | Shared state + capability helpers | ADMIN và delegated MEMBER theo capability | Card chỉ điều hướng; action thật enforce tại module RPC/RLS | **VERIFIED CURRENT** |
| Match pending count | `matches` state, management RPC cho delegated | `can_approve_matches` | Match RPC boundary | **VERIFIED CURRENT** |
| Fund attention count | `state.fundCollectionBalances`; `amount_remaining > 0`; không legacy fallback | `can_manage_fund` hoặc `can_collect_fund` | `get_fund_collection_balances()` | **VERIFIED CURRENT** |
| Player/Rating card | `players` state | manage Player/lifecycle/adjust rating | Destination action phụ thuộc từng RPC | **OPEN ISSUE**: `can_adjust_rating` có shortcut nhưng không có capability action tương ứng |
| Tournament card | `tournaments` state | manage Tournament hoặc collect fee | Destination RPC tách capability | **VERIFIED CURRENT** |

V2: attention trước history và shortcut theo capability phù hợp. **UI CONTRACT MISMATCH** chỉ ở Rating shortcut nêu trên. Chi tiết responsive chưa được live-visual re-certify trong WP-A: **UNSPECIFIED BY V2** đối với exact grid breakpoints, nhưng V2 yêu cầu review desktop/mobile ở WP-B.

## 3.2 Matches

Data:

- ADMIN: direct `matches`, `match_players`, `players`, `tournaments`; `leagues` bị thiếu loader.
- delegated `can_approve_matches`: `get_match_management_matches`, `get_match_management_players`, Player directory/read model.
- normal MEMBER: `get_member_matches`, `get_member_match_players`, Player directory + own Player.
- eligibility confirm: `get_my_pending_match_confirmations()`.

Actions:

- Normal/delegated MEMBER self workflow: create, opponent confirm/reject, edit rejected, resubmit.
- ADMIN/delegated approver: cùng `adminMatchCenter` cho approval/rejection/void/replacement và pending lineup.
- P1.2/P1.2b backend guards remain authoritative.

**VERIFIED CURRENT** — same `can_approve_matches` dùng cùng management component.
**TECH DEBT** — edit rồi resubmit là hai RPC, không atomic; partial-success message đã có.
**OPEN ISSUE** — `leagues` không được load nên attach League hiện là dead/silent-empty path.
**UNKNOWN / NEEDS SOURCE** — exact deployed definitions của nhiều Match RPC chưa source-converged; production behavior đã được baseline verify nhưng không được invent body từ migration cũ.

## 3.3 Players

Data:

- ADMIN: direct full `players`; direct table read chịu ADMIN RLS.
- delegated có `can_manage_players` hoặc `can_manage_player_lifecycle`: `get_member_management_players()`.
- normal MEMBER: `get_player_directory()` cộng direct own Player fields.
- Detail/history lấy từ shared `matches`, `match_players`, `rating_events`; Account link lookup ADMIN-only qua `get_admin_member_permissions()`.
- Promotion candidate accounts qua RPC; Guest candidates qua direct `players` query.

Actions và gates:

| Action | Frontend gate | Backend contract | Status |
|---|---|---|---|
| Create/edit metadata | `can_manage_players` | ADMIN hoặc `can_manage_players` | **VERIFIED CURRENT** |
| Guest→Member | `can_manage_members && can_manage_players` | Cả hai capability hoặc ADMIN | **OPEN ISSUE** do Guest direct read/RLS |
| Lifecycle preview/status | `can_manage_player_lifecycle` | ADMIN hoặc capability | **VERIFIED CURRENT** |
| Initial Rating correction | `isAdmin()` | ADMIN-only | **VERIFIED CURRENT** |
| Hard delete | `isAdmin()` | ADMIN-only + zero-reference lock/recheck | **VERIFIED CURRENT** |

**VERIFIED CURRENT** — `can_manage_members` không còn là proxy Player management.
**VERIFIED CURRENT** — inactive state tách khỏi Account state; historical detail vẫn hiển thị.
**OPEN ISSUE** — two local Player UI fixtures đang patched nhưng Node runtime chưa verify; không nâng thành PASS.

## 3.4 Ranking

Data được tính client-side từ `players`, `matches`, `match_players`, `rating_events`, `rating_settings`; không có mutation. ADMIN nhận direct table data; MEMBER nhận Player/Match read models và `get_member_rating_events()`.

**OPEN ISSUE — SECURITY** — RATING-SCOPE01: MEMBER nhận toàn bộ Rating events từ backend RPC. Việc Ranking chỉ trình bày một phần không thu hồi dữ liệu đã trả.
**VERIFIED CURRENT** — list/detail, rating alignment, history-on-demand và mobile CSS tồn tại.
**UI CONTRACT MISMATCH** — club ranking list chưa có search/filter/pagination rõ ràng; member history có pager. V2 không quy định exact page size cho BXH, nhưng quy định long datasets phải paginate. Ngưỡng “long” là **UNSPECIFIED BY V2**.

## 3.5 Fund

Data:

- ADMIN: direct Fund tables qua loader; authoritative balance RPC cũng được tải.
- delegated `can_manage_fund`/`can_collect_fund`: management contribution/payment read RPC; balance RPC; raw transaction RPC chỉ cho manage.
- collector-only: không đọc raw `fund_transactions`; collection balance/payment view vẫn dùng scoped RPC.
- normal MEMBER: own contributions/payments plus `get_my_fund_obligations`, `get_my_fund_payment_history`, `get_club_fund_summary`.

Actions:

- `can_collect_fund`: single/batch collection.
- `can_manage_fund`: create obligation campaign, record expense, raw ledger view.
- ADMIN đi qua cùng helpers/components như delegated actor.

**VERIFIED CURRENT** — collection/management capability split đúng.
**VERIFIED CURRENT** — NET remaining dùng authoritative balances; lỗi/missing row không silently fallback sang gross cho collection readiness.
**VERIFIED CURRENT** — transaction/payment history có search + client pager 20; debt workspace có filters/pagination.
**TECH DEBT** — admin direct snapshot và delegated RPC snapshot có thể tới 10.000 rows trước client pagination.

## 3.6 Contribution

Read-only “Cống hiến” tổng hợp client-side từ `players`, `matches`, `match_players`, `fund_contributions`. Tất cả role thấy route; dữ liệu thực tế phụ thuộc loader scope.

**VERIFIED CURRENT** — không có mutation hoặc frontend grant.
**OPEN ISSUE — DATA SEMANTICS REVIEW** — phép tổng hợp dùng `fund_contributions.amount_due/status`, không dùng collection balance. Đây là “góc vui” về nghĩa vụ phát sinh, không được code mô tả là outstanding; chưa có bằng chứng bug. WP-B phải giữ wording để không bị hiểu thành NET paid/remaining.
**UI CONTRACT MISMATCH** — render toàn bộ derived player cards, không search/filter/pagination; khi dataset dài sẽ trái V2. V2 không quy định ngưỡng cụ thể: **UNSPECIFIED BY V2**.

## 3.7 Tournament / League

Data:

- `tournaments`: generic direct SELECT cho mọi role, scope theo RLS.
- ADMIN: direct `tournament_registrations` và `tournament_payments`.
- delegated manage/collector: `get_tournament_management_registrations/payments`.
- normal MEMBER: direct registrations/payments, production RLS giới hạn own Player/partner.
- `leagues`: production table tồn tại nhưng frontend loader không tải.

Actions:

- `can_manage_tournaments`: create/update/status Tournament, create registration, confirm/cancel registration.
- normal/delegated MEMBER self registration: `create_my_tournament_registration()` theo backend ownership/eligibility.
- `can_collect_tournament_fee`: record payment; không được suy rộng thành tournament management.

**VERIFIED CURRENT** — tournament management và fee collection tách đúng.
**OPEN ISSUE** — League attach trong Match thiếu source. Không có standalone League management surface trong route hiện tại.
**UI CONTRACT MISMATCH** — Tournament workflow lớn nằm trong `app.js`; long registration/payment lists và pending-first behavior chưa chứng minh đầy đủ theo V2.
**UNKNOWN / NEEDS SOURCE/E2E** — exhaustive refund/reversal/settlement paths chưa được re-certify theo baseline.

## 3.8 Account / Admin

Normal/delegated MEMBER nhận personal summary, self profile editor, nickname claim và password change. ADMIN nhận member directory/detail, approval/rejection, permissions, lifecycle, provisioning, email confirmation, hard delete, birthdays và system configuration.

Data/actions đều qua Account RPC/Edge, ngoài profile hiện tại do `app.js` direct SELECT và `client.auth.updateUser()` cho voluntary password/recovery context.

**VERIFIED CURRENT** — Account lifecycle, role/capability management, hard delete và verification là ADMIN-only ở frontend và backend.
**VERIFIED CURRENT** — detail inline, một detail mở, search/filter/pagination thuộc ACCOUNT-UI01.
**VERIFIED CURRENT** — `can_manage_members` không tự cấp Account-admin action; V2 chỉ yêu cầu parity “within backend-authorized scope”. Current Account mutations trong baseline là ADMIN-only.
**UNKNOWN / NEEDS SOURCE** — deployed `admin-confirm-user` không có repo source.
**UI CONTRACT MISMATCH / TECH DEBT** — Account/Player/Match/Fund tự tạo các accordion tương đương thay vì reuse một shared primitive.

## 3.9 Auth/login/signup/recovery/forced password

| Flow | Consumer/source | Authority | Status |
|---|---|---|---|
| Nickname login | Edge `login-by-nickname`, sau đó `auth.setSession` | Edge resolves nickname bằng service role; Auth password check | **VERIFIED CURRENT**, deployed-source parity **UNKNOWN** |
| Signup config | `get_signup_rating_config()` | Public/bootstrap read helper; exempt khỏi business gate theo baseline | **VERIFIED CURRENT** |
| Signup | `client.auth.signUp()` với provisioning metadata | Auth trigger `handle_new_member_signup()` | **VERIFIED CURRENT** |
| Forgot password | `auth.resetPasswordForEmail()` | Supabase Auth | **VERIFIED CURRENT** |
| Voluntary/recovery update | `auth.updateUser()` trong Account | Supabase Auth self-session | **VERIFIED CURRENT** |
| Forced password | Edge `change-my-password` | Edge + internal readiness/completion RPC; service-role completion | **VERIFIED CURRENT** |

Frontend loader dừng business data khi membership chưa APPROVED, profile inactive hoặc `must_change_password=true`; ACC07B backend business gate vẫn là authority thật. **VERIFIED CURRENT**.

# 4. Direct table reads and RLS dependency

## 4.1 Static read inventory

| Table | Frontend path | Actor | Read shape | Production RLS dependency | Status |
|---|---|---|---|---|---|
| `profiles` | initial profile load | signed-in self | one row by auth user id; all 10 capabilities/lifecycle fields | own-row policy | **VERIFIED CURRENT** |
| `players` | generic loader | ADMIN | full table snapshot | ADMIN or own Player + restrictive business gate | **VERIFIED CURRENT** |
| `players` | explicit own-player load | MEMBER | id/name/phone/dob by linked id | own Player | **VERIFIED CURRENT** |
| `players` | Guest promotion `allRows()` | delegated/ADMIN | GUEST + ACTIVE candidates | ADMIN or own Player | **OPEN ISSUE** for delegated workflow |
| `matches` | generic loader | ADMIN | snapshot | ADMIN direct read | **VERIFIED CURRENT** |
| `match_players` | generic loader | ADMIN | snapshot | ADMIN direct read | **VERIFIED CURRENT** |
| `rating_events` | generic loader | ADMIN | snapshot | ADMIN direct read | **VERIFIED CURRENT** |
| `rating_settings` | generic loader | authenticated business user | snapshot | authenticated SELECT + business gate | **VERIFIED CURRENT** |
| `rating_match_weights` | generic loader | authenticated business user | snapshot | authenticated SELECT + business gate | **VERIFIED CURRENT** |
| `fund_rules` | generic loader | authenticated business user | snapshot | authenticated SELECT + business gate | **VERIFIED CURRENT** |
| `fund_obligation_campaigns` | generic loader | authenticated business user | snapshot | permissive SELECT + business gate | **VERIFIED CURRENT**; excess table DML grant is **TECH DEBT** but no frontend DML |
| `fund_contributions` | generic loader | ADMIN | snapshot | ADMIN/read policy + business gate | **VERIFIED CURRENT** |
| `fund_payments` | generic loader | ADMIN | snapshot | ADMIN/read policy + business gate | **VERIFIED CURRENT** |
| `fund_transactions` | generic loader | ADMIN | snapshot | ADMIN/read policy + business gate | **VERIFIED CURRENT** |
| `tournaments` | generic loader | all approved active users | snapshot | authenticated SELECT + business gate | **VERIFIED CURRENT** |
| `tournament_registrations` | generic loader | ADMIN; normal MEMBER fallback | snapshot | ADMIN hoặc own Player/partner + business gate | **VERIFIED CURRENT** |
| `tournament_payments` | generic loader | ADMIN; normal MEMBER fallback | snapshot | ADMIN hoặc own Player/partner + business gate | **VERIFIED CURRENT** |

Unique direct targets = 15. `players` có ba use-case nên bảng trên có nhiều hơn 15 dòng.

## 4.2 Direct mutation audit

**VERIFIED CURRENT** — không tìm thấy `.insert()`, `.update()`, `.delete()` hoặc `.upsert()` trên business tables trong `app.js`, `account.js`, `players.js`, `matches.js`, `fund.js`. Business mutation đi qua RPC/Edge. Supabase Auth `signUp`, `updateUser`, `resetPasswordForEmail`, `setSession` là Auth API, không phải direct public-table DML.

**TECH DEBT** — `readTable()` dùng direct “probe” rồi paged SELECT tối đa 10.000 rows. Policy denial có thể xuất hiện như empty scoped dataset thay vì explicit authorization error tùy policy, nên frontend không được diễn giải empty là backend capability grant.

**VERIFIED CURRENT** — 8 production tables không có authenticated table grant/policy (`audit_logs`, `awards`, `fund_categories`, rating adjustment tables, Tournament expense/refund auxiliary tables) không được frontend đọc trực tiếp.

# 5. RPC/Edge inventory by surface

## 5.1 RPC endpoints

Static source có 62 `client.rpc` callsite và 66 endpoint có thể chọn vì các tên động/conditional. Các nhóm dưới đây là inventory theo surface; `get_admin_member_permissions` xuất hiện ở cả Account và Player detail nên không được cộng hai lần khi tính 66 unique endpoint.

### Loader/read models — 16 endpoints

`get_match_management_matches`, `get_member_matches`, `get_match_management_players`, `get_member_match_players`, `get_tournament_management_registrations`, `get_tournament_management_payments`, `get_member_rating_events`, `get_fund_management_contributions`, `get_my_fund_contributions`, `get_fund_management_payments`, `get_my_fund_payments`, `get_fund_collection_balances`, `get_my_fund_obligations`, `get_my_fund_payment_history`, `get_club_fund_summary`, `get_fund_management_transactions`.

**VERIFIED CURRENT** — đây là backend-scoped read models, ngoại trừ RATING-SCOPE01.
**UNKNOWN / NEEDS SOURCE** — một số exact production bodies chưa source-converged.

### Player/read-directory — 4 endpoints

`get_member_management_players`, `get_player_directory`, `get_admin_member_permissions`, `get_admin_member_promotion_candidates`.

**VERIFIED CURRENT** — permission boundary theo baseline. `get_admin_member_permissions` là ADMIN-only dù tên helper được dùng trong Player detail.

### Player mutations/preview — 9 endpoints

`create_player`, `update_player`, `set_player_initial_rating_before_history`, `get_player_lifecycle_preview`, `set_player_lifecycle_status`, `delete_player_if_unreferenced`, `admin_set_member_nickname`, `get_admin_member_promotion_preview`, `promote_guest_player_to_member`.

**VERIFIED CURRENT** — create/edit = `can_manage_players`; lifecycle = `can_manage_player_lifecycle`; promotion = member + player; initial correction/hard delete/admin nickname = ADMIN-only as applicable. RPC is boundary, frontend gate is convenience.

### Match — 13 endpoints

`create_pending_match`, `set_pending_match_players`, `create_my_pending_match`, `update_pending_match`, `reject_pending_match`, `void_match_active`, `create_replacement_match`, `approve_match_active`, `reject_match_by_opponent`, `confirm_match_by_opponent`, `update_my_rejected_pending_match`, `resubmit_my_rejected_match`, `get_my_pending_match_confirmations`.

**VERIFIED CURRENT** — P1.2/P1.2b implemented.
**TECH DEBT** — edit + resubmit non-atomic.
**UNKNOWN / NEEDS SOURCE** — many deployed bodies need exact `pg_get_functiondef` source-sync before replacement.

### Fund — 4 mutation endpoints

`create_fund_obligation_campaign`, `record_fund_payment`, `record_fund_expense`, `record_member_fund_payment`.

**VERIFIED CURRENT** — management/collection ACL split, NET/refund-aware authority và atomic batch nằm ở backend.

### Tournament — 7 endpoints

`create_tournament`, `update_tournament`, `change_tournament_status`, `create_tournament_registration`, `create_my_tournament_registration`, `change_tournament_registration_status`, `create_tournament_payment`.

**VERIFIED CURRENT** — management và fee collection tách biệt; self registration dùng ownership/eligibility backend.

### Account/IAM/config — 13 endpoints

`claim_my_nickname`, `update_my_member_profile`, `admin_update_member_permissions`, `get_admin_member_permissions`, `admin_approve_member_signup`, `admin_reject_member_signup`, `get_admin_pending_member_signups`, `admin_set_member_account_active`, `get_admin_member_deletion_preview`, `get_admin_member_lifecycle`, `admin_update_rating_match_weight`, `admin_create_fund_rule_version`, `admin_create_rating_settings_version`.

**VERIFIED CURRENT** — self RPC dùng own identity; `admin_*` trong nhóm này ADMIN-only theo baseline.
**UNKNOWN / NEEDS SOURCE** — exact deployed definition của `update_my_member_profile` và một số Rating functions chưa có complete checked-in source.

### Auth/bootstrap — 1 endpoint

`get_signup_rating_config`.

**VERIFIED CURRENT** — bootstrap read helper, không phải business-management capability endpoint.

## 5.2 Edge endpoints

| Edge | Consumer | Purpose/auth boundary | Repo source | Status |
|---|---|---|---|---|
| `login-by-nickname` | `app.js` | Resolve nickname internally rồi Auth sign-in; response không expose email | Có | **VERIFIED CURRENT** contract; deployed parity **UNKNOWN** |
| `change-my-password` | `app.js` | Forced password, self JWT + internal service-role completion | Có | **VERIFIED CURRENT** contract; deployed parity **UNKNOWN** |
| `admin-create-member` | `account.js` | Active ADMIN provisioning, Auth service role + trigger | Có | **VERIFIED CURRENT** contract; deployed parity **UNKNOWN** |
| `admin-hard-delete-member` | `account.js` | Active ADMIN, snapshot/recheck/public cleanup/Auth delete/recovery | Có | **VERIFIED CURRENT** contract; deployed parity **UNKNOWN** |
| `admin-confirm-user` | `account.js` | Confirm Auth email/user | **MISSING FROM REPO** | **UNKNOWN / NEEDS SOURCE** |

# 6. Capability/role matrix

Legend: **V** visible/read; **A** actionable; **RO** read-only; **H** hidden. Delegated cells are conditional on named capability. Backend mechanism is the authority, not the cell.

| Surface/action | ADMIN | Delegated MEMBER | Normal MEMBER | Backend authority | Status |
|---|---|---|---|---|---|
| Overview personal data | V | V | V | scoped loader/RLS/RPC | **VERIFIED CURRENT** |
| Overview management cards | V/A | V/A theo capability | H | destination RPC/RLS | **VERIFIED CURRENT** |
| Match personal create/confirm | management workflow | V/A | V/A | Match ownership/eligibility RPC | **VERIFIED CURRENT** |
| Match approve/reject/void | V/A | V/A với `can_approve_matches` | H | capability-aware Match RPC | **VERIFIED CURRENT** |
| Player directory/detail | V | V với Player caps; otherwise scoped directory | V/RO scoped | management/directory RPC + own RLS | **VERIFIED CURRENT** |
| Player create/edit | V/A | V/A với `can_manage_players` | H | `create_player`/`update_player` | **VERIFIED CURRENT** |
| Player lifecycle | V/A | V/A với `can_manage_player_lifecycle` | H | lifecycle RPC | **VERIFIED CURRENT** |
| Guest→Member | V/A | V/A với member + player caps | H | promotion RPC | **OPEN ISSUE** direct Guest read blocks delegated data |
| Initial Rating correction | V/A | H | H | ADMIN-only RPC | **VERIFIED CURRENT** |
| Player hard delete | V/A | H | H | ADMIN-only RPC | **VERIFIED CURRENT** |
| Ranking | V/RO | V/RO | V/RO | loader scopes | **OPEN ISSUE** RATING-SCOPE01 |
| Fund personal/transparency | V | V | V | member/management read models | **VERIFIED CURRENT** |
| Fund collection | V/A | V/A với `can_collect_fund` | H | payment/batch RPC | **VERIFIED CURRENT** |
| Fund management/campaign/expense/ledger | V/A | V/A với `can_manage_fund` | H | Fund RPC/read model | **VERIFIED CURRENT** |
| Contribution | V/RO | V/RO | V/RO | scoped shared state | **VERIFIED CURRENT** data access; V2 density issue |
| Tournament browse/self registration | V | V/A own | V/A own | RLS + self-registration RPC | **VERIFIED CURRENT** |
| Tournament management | V/A | V/A với `can_manage_tournaments` | H | Tournament RPC | **VERIFIED CURRENT** |
| Tournament fee collection | V/A | V/A với `can_collect_tournament_fee` | H | payment RPC | **VERIFIED CURRENT** |
| League attach in Match | UI hiện diện nhưng empty | UI hiện diện nhưng empty | UI hiện diện nhưng empty | không có loaded source | **OPEN ISSUE** |
| Personal Account/profile/password | V | V/A self | V/A self | own RPC/Auth/Edge | **VERIFIED CURRENT** |
| Account approval/permissions/lifecycle/delete/config | V/A | H | H | ADMIN-only RPC/Edge | **VERIFIED CURRENT** |
| Rating adjustment theo `can_adjust_rating` | ADMIN initial correction | shortcut nhưng không có action | H | current visible action ADMIN-only | **OPEN ISSUE / UI CONTRACT MISMATCH** |
| Audit browser theo `can_view_audit` | Không có surface | Không có surface | H | không có consumer | **OPEN ISSUE / UI CONTRACT MISMATCH** |

## 6.1 Mapping đủ 10 capability

| Capability | Frontend consumer hiện tại | Tách đúng? | Status |
|---|---|---|---|
| `can_collect_tournament_fee` | Overview + Tournament payment action/read model | Có, tách khỏi manage Tournament | **VERIFIED CURRENT** |
| `can_approve_matches` | Overview + shared Match management center/loader | Có | **VERIFIED CURRENT** |
| `can_manage_tournaments` | Overview + Tournament create/edit/status/registration | Có | **VERIFIED CURRENT** |
| `can_manage_fund` | Overview + campaign/expense/debt/ledger | Có | **VERIFIED CURRENT** |
| `can_manage_members` | Guest promotion khi đồng thời có player cap; Account permission editor label | Không còn làm Player proxy | **VERIFIED CURRENT**, standalone delegated member workflow **UNSPECIFIED BY CURRENT BACKEND SCOPE** |
| `can_manage_players` | Player loader/create/edit + promotion conjunction | Có | **VERIFIED CURRENT** |
| `can_manage_player_lifecycle` | Player management loader + lifecycle action | Có | **VERIFIED CURRENT** |
| `can_adjust_rating` | Overview card/hint; truyền vào Player module nhưng Player action vẫn ADMIN-only | Không có actionable delegated workflow | **OPEN ISSUE** |
| `can_collect_fund` | Overview + Fund collection/balance/payment view | Có, tách khỏi manage Fund | **VERIFIED CURRENT** |
| `can_view_audit` | Profile load/helper/permission editor only | Không có Audit surface | **OPEN ISSUE** |

# 7. Authorization mismatches / security concerns

## A-01 — RATING-SCOPE01

**OPEN ISSUE — SECURITY.** Frontend gọi `get_member_rating_events()` cho mọi non-ADMIN. Production RPC có business gate nhưng trả mọi Player event. Sửa render không sửa leak; cần forward-only backend source-sync + own-player predicate + regression data-scope.

## A-02 — Delegated Guest promotion không khớp RLS

**OPEN ISSUE — UI CONTRACT MISMATCH.** UI gate và mutation RPC cùng cho ADMIN hoặc delegated actor có cả member+player capability. Candidate account dùng RPC, còn Guest dùng direct `players` SELECT. Production policy chỉ ADMIN/own Player. Frontend visibility rộng hơn data read mà backend RLS cho phép, trong khi mutation backend lại cho phép. WP-B/backend package nên cung cấp một scoped candidate read model hoặc gộp Guest candidates vào existing candidate RPC; không nới table RLS chỉ để chữa UI.

## A-03 — League source không được load

**OPEN ISSUE.** Match create/edit đọc `rows('leagues')`, nhưng allow-list/loader không có `leagues`. `sources()` cũng không báo lỗi vì `state.errors.leagues` chưa từng được tạo. Đây là dead/silent-empty frontend path.

## A-04 — `can_adjust_rating` không có action tương ứng

**OPEN ISSUE — UI CONTRACT MISMATCH.** Overview quảng bá nghiệp vụ Rating cho capability này, nhưng Player module chỉ hiện initial-rating correction cho ADMIN. Cần xác minh exact backend scope intended cho `can_adjust_rating` trước WP-B; không tự đổi initial correction khỏi ADMIN-only.

## A-05 — `can_view_audit` không có consumer

**OPEN ISSUE — UI CONTRACT MISMATCH.** Capability có trong profile và permission UI nhưng không có route/read model/browser. Frontend visibility hẹp hơn capability model. Exact Audit RPC/source là **UNKNOWN / NEEDS SOURCE**.

## A-06 — Accordion implementations bị phân mảnh

**OPEN ISSUE — UI CONTRACT MISMATCH / TECH DEBT.** Account dùng `accountAction`, Player dùng `collapsibleAdminSection`, Match dùng `makeMatchActionAccordion`, Fund/Tournament dùng custom `details`/toggle. V2 bắt buộc reuse shared component trước khi tạo module-specific equivalent. Semantic variants có nhưng contract/header/keyboard/mobile behavior không chung một implementation.

## A-07 — Tournament large workspace chưa chứng minh V2 density

**OPEN ISSUE — UI CONTRACT MISMATCH.** Tournament nằm trong khối lớn của `app.js`; có disclosure nhưng long registrations/payments, pending-first, search/filter/pagination và context preservation chưa nhất quán/chưa được audit visual. Backend permission split đúng.

## A-08 — Contribution không có long-list controls

**OPEN ISSUE — UI CONTRACT MISMATCH.** Derived cards render theo toàn bộ eligible Player. Không search/filter/pagination. V2 không quy định ngưỡng cụ thể nên dataset nhỏ có thể chấp nhận; khi long, requirement là bắt buộc.

## A-09 — Ranking club list pagination chưa rõ

**OPEN ISSUE — UI CONTRACT MISMATCH.** Ranking detail/history on-demand và personal history pager tồn tại, nhưng full ranking list chưa có pager/search. V2 yêu cầu pagination cho long dataset; exact threshold **UNSPECIFIED BY V2**.

## A-10 — Client snapshot size/aggregation

**TECH DEBT.** Generic loader tối đa 10.000 rows/table và nhiều surface tổng hợp client-side. Điều này tăng tải, làm authorization phụ thuộc nhiều read path, và khiến client pager không phải backend pagination.

## A-11 — Missing Edge source

**UNKNOWN / NEEDS SOURCE.** `admin-confirm-user` deploy và có consumer nhưng repo không có source. Không refactor/deploy Account verification trước source-sync.

## A-12 — RPC/Edge source convergence

**UNKNOWN / NEEDS SOURCE.** Bốn Edge có source nhưng deployed byte parity chưa export. Nhiều Match/Rating/Fund read-model function chỉ authoritative ở production catalog. Không replace theo migration lịch sử.

## A-13 — Test dependency drift

**OPEN ISSUE / TECH DEBT.** `player-lifecycle01e-ui-test.cjs` và `rating-initial01c-ui-test.cjs` đã được patch local cho `canManagePlayers`, nhưng Node runtime chưa verify theo yêu cầu của WP-A. Giữ nguyên local changes và không báo full regression green.

Tổng findings trong mục A: 13. Trong đó 9 OPEN/UI/technical implementation issues (A-01..A-10 trừ A-11/A-12, với A-13 là test debt) và 2 source unknown groups; nhãn cụ thể ở từng mục là authoritative.

# 8. Historical/superseded frontend patterns

- Dùng `can_manage_members` như Player-management proxy — **HISTORICAL / SUPERSEDED**. Current UI dùng `can_manage_players` và `can_manage_player_lifecycle`; promotion cần cả member + player.
- Dùng role-only để fork một inferior delegated workflow — **HISTORICAL / SUPERSEDED** theo V2. Match/Fund/Tournament hiện chủ yếu dùng capability helpers; Account-admin vẫn role-only vì backend action ADMIN-only.
- Gross `SUM(fund_payments.amount)` hoặc `fund_contributions.status` làm remaining authority — **HISTORICAL / SUPERSEDED**. Current Dashboard/Fund collection dùng NET read model.
- Client gọi legacy forced-password completion RPC — **HISTORICAL / SUPERSEDED**. Current flow dùng Edge.
- V1 là UI authority tổng quát — **HISTORICAL / SUPERSEDED**. Chỉ Action Accordion và rules V2 giữ rõ ràng còn bắt buộc.
- Comments như `PLAYER ACTIONS VISUAL V1`, `FUND ... V1`, `MATCH ... V1` là provenance cũ, không hạ contract hiện tại xuống V1. Compliance phải đo theo V2 — **VERIFIED CURRENT** interpretation.
- Asset query tags gắn tên work package cũ — **TECH DEBT**, không có bằng chứng stale asset ở baseline.

# 9. Unknown / needs source

1. `admin-confirm-user` exact deployed Edge source — **UNKNOWN / NEEDS SOURCE**.
2. Byte-for-byte deployed parity cho bốn Edge có source — **UNKNOWN / NEEDS SOURCE**.
3. Exact current `pg_get_functiondef`, ACL/owner/config cho critical Match/Rating và một số Fund/profile RPC — **UNKNOWN / NEEDS SOURCE** trước khi sửa.
4. Intended backend contract/action set của `can_adjust_rating` ngoài ADMIN-only initial-rating correction — **UNKNOWN / NEEDS SOURCE**.
5. Intended Audit read model/route cho `can_view_audit` — **UNKNOWN / NEEDS SOURCE**.
6. Intended League management/read model and whether `leagues` should be direct RLS read or scoped RPC — **UNKNOWN / NEEDS SOURCE**.
7. Exhaustive Tournament refund/reversal/expense/settlement live E2E — **UNKNOWN / NEEDS SOURCE/E2E**.
8. Exact breakpoint/grid preference where V2 does not specify pixels — **UNSPECIFIED BY V2**; do not turn preference into requirement.
9. Current two patched Player fixture runtime result — **UNKNOWN / NEEDS TEST**; explicitly not PASS.

# 10. Recommended next review package

## WP-B — V2 UI/UX and shared component review

Không thay authority contract. Dùng findings WP-A làm input:

1. Inventory và hợp nhất shared Action Accordion API/semantic variants; giữ long forms collapsed và one-primary-action hierarchy.
2. Review lần lượt ADMIN, delegated MEMBER và normal MEMBER trên desktop/mobile; same capability phải dùng cùng component/workflow.
3. Review pending/exception order, search/filter/pagination và detail-on-demand cho Tournament, Ranking, Contribution; không redesign theo cảm nhận ngoài V2.
4. Xác minh semantic colors, status language và separation Account state vs Player state.
5. Giữ Fund collection/management và Tournament management/fee collection tách biệt.
6. Không mở UI cho `can_adjust_rating`, `can_view_audit` hoặc League trước khi backend/read-model contract được xác minh.

## Backend/source-closure packages nên tách khỏi WP-B

1. **RATING-SCOPE01:** source-sync exact production RPC, own-player scope, security regression.
2. **Player promotion candidate read model:** sửa delegated data-source mismatch mà không nới direct Player RLS.
3. **League source closure:** xác minh production RLS/RPC và nối loader/read model.
4. **Audit capability closure:** inventory backend Audit RPC/data scope trước khi thêm surface.
5. **Edge source convergence:** đưa `admin-confirm-user` source vào repo và verify deployed parity.

## Verification gate trước khi gọi frontend architecture green

- Chạy lại hai patched Player UI fixtures bằng Node; hiện **không PASS**.
- Static syntax/UTF-8/diff checks sau mọi WP sửa source.
- Visual V2 matrix: ADMIN/delegated/normal × desktop/mobile cho surface bị chạm.
- Không dùng frontend visibility để kết luận backend authorization.
- Không commit/push/deploy trong WP-A.

---

## Audit count note

Các con số là static source counts tại HEAD `76a4cbd`:

- Direct table read targets: **15 unique tables**; **5 `.from(...)` source callsites**.
- RPC: **62 callsites**, **66 possible named endpoints**.
- Edge: **5 callsites/endpoints**.
- Capability model: **10 current capabilities**, **144 helper invocations** gồm role/capability render và submit rechecks.
- Findings A-01..A-13: **13 mismatch/issues/unknown groups**.
