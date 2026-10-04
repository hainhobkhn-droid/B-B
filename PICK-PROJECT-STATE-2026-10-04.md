# PICK WEBAPP — Authoritative Project State — 2026-10-04

## 1. Mục đích và cách đọc

Tài liệu này là baseline hiện trạng để bắt đầu các work package tiếp theo. Nó tổng hợp source tại `main`, production catalog Supabase được đọc trực tiếp ngày 2026-10-04, frontend đang phục vụ trên GitHub Pages và bằng chứng test hiện có.

Các nhãn được dùng xuyên suốt:

- **VERIFIED CURRENT**: đã đối chiếu với source hiện tại và/hoặc production catalog/runtime phù hợp với loại contract.
- **HISTORICAL / SUPERSEDED**: còn trong lịch sử hoặc repo để truy vết nhưng không còn là contract hiện hành.
- **UNKNOWN / NEEDS SOURCE**: chưa có source hoặc bằng chứng đủ để khẳng định parity/runtime behavior. Không được suy đoán.

Thứ tự ưu tiên source-of-truth:

1. production catalog/definition cho database đang chạy;
2. source Edge đang deploy nếu đã export được; nếu chưa, chỉ xác nhận được function tồn tại;
3. repo `main` cho frontend, migrations, Edge source và tests;
4. review docs và test evidence cho lịch sử quyết định.

Không có mutation production trong audit này.

## 2. Repository và deployment baseline

| Hạng mục | Hiện trạng | Phân loại |
|---|---|---|
| Repo | `C:\Users\hainh\OneDrive\Desktop\PICK DUPR B&B\B-B-remote-check` | VERIFIED CURRENT |
| Remote | `https://github.com/hainhobkhn-droid/B-B.git` | VERIFIED CURRENT |
| Branch/HEAD | `main` / `76a4cbdce347801f0ea445710eaeeda9bf8add37` | VERIFIED CURRENT |
| `origin/main` | cùng SHA `76a4cbd...` | VERIFIED CURRENT |
| GitHub Pages | `https://hainhobkhn-droid.github.io/B-B/` tải được trang đăng nhập | VERIFIED CURRENT |
| Supabase | project `bflwaqlvnesuqoyikxar`, B&B PICK, branch `main` PRODUCTION | VERIFIED CURRENT |
| Migration source | 38 file, từ `202609210001` đến `202610030009` | VERIFIED CURRENT |
| Remote migration ledger | CLI kết nối được nhưng mọi cột `remote` đều rỗng; production không có `supabase_migrations.schema_migrations` | UNKNOWN / NEEDS SOURCE |
| Duplicate version | `202609280001` dùng cho hai file khác nhau | VERIFIED CURRENT debt |

Production Pages hiện tham chiếu đúng các asset tag trong repo:

- `matches.js?v=match-mobile01-20261003-1`
- `players.js?v=rating-initial01c-20261003-1`
- `fund.js?v=perm01d-20260928-1`
- `account.js?v=account-mod01-20261002-1`
- `app.js?v=match-mobile01-20261003-3`
- `app.css?v=player-lifecycle01e-20261003-1`

Trang production và asset URLs đã được xác nhận; byte-for-byte hash parity giữa từng asset deploy và repo chưa được export. Các cache tag cũ theo tên workstream là debt đặt tên, chưa có bằng chứng là lỗi chức năng.

## 3. Production schema, RLS, grants và triggers

### 3.1 Schema

Production có **24 public tables**, **248 columns**, **65 indexes**; tất cả constraint được kiểm tra đều `VALID`.

Các bảng:

`audit_logs`, `awards`, `fund_categories`, `fund_contributions`, `fund_obligation_campaigns`, `fund_payments`, `fund_rules`, `fund_transactions`, `leagues`, `match_players`, `matches`, `players`, `profiles`, `rating_adjustment_events`, `rating_adjustments`, `rating_events`, `rating_match_weights`, `rating_settings`, `tournament_expense_reversals`, `tournament_expenses`, `tournament_payment_refunds`, `tournament_payments`, `tournament_registrations`, `tournaments`.

Toàn bộ 24 bảng bật RLS. Production có 31 policies.

Các trigger business trên public tables:

- `trg_guard_match_player_mutation` trên `match_players`;
- `trg_guard_match_mutation` trên `matches`;
- `acc06b_guard_forced_password_completion` trên `profiles`;
- `trg_rating_adjustments_immutable` trên `rating_adjustments`;
- `trg_guard_tournament_registration_players` trên `tournament_registrations`.

Signup trigger trên `auth.users` là `on_auth_user_created_member_provision`, gọi `handle_new_member_signup()`.

### 3.2 Business gate

`current_user_business_access_active()` là **VERIFIED CURRENT** production:

- `SECURITY DEFINER`, `STABLE`, fixed `search_path = public, pg_temp`;
- trả true khi `profiles.id = auth.uid()`;
- `is_active = true`;
- `membership_status = 'APPROVED'`;
- `must_change_password IS NOT TRUE`.

15 business tables có restrictive policy `iam05d_membership_gate` dùng helper trên cho `USING` và `WITH CHECK`: Fund core, League, Match, Player, Rating read tables và Tournament core.

Production có 85 `SECURITY DEFINER` functions executable bởi `authenticated`; tất cả có fixed `search_path`. Ba function không chứa business gate là các exemption/helper đã biết: `current_user_is_admin()`, `current_user_membership_active()`, `get_signup_rating_config()`.

### 3.3 Direct table access

`authenticated` có direct SELECT trên các read tables chính; scope tiếp tục do RLS quyết định. Ví dụ:

- `players`: ADMIN hoặc own Player;
- `profiles`: own row;
- `matches`, `match_players`, `rating_events`: ADMIN direct read;
- tournament registrations/payments: ADMIN hoặc own Player/partner;
- business gate vẫn restrictive phía trên permissive SELECT.

`authenticated` có table privileges rộng trên `fund_obligation_campaigns`, gồm INSERT/UPDATE/DELETE, nhưng production chỉ có permissive SELECT policy và restrictive business gate; vì không có permissive write policy, direct DML hiện fail closed. Đây là **least-privilege debt**: nên source-sync và cân nhắc revoke privilege thừa trong work package riêng, không thay trong audit.

Tám bảng không có policy: `audit_logs`, `awards`, `fund_categories`, `rating_adjustments`, `rating_adjustment_events`, `tournament_expenses`, `tournament_expense_reversals`, `tournament_payment_refunds`. Chúng cũng không có direct table grant cho `authenticated`; truy cập nghiệp vụ đi qua RPC `SECURITY DEFINER`. Trạng thái hiện tại là **VERIFIED CURRENT**, nhưng mọi RPC mới chạm các bảng này phải được review ACL/body.

## 4. Account / IAM

### 4.1 Lifecycle hiện hành

`profiles.membership_status`: `PENDING`, `APPROVED`, `REJECTED`.

`profiles.is_active`: trạng thái tài khoản sau approval; constraint yêu cầu trạng thái khác `APPROVED` phải inactive. `players.status` là trạng thái tham gia thể thao riêng, không phải trạng thái account.

| Trạng thái account | Login/session | Business data | Admin action |
|---|---|---|---|
| PENDING + inactive | có thể nhận session qua nickname flow sau xác thực password | bị business gate chặn | approve/reject |
| REJECTED + inactive | có thể nhận session để xem trạng thái | bị business gate chặn | review lại theo contract hiện hành |
| APPROVED + active + forced password | login được | bị gate chặn đến khi đổi password | password completion |
| APPROVED + active + password complete | đầy đủ theo ownership/capability | được phép | capability/lifecycle theo quyền |
| APPROVED + inactive | login response bị từ chối hoặc business gate chặn | không | ADMIN reactivate |

### 4.2 Contract hiện hành

- Signup trigger provision Profile/Player; initial Rating lấy từ `get_signup_rating_config()`.
- Approval/rejection: `get_admin_pending_member_signups`, `admin_approve_member_signup`, `admin_reject_member_signup`; ADMIN-only và audit.
- Self profile: `update_my_member_profile(text,text,date)`; business-gated.
- Nickname: case-insensitive uniqueness được enforce bằng unique partial index `profiles_login_name_lower_uidx` trên `lower(login_name)` khi non-null.
- Capability management: `get_admin_member_permissions`, `admin_update_member_permissions`; ADMIN-only, audit, inactive target revoke-only.
- Account lifecycle: `admin_set_member_account_active`; ADMIN-only; deactivation thu hồi toàn bộ delegated capabilities.
- Hard delete: preview/snapshot RPC + `admin-hard-delete-member` Edge + tombstone/recovery completion; ADMIN-only, reference-aware.
- Forced password: `change-my-password` Edge dùng readiness/completion internal RPC service-role. Legacy `complete_my_password_change()` vẫn tồn tại nhưng ACL chỉ còn `postgres`, không callable bởi anon/authenticated/service_role.

**Status:** ACC03, ACC04, ACC05, ACC06 và ACC07B đều **VERIFIED CURRENT / CLOSED** theo scope đã đóng.

### 4.3 Capability model

10 capability columns production:

`can_collect_tournament_fee`, `can_approve_matches`, `can_manage_tournaments`, `can_manage_fund`, `can_manage_members`, `can_manage_players`, `can_manage_player_lifecycle`, `can_adjust_rating`, `can_collect_fund`, `can_view_audit`.

ADMIN tiếp tục role-based; không cần backfill capability. Frontend mirror quyền để ẩn/hiện UI, backend RPC là security boundary.

**HISTORICAL / SUPERSEDED:** dùng `can_manage_members` như quyền Player tổng quát; business gate cũ chỉ kiểm tra membership mà không kiểm tra forced password; client gọi legacy completion RPC để clear flag.

## 5. Player / VĐV

### 5.1 Model và lifecycle

`players.status` chỉ có `ACTIVE` / `INACTIVE`; không có `ARCHIVED`, `is_active` hay `archived_at`.

Contract hiện hành:

- tạo/sửa metadata: ADMIN hoặc `can_manage_players`;
- deactivate/reactivate: ADMIN hoặc `can_manage_player_lifecycle`, reason bắt buộc, row lock + audit;
- `update_player` là metadata-only, không được bypass lifecycle;
- hard delete: ADMIN-only, chỉ khi authoritative `reference_total = 0`, lock + recheck + tombstone;
- initial Rating correction trước lịch sử Rated: ADMIN-only;
- Guest→Member: ADMIN hoặc đồng thời `can_manage_members` + `can_manage_players`;
- lifecycle preview: ADMIN hoặc `can_manage_player_lifecycle`;
- directory quản trị đầy đủ: ADMIN hoặc `can_manage_players` hoặc `can_manage_player_lifecycle`.

Authoritative inventory tính cả primary/partner references ở Match/Tournament, Rating, Fund, Awards và Profile. Audit metadata không tự biến mọi Player thành permanent blocker.

Historical data được giữ khi INACTIVE. Player inactive không hợp lệ cho trận/registration mới theo guard/RPC hiện hành.

**Status:** PLAYER-LIFECYCLE01, RATING-INITIAL01 và PLAYER-PERMISSION01 là **VERIFIED CURRENT / CLOSED**.

## 6. Match

Các status production: `PENDING`, `APPROVED`, `INVALID`, `VOIDED`. Match types: `TOURNAMENT`, `LEAGUE`, `CLUB_RATED`, `FRIENDLY_RATED`, `SELF_REPORTED`, `TRAINING`.

Contract P1.2/P1.2b:

- MEMBER tạo `CLUB_RATED`, `FRIENDLY_RATED`, `TRAINING`, phải tham gia và dùng 4 Player ACTIVE distinct;
- standard CLUB/FRIENDLY cần đối thủ hợp lệ confirm hoặc reject;
- creator/teammate không được confirm thay đối thủ;
- rejection reason 3..1000, trạng thái vẫn `PENDING`, giữ rejection marker;
- creator sửa qua `update_my_rejected_pending_match`, rồi gọi riêng `resubmit_my_rejected_match`;
- resubmit clear rejection/confirmation;
- admin/capability approval flow dùng `approve_match_active`, reject admin đưa về `INVALID`;
- void/replacement giữ lịch sử, Rating/Fund được xử lý trong backend transaction theo contract.

Frontend `matches.js` đã wire các RPC create/edit/confirm/reject/resubmit/approve/void/replacement và dùng `get_my_pending_match_confirmations()` làm authoritative eligibility.

**Status:** P1.2/P1.2b và MATCH-UI01 **VERIFIED IMPLEMENTED / CLOSED**.

**Technical debt:** Edit + Resubmit là hai RPC liên tiếp, không atomic. Nếu edit thành công nhưng resubmit lỗi, dữ liệu mới đã lưu và rejection vẫn còn; UI có thông báo partial success.

## 7. Rating

### 7.1 Engine V1.1

Production active version là V1.1; V1.0 inactive. Hai version hiện cùng config: initial 4, min 2, max 8, K 0.55, sensitivity 0.9, provisional 5, stable 10, half-life 60 ngày, floor 0.35, delta cap 0.35.

Weights: Tournament 1.0; League 0.95; Club Rated 0.9; Friendly Rated 0.6; Self Reported 0.4; Training 0.

V1.1 full rebuild:

- advisory lock `726184501`;
- reset current Rating về initial;
- xóa derived events của version;
- replay timeline MATCH trước ADJUSTMENT tại cùng thời điểm;
- team average, expected share logistic, actual share theo POINTS/RESULT;
- provisional + recency + weight + K;
- delta và final Rating clamps;
- adjustments append-only; correction tạo reverse adjustment;
- approval Match, rebuild Rating và Fund generation cùng transaction.

Production baseline được kiểm tra lại ngày 2026-10-04:

- 25 Players: 23 ACTIVE, 2 INACTIVE;
- 60 APPROVED matches, toàn bộ `CLUB_RATED`;
- 240 `rating_events`, 60 matches, 23 players, toàn bộ V1.1;
- 0 adjustments, 0 corrections, 0 adjustment events;
- current Rating avg 3.9308, min 2.368, max 5.586;
- 23/23 Player có history khớp final V1.1 event; mismatch = 0;
- Player không có history đều `current_rating = initial_rating`.

**Rating V1.1 projection integrity: VERIFIED CURRENT / OK.**

### 7.2 Status and open issues

**RATING-SCOPE01 — DEPLOYED / PARTIALLY VERIFIED.**

Migration `202610040001_rating_scope01_member_rating_events_own_player.sql` đã được apply riêng lẻ qua Supabase SQL Editor. Production function giữ owner, `SECURITY DEFINER`, fixed search path, ACL và RLS; query hiện scope bằng `re.player_id = current_user_player_id()`. Hai identity MEMBER production khác Player trả đúng 19/19 và 18/18 own events, foreign count = 0; ACC07B negative identity bị chặn. Rating events, Player Rating, Match, adjustment và active-config hashes/counts không đổi. ADMIN frontend BXH smoke PASS. Còn thiếu real MEMBER browser/PostgREST UI session smoke nên chưa ghi `CLOSED / VERIFIED PRODUCTION`.

**RATING-CALIBRATION01-A — DESIGN ONLY / NOT IMPLEMENTED.**

`admin_create_rating_settings_version()` hiện deactivate version cũ, tạo active version mới rồi full rebuild toàn lịch sử trong cùng transaction. Chưa có grandfather current Rating, cutover baseline, future-only algorithm, preview/rollback calibration.

**HISTORICAL / SUPERSEDED:** V1.0 là inactive config; không phải engine active.

## 8. Fund

Backend authoritative hiện hành:

- obligation campaigns/rules/contributions;
- payment/refund append-only ledger;
- NET PAID = gross `fund_payments` trừ refund `fund_transactions` liên kết payment gốc;
- `get_fund_collection_balances()` là read model authoritative cho remaining;
- batch collection `record_member_fund_payment` atomic, backend allocation oldest-first, reuse internal payment engine, overpayment blocked;
- per-payment audit + batch-level audit;
- collector-only không cần raw `fund_transactions`;
- Dashboard không fallback về legacy contribution status khi read model chưa ready.

Frontend `fund.js` dùng workflows Quỹ; `app.js` giữ state `fundCollectionBalances` và `fundCollectionBalancesReady`. Management theo `can_manage_fund`; collection theo `can_collect_fund`; transparency/member read RPC riêng.

**Status:** FUND03E/FUND04, DASH-FUND01 và Fund UI v2 theo scope hiện tại là **VERIFIED CURRENT / CLOSED**.

**HISTORICAL / SUPERSEDED:** chỉ `SUM(fund_payments.amount)` hoặc `fund_contributions.status` làm source-of-truth cho remaining.

Debt cần giữ:

- production migration ledger không chứng minh được các file Fund đã apply theo migration tool;
- `fund_obligation_campaigns` còn direct table privileges rộng nhưng write bị RLS deny như mục 3.3;
- orphan refund/reversal integrity phải tiếp tục được audit bằng read-only query khi triển khai thay đổi ledger.

## 9. Tournament / League

Production model gồm Tournament, registrations, payments, payment refunds, expenses, expense reversals và League. FK Player/partner là `ON DELETE RESTRICT`; historical rows được bảo toàn.

Các status chính:

- Tournament: `DU_KIEN`, `MO_DANG_KY`, `DANG_DIEN_RA`, `DA_KET_THUC`, `DA_QUYET_TOAN`, `HUY`;
- registration: `DANG_KY`, `DA_XAC_NHAN`, `HUY`;
- League: `DU_KIEN`, `DANG_DIEN_RA`, `DA_KET_THUC`, `HUY`.

RPC management bao gồm create/update/status/settle Tournament, create/status registration, payment/refund, expense/reversal và finance summary. MEMBER self-registration dùng `create_my_tournament_registration`; backend trigger guard kiểm tra Player/partner eligibility. `can_manage_tournaments` và `can_collect_tournament_fee` tách quyền quản lý và thu phí.

Frontend Tournament/League hiện vẫn nằm chủ yếu trong `app.js`; direct reads scoped bởi RLS, mutation qua RPC.

**Status:** permission/backend contract theo PERM01B2 và MP01 normalization là **VERIFIED CURRENT**. Full end-to-end production replay cho mọi refund/reversal/status path trong audit này là **UNKNOWN / NEEDS SOURCE/E2E**; không có bug mới được chứng minh.

## 10. Edge Functions

Production dashboard xác nhận 5 functions:

| Function | Repo source | Frontend consumer | Trạng thái |
|---|---|---|---|
| `login-by-nickname` | có | `app.js` | existence VERIFIED; deployed-source parity UNKNOWN |
| `admin-create-member` | có | `account.js` | existence VERIFIED; deployed-source parity UNKNOWN |
| `admin-hard-delete-member` | có | `account.js` | existence VERIFIED; deployed-source parity UNKNOWN |
| `change-my-password` | có | `app.js` | existence VERIFIED; deployed-source parity UNKNOWN |
| `admin-confirm-user` | **MISSING FROM REPO** | `account.js` | UNKNOWN / NEEDS SOURCE |

Checked-in contracts:

- nickname login dùng service role để resolve `login_name -> profile/auth user`, lấy email nội bộ rồi đăng nhập bằng public key; response không expose email; invalid lookup/password cùng `INVALID_LOGIN`. Constant-time/timing-enumeration resistance và rate limiting chưa được chứng minh.
- admin create member xác thực caller JWT + active ADMIN, tạo Auth user bằng service role và trusted provisioning metadata; signup trigger tạo Profile/Player, forced-password true.
- hard delete xác thực active ADMIN, snapshot/reference recheck, public cleanup, Auth delete, tombstone/recovery completion.
- change password xác thực self JWT; readiness internal trước Auth mutation; Auth password update dùng user JWT; completion internal dùng service role.

Không được coi repo source của bốn function là byte-identical với production khi chưa export/hash deployed source. `admin-confirm-user` cần source-sync riêng trước mọi refactor hoặc deploy liên quan.

## 11. Frontend architecture và UI contract

Root frontend:

- `app.js`: auth/session, shared state/load/render, Overview, BXH, Tournament/League, Contribution và module wrappers;
- `account.js`: `window.PickAccount = Object.freeze({ create })`;
- `players.js`: `window.PickPlayers` module;
- `matches.js`: `window.PickMatches` module;
- `fund.js`: `window.PickFund` module;
- `app.css`, `index.html`, `config.js`.

Account, Player, Match và Fund mutation workflows chủ yếu dùng RPC/Edge. `app.js` tải các read tables chung; direct reads tiếp tục chịu RLS. Frontend capability helpers chỉ quyết định presentation; backend quyết định authority.

`PICK-UI-SYSTEM-V2.md` là **VERIFIED CURRENT / REQUIRED** cho ADMIN, delegated MEMBER, normal MEMBER, desktop/mobile. `PICK-UI-SYSTEM-V1.md` là **HISTORICAL / SUPERSEDED**, trừ các pattern V1 được V2 giữ lại rõ ràng như Action Accordion.

Các workstream UI/account module đã đóng: Fund UI scope hiện tại, MATCH-UI01, ACCOUNT-UI01, ACCOUNT-MOD01, Player lifecycle/permission surfaces.

## 12. Function source convergence

Production catalog là authoritative cho nhiều function vì migration ACC07B dùng dynamic `pg_get_functiondef` patching và repo không có baseline schema đầy đủ.

Các current production functions quan trọng không có full checked-in `CREATE FUNCTION` source tương ứng gồm Rating engine internals/wrappers, nhiều Match member flows/read models, `update_my_member_profile`, `current_user_is_admin`, một số Member Fund read models và match mutation guards. Ví dụ:

`_approve_match_internal`, `_generate_match_fund_internal`, `_get_active_rating_version`, `_rebuild_ratings_internal`, `admin_create_rating_settings_version`, `admin_update_rating_match_weight`, `approve_match_active`, `confirm_match_by_opponent`, `create_my_pending_match`, `get_member_rating_events`, `get_my_pending_match_confirmations`, `reject_match_by_opponent`, `resubmit_my_rejected_match`, `update_my_rejected_pending_match`, `update_pending_match`, `void_match_active`.

Những function này có thể **VERIFIED CURRENT** về production behavior khi đã đọc catalog/test, nhưng trạng thái source convergence vẫn là **UNKNOWN / NEEDS SOURCE**. Không invent body từ migration cũ; phải export exact `pg_get_functiondef`, ACL, owner, config, trigger/policy contract trước khi sửa.

## 13. Test inventory và kết quả audit này

Repo có tests cho ACC03–ACC07B, IAM05D, Fund03E/Fund04, Dashboard Fund, MP01, PERM01C, Player lifecycle, Player permission và Rating initial.

Ngày 2026-10-04:

- JS/CJS syntax toàn bộ: PASS;
- Python AST toàn bộ: PASS;
- Node regressions PASS: ACC03, ACC04, ACC05 Edge/UI, ACC06 nickname, ACC06B password, DASH-FUND01, FUND04 UI, IAM05D Edge;
- PLAYER-PERMISSION01 local PostgreSQL: PASS;
- RATING-INITIAL01B local PostgreSQL/concurrency: PASS;
- PLAYER-LIFECYCLE01D local PostgreSQL/concurrency: PASS;
- `player-permission01-ui-fixture.py` là fixture server, không phải standalone assertion suite.

Hai Player UI fixtures đã được source-sync dependency `canManagePlayers` /
`canManagePlayerLifecycle` và chạy PASS. Test debt ghi nhận trong WP-A đã đóng.

Các local PostgreSQL tests dùng fixture tổng hợp, không thay thế production Auth/PostgREST/browser E2E. Các closed workstream vẫn giữ bằng chứng E2E đã ghi trong lịch sử; hai delegated/normal MEMBER Player lifecycle live sessions là residual verification gap đã chấp nhận ở closeout.

## 14. Roadmap/status reconciliation

### CLOSED / VERIFIED CURRENT

- ACC03 / ACC04 account presentation/workspace;
- ACC05 safe account hard delete;
- ACC06 nickname + forced-password flow;
- ACC07B business-access gate;
- Fund backend/UI theo scope FUND03E/FUND04 và Dashboard fix;
- MATCH P1.2/P1.2b, MATCH-UI01;
- ACCOUNT-UI01, ACCOUNT-MOD01;
- PLAYER-LIFECYCLE01;
- RATING-INITIAL01;
- PLAYER-PERMISSION01;
- Rating V1.1 projection integrity.

### OPEN BUGS / SECURITY

1. **Source convergence:** deployed `admin-confirm-user` missing from repo; nhiều critical DB functions chỉ có production definition.

### DEPLOYED / VERIFICATION GAP

- **RATING-SCOPE01:** backend own-player scope đã deploy và production RPC isolation PASS với hai MEMBER identity; real MEMBER browser/PostgREST UI session smoke chưa chạy.
- **WP-C2 promotion read model:** backend và frontend đã deploy production;
  catalog, ADMIN data scope, single-cap/normal/business-gate rejection và ADMIN
  desktop/mobile PASS. Production chưa có delegated MEMBER mang đồng thời
  `can_manage_members` + `can_manage_players`, nên delegated live RPC/browser là
  residual verification gap; local PostgreSQL/Node branch này PASS. Trạng thái:
  **DEPLOYED / PARTIALLY VERIFIED**.

### DESIGN ONLY / DEFERRED

- **RATING-CALIBRATION01-A:** future-only/grandfather calibration chưa implement.
- Tournament/League full UI v2 decomposition và exhaustive live finance paths chưa được re-certified trong audit này.

### TOOLING / DEPLOYMENT DEBT

- production migration ledger không hiện diện/không đồng bộ với local migrations;
- duplicate migration version `202609280001`;
- repo không phải full bootstrap schema;
- `supabase db dump` không chạy trên máy hiện tại vì thiếu Docker/Podman; không cài chỉ để audit;
- asset cache tag names cũ;
- untracked `supabase/.temp/` do CLI, không phải source để commit.

## 15. Nguyên tắc cho work package tiếp theo

1. Đọc file này trước, sau đó đọc `AGENTS.md` và source/domain docs liên quan.
2. Production catalog thắng migration lịch sử khi có drift; source-sync exact definitions trước khi replace.
3. Chỉ dùng migration forward-only; không sửa migration đã deploy.
4. Giữ ACC07B business gate, fixed `search_path`, ACL least privilege và backend authoritative.
5. Không dùng frontend visibility làm authorization.
6. Chạy regression trực tiếp của domain + ACC07B/security + UTF-8 + `git diff --check`.
7. Không commit/push/deploy nếu work package không cho phép rõ ràng.
