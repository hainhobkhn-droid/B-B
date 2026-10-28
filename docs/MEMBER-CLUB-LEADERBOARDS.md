# MEMBER club leaderboard contract

The personal Rating event RPC remains caller-own. Raw Fund reads remain private.
`get_member_club_leaderboard(p_board, p_page, p_page_size, p_search)` exposes only a
public-safe, bounded aggregate projection to active ADMIN/MEMBER callers through
the existing ACC07B gate. It accepts no actor, Player or club parameter.

Boards: rating, contribution, energetic, sleepy. Default page size 20, maximum 50.
Search is a literal name substring. Global competition rank (1,1,3) precedes search
and pagination. The caller's own summary is independent of the current page.

Rating eligibility preserves ACTIVE CLUB Players, finite current Rating and the
active algorithm's distinct rated-Match minimum. Contribution preserves positive
THUA/HOA obligations attached to APPROVED Matches, excluding MIEN/DIEU_CHINH;
it is not cash received and excludes disciplinary/private campaign obligations.
Participation boards preserve distinct APPROVED participations. No new account
eligibility rule is introduced. The current schema is a single-club deployment.

The envelope contains board, page, page_size, total, total_ranked, total_pages,
algorithm_version, minimum_matches, current_member and rows. Each row contains
only rank, display_name, metric, rating, match_count and is_current. Unranked own
summary is {eligible:false}. No IDs, DOB, contact details, notes, payment records
or audit metadata are returned. Anonymous execution is revoked. No raw table
grants or RLS policies change. Service-role execution still requires a valid
business identity. No write operation is implemented.

Run `node supabase/tests/member-club-leaderboards-ui-test.cjs` for the 39 actual
frontend checks, including a Supabase thenable without .catch(), strict DTO
validation, current-member highlight, paging, stale responses and retry.
Local PostgreSQL integration and production deployment evidence are recorded in
PICK-SYSTEM-REVIEW-R1-2026-10-27.md in the analysis workspace.
