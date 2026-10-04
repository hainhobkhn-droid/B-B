# PICK WEBAPP — WP-C3 League Data Source Reconciliation

Ngày review: 2026-10-04
Baseline: `95fb2d2 feat: add authoritative promotion candidate read model`
Production project được kiểm tra read-only: `bflwaqlvnesuqoyikxar`

# 1. Root cause

`matches.js` đã dùng `rows('leagues')` tại hai workflow ADMIN:

- tạo trận PENDING, để gắn `p_league_id` khi `match_type = 'LEAGUE'`;
- sửa trận PENDING, để giữ hoặc đổi `p_league_id`.

`app.js` không đăng ký `leagues` trong `tables`, nên shared loader không bao giờ gọi `readTable('leagues')`. `rows()` trả `[]` khi key chưa tồn tại, vì vậy selector trông giống dataset rỗng hợp lệ. Dù `matchesPage()` đã gọi `sources(..., 'leagues')`, `state.errors.leagues` cũng không thể xuất hiện vì loader chưa từng thử tải nguồn này.

Replacement Match không có League selector; backend giữ association từ trận nguồn. MEMBER self-create không nhận `p_league_id`. WP-C3 không thay các contract này.

# 2. Current frontend data flow

Sau WP-C3:

1. `leagues` nằm trong shared `tables` allow-list.
2. Mọi phiên business hợp lệ tải nguồn này ngay trong `load()`, song song với các nguồn chung; không phụ thuộc việc mở page khác.
3. `readTable('leagues')` dùng generic direct `select('*')`, pagination và abort/generation protection sẵn có.
4. Kết quả thành công được ghi vào `state.data.leagues`; lỗi được ghi vào `state.errors.leagues`.
5. `matches.js` chỉ đưa `DU_KIEN` và `DANG_DIEN_RA` vào selector, giữ nguyên rule hiện hành.

# 3. Production League read contract

Kết quả catalog production read-only:

- cột: `id uuid`, `name text`, `code text`, `start_date date`, `end_date date`, `status text`, `notes text nullable`, `created_by uuid nullable`, `created_at timestamptz`, `updated_at timestamptz`;
- RLS bật, không force RLS;
- permissive SELECT policy `leagues_authenticated_select`: role `authenticated`, `USING true`;
- restrictive ALL policy `iam05d_membership_gate`: role `authenticated`, cả USING/WITH CHECK gọi `current_user_business_access_active()`;
- `authenticated` chỉ có table grant `SELECT`;
- `anon` không có table grant;
- ADMIN và normal MEMBER có business access đều đi qua cùng read contract; delegated capability không làm proxy cho nguồn reference data này;
- không có League read RPC/read model hiện hữu;
- chỉ có `create_pending_match` và `update_pending_match` nhận `p_league_id`;
- `matches.league_id` tham chiếu `leagues(id) ON DELETE RESTRICT`;
- production hiện có 0 League, nên status distribution rỗng.

# 4. Options evaluated

1. **Existing direct read:** phù hợp production grants/RLS và generic reference-data loader hiện tại.
2. **Existing RPC:** không có League read RPC phù hợp.
3. **Dedicated read model:** không cần thiết; sẽ duplicate policy mà không tăng security cho contract shared read hiện hành.

# 5. Chosen design

Chọn Option 1:

- thêm `leagues` vào shared loader và labels;
- không tạo migration/RPC;
- giữ backend/RLS là authority;
- làm placeholder selector phân biệt loading, empty và failure;
- bump cache tags của `app.js` và `matches.js` để lần deploy sau không phục vụ asset cũ.

# 6. Files changed

- `app.js`: đăng ký shared League source và label lỗi.
- `matches.js`: empty/loading/error state rõ cho create/edit League selector.
- `index.html`: cache tags WP-C3 cho hai asset đã đổi.
- `supabase/tests/wp-c3-league-data-source-ui-test.cjs`: regression loader/selector/Match contract.
- `PICK-WP-C3-LEAGUE-DATA-SOURCE-2026-10-04.md`: review và deployment record.

# 7. Security impact

- Không đổi RLS, grant, capability, RPC hoặc mutation.
- Không thêm direct League mutation.
- `anon` vẫn không đọc được.
- `authenticated` chỉ đọc khi đồng thời qua business-access gate.
- ADMIN và MEMBER dùng đúng cùng read scope production hiện hành.

# 8. Match workflow impact

- ADMIN create/edit PENDING Match có League source ngay sau shared load.
- `p_league_id` vẫn chỉ gửi khi `match_type = 'LEAGUE'`.
- Chỉ League trạng thái `DU_KIEN` hoặc `DANG_DIEN_RA` được chọn mới.
- P1.2 confirm, P1.2b reject/edit/resubmit, approve/reject, void/replacement và Rated Match rules không đổi.
- Backend tiếp tục validate association.

# 9. Tests

- JS syntax: PASS cho `app.js`, `matches.js` và test WP-C3.
- WP-C3 Node fixture: PASS cho shared load registration, populated options, valid empty state, loading state, loader-error state, create/edit wiring, P1.2/P1.2b endpoint presence và no League mutation.
- Local ADMIN browser với production data: PASS; source load hoàn tất, create selector hiển thị `Chưa có giải nội bộ phù hợp` khi production có 0 row, không có console error ứng dụng.
- Toàn bộ 12 frontend CJS suites hiện có: PASS, gồm ACC03/04/05/06/06B, DASH-FUND01, FUND04, IAM05D, Player lifecycle, WP-C2 promotion, Rating Initial và WP-C3.
- UTF-8: PASS; 5 file WP-C3 đều no BOM và U+FFFD = 0.
- `git diff --check`: PASS (chỉ có cảnh báo line-ending đã tồn tại trong working tree, không có whitespace error).

# 10. UI behavior

- Có League phù hợp: selector hiển thị tên, code và trạng thái.
- Dataset đã tải nhưng rỗng/không có status phù hợp: `Chưa có giải nội bộ phù hợp`.
- Loader lỗi: `Không tải được danh sách giải nội bộ`; shared source notice có retry.
- Load chưa hoàn tất: `Đang tải danh sách giải nội bộ…`.

Không refactor hierarchy/layout trong WP-C3.

# 11. Production deployment requirement

**NO MIGRATION.** Chỉ cần deploy frontend gồm `app.js`, `matches.js`, `index.html`; sau deploy phải kiểm tra cache tags và smoke ADMIN. Không có production mutation trong WP-C3 preparation.

# 12. Remaining unknowns

- Production hiện không có League row, nên populated selector được chứng minh bằng Node fixture; live populated-data smoke cần một League hợp lệ có sẵn trong môi trường test ở lần verification sau.
- Không có live normal MEMBER browser session trong WP-C3; MEMBER read contract được xác minh từ production grants/RLS và shared loader không có role branch cho `leagues`.

# 13. Final status

**READY FOR PRODUCTION DEPLOY**

Chưa ghi CLOSED trước production frontend verification.
