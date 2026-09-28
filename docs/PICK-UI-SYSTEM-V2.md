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
