# PICK UI System v2

Status: ACTIVE / REQUIRED
Supersedes: PICK UI System v1
Scope: Entire PICK WEBAPP
Applies to: ADMIN, delegated MEMBER, normal MEMBER, Desktop, Mobile

PICK UI System v1 remains historical documentation.
PICK UI System v2 is the current design contract.

---

## 1. Purpose

PICK WEBAPP is not only a data-entry application.

Its management interface must help authorized users:

1. understand the current state of the club quickly;
2. identify work requiring attention;
3. make safe decisions;
4. complete authorized work with minimal navigation;
5. review large datasets without excessive scrolling;
6. preserve context while moving between lists and details.

The primary management UX principle is:

> Show what needs attention first, then provide the shortest safe path to act.

---

## 2. Core principles

All rules from PICK UI System v1 remain valid unless explicitly replaced here.

Required principles:

- Same business data uses the same visual language across the app.
- ADMIN and MEMBER do not receive unrelated UI designs for the same workflow.
- Authorization comes from backend capability / ownership / eligibility rules.
- Frontend never independently grants authority.
- Reuse shared components before creating module-specific patterns.
- Primary information appears before metadata.
- Long forms remain collapsed until needed.
- Desktop optimizes comparison and data density.
- Mobile optimizes sequential task completion.
- Mobile is not a mechanical one-column collapse of desktop.
- Large datasets use pagination rather than endless vertical rendering.
- Detailed information is shown on demand.
- Pending, overdue, rejected and exceptional work receives higher visual priority than completed history.

---

## 3. Decision-first management

Management screens must answer three questions quickly:

1. What is happening?
2. What requires my attention?
3. What can I do now?

Important pending or exceptional states must appear before ordinary historical data.

Examples:

### Matches
- Waiting for opponent confirmation
- Waiting for approval
- Rejected / disputed
- Invalid
- Recently approved

### Members
- Waiting for membership approval
- Active
- Deactivated
- Rejected

### Fund
- Unpaid obligations
- Payments waiting for confirmation
- Overdue obligations
- Recent income / expense

### Tournaments
- Registration pending
- Fees unpaid
- Active tournaments
- Items requiring settlement

Do not force a manager to scan hundreds of completed records to discover pending work.

---

## 4. Capability-driven management UX

Role alone must not define the management interface.

The governing rule is:

> Same capability = same management workflow and shared component.

Examples:

- ADMIN and MEMBER with `can_approve_matches` use the same match approval workspace.
- ADMIN and MEMBER with `can_manage_tournaments` use the same tournament management workflow.
- ADMIN and MEMBER with `can_manage_fund` use the same fund-management workspace for authorized actions.
- ADMIN and MEMBER with `can_collect_fund` use the same collection workflow.
- ADMIN and MEMBER with `can_collect_tournament_fee` use the same tournament-fee collection workflow.
- ADMIN and MEMBER with `can_manage_members` use the same member-management workflow within backend-authorized scope.
- ADMIN and MEMBER with `can_adjust_rating` use the same rating-adjustment workflow.
- ADMIN and MEMBER with `can_view_audit` use the same audit browsing components.

ADMIN-only capabilities such as account administration, password management, role changes and delegated-permission management remain ADMIN-only.

Do not create a second inferior management UI for delegated MEMBER users.

---

## 5. Management Workspace pattern

Large management modules should follow this order:

### A. Workspace header
Contains:
- page/module title;
- concise description when needed;
- important counts;
- primary action when appropriate.

### B. Attention summary
Contains only actionable or exceptional states.

Examples:
- 4 matches waiting for approval
- 2 new members waiting for approval
- 6 unpaid fund obligations

### C. Search / filter / sort toolbar
Contains only controls useful for the current dataset.

### D. Paginated data list
Compact records optimized for scanning.

### E. Detail on demand
Open detail only when a record is selected.

### F. Actions
Place actions near the relevant record or detail.

Do not place several long management forms permanently above a dataset.

---

## 6. Pagination standard

Long business datasets must use pagination.

Do not use infinite scroll for management datasets.

Recommended defaults:

- Players / Members: 20–25 records per page.
- Matches: 20–30 records per page.
- Fund transactions / payments: 20–30 records per page.
- Tournament registrations / payments: 20–30 records per page.
- Audit log: 30–50 records per page.

A module may use another page size when justified by data density.

Pagination controls should provide:

- Previous page
- Current page
- Next page

When total-page information is available, numbered pages may be shown:

`Previous | 1 | 2 | 3 | … | Next`

Do not render hundreds of records into the DOM simply because the backend can return them.

---

## 7. Pagination state

Where practical, preserve:

- current page;
- search query;
- active filters;
- sort order;
- selected record.

After editing or approving a record, reload the relevant page rather than returning the user to the beginning of the dataset.

If the selected record disappears from the current filter after an action, preserve the current filter/page and show a clear success message.

---

## 8. Search, filter and sort

Large datasets must provide tools appropriate to the data.

Typical controls:

### Search
- player/member name;
- nickname;
- match code;
- tournament name.

### Filters
- status;
- date range;
- player/member;
- tournament;
- payment state;
- match state.

### Sort
Use only when operationally useful.

Examples:
- newest first;
- oldest pending first;
- rating;
- name;
- amount;
- due date.

Always include a simple way to clear active filters when multiple filters exist.

Avoid creating a complex filter panel for small datasets.

---

## 9. Record density

The list view is for scanning, not for displaying every field.

A record should normally expose only 3–5 decision-relevant values.

### Player example
- Name / nickname
- Rating
- Status
- Match count
- Action

### Match example
- Date/time
- Teams
- Score
- Status
- Action

### Fund example
- Member / purpose
- Amount
- Due/payment date
- Status
- Action

Move secondary information into detail:

- UUID / Player ID
- phone;
- date of birth;
- internal metadata;
- full audit metadata;
- long notes;
- complete history.

Avoid extremely tall record cards.

---

## 10. Progressive disclosure

Use progressive disclosure throughout management UI.

Preferred sequence:

`List → Select → Summary → Detail/Edit/Decision`

Long forms remain collapsed until the user explicitly chooses an action.

Appropriate mechanisms:

- Action Accordion
- Row detail
- Expandable card
- Detail panel
- Compact selected-record editor

Do not display every editable field for every row simultaneously.

---

## 11. Desktop list presentation

Desktop should prioritize compact comparison.

Prefer:

- compact table;
- compact structured list;
- short horizontal record rows.

Avoid unnecessary horizontal scrolling.

If a dataset requires too many columns:
- remove secondary fields from the list;
- expose those fields in detail;
- do not simply widen the page.

Actions should remain easy to locate.

---

## 12. Mobile list presentation

Mobile may use compact cards instead of tables.

Each mobile record should normally include:

- identity;
- one or two primary values;
- status;
- main action / detail action.

Do not place 8–12 metadata values into every mobile card.

Primary actions may become full width.

Secondary actions must remain comfortably tappable.

No horizontal overflow is allowed.

---

## 13. Action Accordion

PICK UI System v1 Action Accordion remains mandatory for substantial actions.

Use for:

- Create
- Edit
- Assign
- Approve
- Confirm
- Reject
- Void
- Deactivate / Reactivate
- Administrative configuration

Standard:

- Header approximately 49–58px.
- Icon approximately 27–32px square.
- Compact vertical spacing.
- Subtle 1–2px hover movement.
- Long forms collapsed by default.
- Semantic color reflects action intent.
- Shared component preferred over module-specific accordion code.

---

## 14. Semantic colors

The semantic palette remains shared across the entire application.

- Green: create / approve / success
- Blue: edit / information
- Amber / yellow: pending / waiting
- Red: reject / invalid / danger
- Gray: neutral / void / secondary

Do not introduce new semantic meanings for these colors in individual modules.

A status color must mean the same thing for ADMIN and MEMBER.

---

## 15. Action hierarchy

Each action area should have one clear primary action.

### Primary
The main next step.

### Secondary
View, edit or auxiliary action.

### Danger
Reject, deactivate, void, destructive or irreversible action.

Avoid several visually competing primary buttons.

Danger actions requiring accountability should request confirmation and/or reason where required by business rules.

---

## 16. Pending / exception-first presentation

When a user is authorized to resolve an item, unresolved states should appear before completed states.

Suitable patterns:

- pending count badge;
- pending tab;
- attention queue;
- status group accordion;
- dashboard action card.

Do not use alarming visual treatment for routine completed data.

Use danger styling only for actual reject/invalid/danger conditions.

---

## 17. Dashboard standard

Management dashboards are decision surfaces, not full databases.

A dashboard should contain only:

### KPI
Small set of important club indicators.

Examples:
- active members;
- matches this period;
- active tournaments;
- fund balance.

### Needs attention
Authorized pending work.

Examples:
- matches waiting for approval;
- new member registrations;
- unpaid obligations;
- tournament payments awaiting confirmation.

### Recent activity
Short recent history only.

### Shortcuts
Links/actions to the appropriate full module.

Do not embed hundreds of historical rows on the dashboard.

Every long dashboard dataset must link to a paginated module.

---

## 18. Players / Members standard

The Players/Member workspace should support:

- search by name/nickname;
- status filter;
- appropriate player type filter;
- pagination;
- compact identity + rating + status;
- detail on demand.

Do not display full profile/player metadata in the main list.

Account state and player participation state must remain visually distinct where both are shown.

Examples:
- Account: Active / Deactivated / Pending / Rejected
- Player: Active / Inactive

Do not use player participation state as an account-approval state.

---

## 19. Matches standard

Matches should support operational grouping.

Typical views:

- needs confirmation;
- needs approval;
- approved;
- rejected / invalid / voided.

Long lists must paginate.

Match records must contain enough team/player identity information to make a safe decision.

Do not show score alone without participant identities.

Authorized approval/rejection actions should be accessible close to the match record or detail.

---

## 20. Fund standard

Fund management should make financial obligations immediately understandable.

At minimum separate or clearly distinguish:

- obligations;
- payments;
- income;
- expenses;
- outstanding amounts.

Management views should surface:
- amount due;
- amount paid;
- remaining amount;
- pending confirmations;
- overdue obligations.

Long transaction lists must paginate.

MEMBER transparency views may expose club financial information without exposing management actions.

---

## 21. Tournament standard

Tournament management should separate:

- tournament status;
- registrations;
- fees;
- payments;
- expenses;
- settlement.

Operationally pending items should appear before historical records.

Long participant/payment lists must paginate.

Delegated tournament managers must use the same management components as ADMIN for capabilities they possess.

---

## 22. Rating standard

Rating management should clearly separate:

- current rating;
- adjustment request/action;
- rating history;
- match-generated rating events.

Do not display full rating history in every player row.

Use detail/history views with pagination when history becomes long.

Backend remains authoritative for rating calculations and adjustment permissions.

---

## 23. Audit standard

Audit is a browsing/review workspace.

Required when dataset becomes large:

- pagination;
- date filter;
- actor filter when available;
- action/type filter;
- record/table filter when useful.

List view should remain concise.

Full old/new JSON or technical detail should appear on demand.

Avoid rendering large JSON payloads for every audit row.

---

## 24. Account and IAM standard

Account/IAM actions should remain compact and selection-driven.

Examples:

- create member;
- approve new member;
- permissions;
- lifecycle;
- account verification;
- system configuration.

Do not render one large editable card for every MEMBER.

Preferred pattern:

`Action Accordion → Member selector/search → Selected summary → Action/editor`

Account authorization state and business/player state must remain separate.

---

## 25. Loading states

Every dynamic management area must have an intentional loading state.

Use:
- short status message;
- loading indicator or skeleton where useful.

Avoid layout jumping.

Prevent duplicate submissions while writes are pending.

---

## 26. Empty states

Empty states should be compact.

Examples:
- No matches waiting for approval.
- No new members waiting for approval.
- No unpaid obligations in this filter.

Do not create a large empty card with excessive decoration.

An empty pending queue is a positive operational state and should read calmly.

---

## 27. Error states

Use the shared notice/error treatment.

Errors should:
- explain what the user can do next;
- preserve current list/filter context where possible;
- avoid exposing raw technical details unnecessarily.

Authorization errors should not be disguised as successful empty states.

---

## 28. State transitions and reload

After a successful mutation:

1. show a clear success state;
2. reload the smallest relevant dataset;
3. preserve search/filter/page where practical;
4. update counts/KPIs affected by the action;
5. avoid a full application reload unless necessary.

Prevent stale async responses from replacing newer state.

Use generation/session guards where the existing frontend architecture requires them.

---

## 29. Backend authority

Frontend visibility is not authorization.

Eligibility and authority must come from:

- PostgreSQL/RPC logic;
- RLS;
- SECURITY DEFINER functions where designed;
- ownership/eligibility rules;
- delegated capabilities.

Frontend may hide unavailable actions for usability, but backend must reject unauthorized calls independently.

---

## 30. ADMIN and delegated MEMBER parity

For the same business capability:

- same terminology;
- same statuses;
- same filters;
- same pagination;
- same record components;
- same action location;
- same responsive behavior.

The UI may omit actions that a delegated MEMBER does not possess.

Do not fork an entire module only because the actor is not ADMIN.

---

## 31. Normal MEMBER experience

Normal MEMBER pages prioritize personal workflows.

Examples:

- My matches
- Confirm opponent result
- My fund obligations/payments
- My tournaments/registrations
- My profile

Normal MEMBER views may use the same shared components while showing a narrower personal dataset.

Do not expose management controls without backend eligibility.

---

## 32. Desktop responsive rules

Explicitly verify:

- logical horizontal comparison;
- readable table/list density;
- no unnecessary horizontal overflow;
- toolbar remains usable;
- pagination remains visible;
- detail actions remain near context;
- cards remain compact;
- long forms remain collapsed by default.

---

## 33. Mobile responsive rules

Explicitly verify:

- logical business ordering;
- compact records;
- readable labels;
- touch targets;
- no horizontal overflow;
- primary action prominence;
- filter controls remain usable;
- pagination remains easy to operate;
- detail opens without losing list context unnecessarily.

Desktop PASS does not imply Mobile PASS.

---

## 34. Data-density rule

A user should never need to scroll through dozens of records merely to locate pending work.

Therefore:

> Long datasets require search/filter and pagination.

And:

> List views contain only decision-relevant summary data; detailed data appears on demand.

Exceptions require a documented reason.

---

## 35. Shared component rule

Before adding new UI primitives, check whether the app already provides:

- `accountAction`
- Action Accordion
- shared `panel`
- `form-actions`
- `badge`
- `notice`
- shared card sizing
- list/table patterns
- status groups
- pagination controls

Extend existing shared patterns when possible.

Do not build visually equivalent components independently in each module.

---

## 36. Unicode and source safety

- Source files use UTF-8.
- Do not introduce UTF-8 BOM unless the repository explicitly requires it.
- Preserve Vietnamese characters.
- Never introduce mojibake.
- Validate Vietnamese strings after scripted edits.

For scripted edits:
- backup before write;
- validate marker counts before replacement;
- avoid broad uncontrolled replacements.

---

## 37. Required UI review checklist

Before committing a new or modified management UI:

### Authorization
- Backend authority verified.
- Frontend does not grant capability independently.

### Workflow
- Pending work is easy to find.
- Primary action is obvious.
- Detail is available on demand.

### Dataset
- Search provided when useful.
- Filters provided when useful.
- Pagination used for long datasets.
- No unnecessary massive DOM rendering.

### Context
- Page/filter/search preserved after actions where practical.
- Stale async responses guarded.
- Duplicate submissions blocked.

### Desktop
- ADMIN desktop PASS.
- Delegated MEMBER desktop PASS where applicable.
- Normal MEMBER desktop PASS where applicable.

### Mobile
- ADMIN mobile PASS.
- Delegated MEMBER mobile PASS where applicable.
- Normal MEMBER mobile PASS where applicable.
- No horizontal overflow.

### Visual system
- Semantic colors PASS.
- Action hierarchy PASS.
- Card/list density PASS.
- Shared components reused.
- Vietnamese Unicode PASS.

### Repository
- No unrelated regression.
- `git diff --check` PASS.

Only after local verification passes should changes be committed and pushed.

---

## 38. Migration from v1

PICK UI System v2 extends rather than discards v1.

Existing v1 implementations do not need immediate rewrites solely because v2 exists.

When a module is next modified or explicitly reviewed:
- bring its management workflow toward v2;
- prioritize pagination/data density;
- use capability-driven shared UI;
- improve pending/exception visibility;
- preserve existing correct visual patterns.

Recommended migration order:

1. Dashboard
2. Matches
3. Players
4. Fund
5. Tournaments
6. Rating
7. Account / IAM
8. Audit

Avoid a risky full-app rewrite.

---

## 39. Project rule

PICK UI System v2 is the mandatory design contract for PICK WEBAPP.

It applies to:

- ADMIN;
- delegated MEMBER;
- normal MEMBER;
- Desktop;
- Mobile;
- all current and future modules.

All future UI implementation and refactoring must follow this document unless a newer PICK UI System version explicitly supersedes it.

The two governing operational rules are:

> Authorized users should not have to scan or scroll through large historical datasets to find work requiring action.

and:

> ADMIN and delegated MEMBER must use the same management workflow for the same capability, with backend authorization determining which actions are available.


## Shared Data List Filter Pattern

### 1. Mục tiêu

Các giao diện có dạng danh sách dữ liệu kèm tìm kiếm, lọc và phân trang phải dùng cùng một ngôn ngữ UI và cùng một shared filter pattern.

Nguyên tắc bắt buộc:

- Cùng loại dữ liệu / cùng kiểu thao tác phải dùng cùng cấu trúc UI.
- Không được mỗi module tự tạo một kiểu filter riêng nếu use case tương đương.
- Không được thay đổi thứ tự field, kích thước control, cách hiển thị page size, vị trí reset filter hoặc responsive behavior mà không có lý do UX rõ ràng.
- Ưu tiên tái sử dụng shared component, shared class và shared responsive rule hiện có.

Pattern này áp dụng cho:
- searchable list;
- filterable list;
- paginated list;
- history list;
- member-specific list;
- admin/member data browser;
- các surface tương đương về sau.

---

### 2. Thứ tự field chuẩn

Khi một list có đầy đủ các loại filter sau, thứ tự mặc định phải là:

1. `Tìm kiếm`
2. `Trạng thái`
3. `Từ ngày`
4. `Đến ngày`
5. `Số dòng / trang`
6. `Xóa bộ lọc`

Nếu một surface không sử dụng một field nào đó thì bỏ field đó, nhưng giữ nguyên relative order của các field còn lại.

Không tự đổi thứ tự giữa các module nếu cùng pattern.

---

### 3. Tìm kiếm

Label chuẩn:

`Tìm kiếm`

Quy tắc:

- Search input dùng shared input style.
- Trim whitespace.
- Case-insensitive nếu business logic cho phép.
- Placeholder thay đổi theo context.
- Khi search thay đổi, page phải reset về 1.
- Search không được reset các filter khác.
- Search không được làm thay đổi authorization/data scope.
- Search chỉ lọc trên dataset mà backend đã cho phép user đọc.

Desktop:
- Search là field rộng nhất trong filter row.

Mobile:
- Search chiếm full width.

---

### 4. Trạng thái

Label chuẩn:

`Trạng thái`

Quy tắc:

- Dùng shared/native select style.
- Options lấy từ authoritative status/business contract.
- UI có thể map status sang label thân thiện.
- Không invent backend state mới chỉ để phục vụ filter.
- Khi status thay đổi, page reset về 1.
- Các filter khác được giữ nguyên.

---

### 5. Từ ngày / Đến ngày

Labels chuẩn:

- `Từ ngày`
- `Đến ngày`

Quy tắc:

- Hai field dùng cùng input style.
- Cùng chiều cao, border, radius, padding, icon behavior.
- `Từ ngày > Đến ngày` phải hiển thị validation rõ ràng.
- Không silently swap hai giá trị.
- Date filtering dùng inclusive day boundary nếu business contract định nghĩa theo ngày lịch.
- Timezone semantics phải được implementation ghi rõ khi có ảnh hưởng đến kết quả.

Đối với PICK hiện tại:
- date filtering phải giữ behavior thống nhất theo timezone hiện hành của hệ thống;
- không để mỗi module tự xử lý timezone khác nhau.

---

### 6. Số dòng / trang

Label chuẩn:

`Số dòng / trang`

Dùng một convention thống nhất toàn hệ thống.

Preferred options:

- `10`
- `20`
- `50`

Nếu project đã có shared constants khác thì reuse constants hiện có.

Không được để:
- một nơi hiển thị `20`;
- nơi khác hiển thị `20 dòng / trang`;

nếu cùng shared pattern.

Khi page size thay đổi:
- reset về page 1;
- giữ nguyên Search;
- giữ nguyên Status;
- giữ nguyên From/To date;
- cập nhật result count và pagination hợp lệ.

---

### 7. Xóa bộ lọc

Label chuẩn:

`Xóa bộ lọc`

Semantic:
- neutral;
- không dùng danger/red.

Quy tắc:

- Reset tất cả filter về default.
- Reset page về 1.
- Cùng vị trí và cùng style trên các surface dùng shared pattern.
- Không tạo behavior khác nhau giữa các module tương đương.

Nếu không có filter active:
- dùng một behavior thống nhất toàn hệ thống:
  - disabled;
  hoặc
  - hidden.

Không được module này disabled còn module khác hidden nếu cùng shared component.

---

### 8. Filter combination

Các filter kết hợp theo logic:

`Search`
AND `Status`
AND `From Date`
AND `To Date`

Sau đó mới áp dụng pagination.

Khi bất kỳ filter nào thay đổi:
- reset page về 1;
- giữ các filter khác;
- cập nhật result count;
- không làm mất user context không liên quan.

---

### 9. Desktop layout

Trên Desktop, filter block dùng shared compact grid/row.

Thứ tự:

`Tìm kiếm | Trạng thái | Từ ngày | Đến ngày | Số dòng / trang | Xóa bộ lọc`

Nguyên tắc:

- Search rộng nhất.
- Status có width vừa phải.
- From/To cùng width.
- Page size compact.
- Clear filter cùng hàng nếu đủ không gian.
- Labels align cùng baseline.
- Controls cùng chiều cao.
- Filter block và result container dùng cùng left edge.
- Không dùng spacing tùy ý theo từng module.

---

### 10. Mobile layout

Trên Mobile, default pattern là một cột cho form/filter có nhiều trường.

Thứ tự:

1. Tìm kiếm
2. Trạng thái
3. Từ ngày
4. Đến ngày
5. Số dòng / trang
6. Xóa bộ lọc

Nguyên tắc:

- Search full width.
- Các control còn lại full width.
- Không ép nhiều field lên cùng hàng nếu làm giảm usability.
- Không horizontal overflow.
- Date icon/select arrow không bị clip.
- Touch target đạt chuẩn Mobile của PICK UI System V2.
- Không duplicate business DOM riêng cho Mobile nếu CSS responsive có thể xử lý.

Hai cột chỉ được dùng khi:
- V2 hoặc shared component cho phép rõ ràng;
- field vẫn đủ rộng;
- không gây overflow;
- pattern được áp dụng nhất quán cho các surface tương đương.

Với Match surfaces hiện tại:
- Mobile dùng một cột làm chuẩn.

---

### 11. Result count

Thứ tự visual chuẩn:

`Filter block`
→ `Result count`
→ `List / Table / Cards`
→ `Pagination`

Result count có thể thay wording theo context, ví dụ:

- `1–20 / 28 kết quả`
- `80 trận trong phạm vi đang lọc`

Nhưng phải giữ:
- typography;
- spacing;
- hierarchy;
- placement

theo cùng shared pattern.

---

### 12. Empty states

Phải phân biệt hai trường hợp:

#### Dataset thực sự rỗng

Ví dụ:

`Bạn chưa có dữ liệu.`

hoặc context-specific message.

#### Có dữ liệu nhưng filter không ra kết quả

Ví dụ:

`Không tìm thấy dữ liệu phù hợp với bộ lọc.`

Không dùng cùng một empty-state message cho hai trường hợp.

---

### 13. Pagination

Pagination phải reuse pattern của WP-C8.

Quy tắc:

- Filter change → page = 1.
- Page-size change → page = 1.
- Search/status/date filters được giữ nguyên.
- Không để page index vượt phạm vi.
- Result count phải đồng bộ với filtered dataset.
- Pagination component/style phải nhất quán giữa các list surfaces.

---

### 14. Accessibility

Bắt buộc:

- mỗi input/select có label rõ;
- keyboard usable;
- focus visible;
- native input/select được ưu tiên;
- hidden accordion body không để control tabbable;
- validation date range phải có accessible feedback;
- dynamic result count chỉ announce khi cần, theo WP-C7;
- không spam live-region;
- Mobile 390px và 320px không horizontal overflow.

---

### 15. Shared component / CSS rule

Nếu hai surface cùng use case thì phải ưu tiên reuse:

- shared filter wrapper;
- shared filter grid;
- shared filter field;
- shared input/select/date styles;
- shared page-size control;
- shared clear-filter control;
- shared responsive behavior;
- shared result-count pattern;
- shared pagination pattern.

Không tạo module-specific CSS như:

- `.my-matches-filter-*`
- `.history-filter-*`

nếu khác biệt chỉ là tên module.

Module-specific CSS chỉ được dùng khi có semantic hoặc layout reason thực sự.

---

### 16. Match surfaces — authoritative example

Hai surface sau phải dùng cùng Shared Data List Filter Pattern:

- `Trận đấu của tôi`
- `Tra cứu trận đấu đã diễn ra`

Hai surface được phép khác nhau ở:

- data source;
- search placeholder;
- status options;
- summary content;
- result-specific metadata.

Nhưng phải giống nhau ở:

- field order;
- control sizing;
- filter layout;
- Desktop behavior;
- Mobile behavior;
- page-size convention;
- clear-filter behavior;
- result-count placement;
- pagination;
- spacing;
- accessibility;
- responsive breakpoint.

#### Desktop

Cả hai dùng:

`Tìm kiếm | Trạng thái | Từ ngày | Đến ngày | Số dòng / trang | Xóa bộ lọc`

hoặc shared grid tương đương.

#### Mobile

Cả hai dùng một-column pattern:

- Tìm kiếm
- Trạng thái
- Từ ngày
- Đến ngày
- Số dòng / trang
- Xóa bộ lọc

Không được để một surface dùng 2 cột còn surface kia dùng 1 cột nếu cùng shared pattern.

---

### 17. Regression requirement

Các UI regression test phải bảo vệ tối thiểu:

- cùng shared filter wrapper/class;
- cùng field order;
- cùng page-size convention;
- cùng reset-filter placement;
- cùng label convention;
- cùng control classes;
- cùng responsive behavior;
- Mobile 390px không overflow;
- Mobile 320px không overflow;
- pagination giữ đúng contract;
- filter behavior không làm thay đổi authorization/data scope.

Khi thêm một list/filter surface mới, phải kiểm tra xem use case có thuộc Shared Data List Filter Pattern hay không trước khi tạo layout mới.

---

### 18. Rule mở rộng trong tương lai

`PICK-UI-SYSTEM-V2.md` là authoritative UI contract.

Khi một pattern đã được định nghĩa trong V2:

- implementation mới phải reuse pattern;
- không tự tạo variation chỉ vì khác module;
- nếu thực sự cần variation mới, phải cập nhật V2 trước hoặc đồng thời với implementation;
- variation phải có lý do UX/semantic rõ ràng;
- không được để implementation đi trước design contract trong thời gian dài.

Nguyên tắc:

**Design system trước, implementation theo sau.**


### Cross-browser Native Form Controls

- Native `input[type="date"]` phải giữ native picker; không đổi thành text input để che lỗi layout.
- Safari/iOS date controls phải được normalize tại shared CSS, cùng visual height và touch target với Search/Select/Page-size.
- Shared controls dùng `box-sizing: border-box`, `width: 100%`, `max-width: 100%` và `min-width: 0`; grid/flex children không được ép container rộng hơn viewport.
- Native date value/editor không được làm control giãn cao; calendar affordance phải còn usable, không bị crop hoặc overlap text.
- Không tạo browser-specific module CSS nếu shared rule giải quyết được cùng use case.
- Mọi filter/list surface mới có date input phải test Chromium, Safari/iOS và narrow mobile viewport; kiểm tra cả empty/selected date, picker và bottom safe area nếu có fixed navigation.
- Chromium/browser fixture PASS không thay thế real Safari verification khi native controls có platform rendering riêng. Nếu không có Safari/iOS runtime, ghi NOT RUN / PENDING REAL DEVICE, không claim Safari PASS.
