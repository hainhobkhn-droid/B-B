# UI refinement R2

Presentation only. Existing leaderboard DTO, metrics, competition ties, server
pagination and authorization are unchanged. No migration or additional API call.

Contribution uses V2 identity initials, an own-rank card, a compact spotlight for
the first three returned rows of the unfiltered first page, and the full paged
list. Actual tied rank values are preserved. Other pages/search omit spotlight
rather than fetch leaders separately or mistake page-local rows for global Top3.
Initials use the existing identity primitive; no avatar fetch or motion library.

The ADMIN pending summary retains its existing bounded cached queue. Its navigation
action sits in a secondary footer; each preview has identity/status plus a separate
Xem hồ sơ footer. Opening preview expands across the dashboard row to avoid tall
empty neighboring cards. Approval/rejection remain in the existing account flow.
No new approval controls or capabilities are introduced on the dashboard.

Tests: member-club-leaderboards-ui-test.cjs (39), ui-refinement-r2-contribution-test.cjs
(18), ui-refinement-r2-pending-test.cjs (33). Detailed browser/regression evidence is
in PICK-UI-REFINEMENT-R2-CONG-HIEN-PENDING-MEMBER-2026-10-28.md in the analysis workspace.
