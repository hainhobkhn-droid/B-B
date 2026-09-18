# PICK UI System v1

Status: ACTIVE / REQUIRED  
Scope: Entire PICK WEBAPP  
Applies to: ADMIN, MEMBER, Desktop, Mobile

## 1. Core principles

- The same type of data must use the same visual language across the app.
- ADMIN and MEMBER differ by permissions and available actions, not by unrelated visual styles.
- Reuse existing components and shared CSS before creating new patterns.
- Desktop optimizes horizontal comparison.
- Mobile optimizes sequential task flow by business group.
- Mobile layouts must not be a mechanical one-column collapse of desktop grids.
- Long forms should normally be collapsed by default inside compact action accordions.

## 2. Action Accordion

Use for:
- Create
- Edit
- Assign / Arrange
- Approve
- Confirm
- Reject
- Void / Cancel
- Other substantial forms or administrative actions

Standard:
- Header height: about 49–58px.
- Icon container: about 27–32px square.
- Border radius, shadow and spacing must match the shared app-action system.
- Hover movement: subtle, around 1–2px.
- Long forms default to collapsed.
- Click header to expand/collapse.
- Avoid permanently displaying large forms when the user is not actively using them.

## 3. Semantic colors

Use one shared semantic palette throughout the application.

- Success / Create / Approve:
  green
- Information / Edit:
  blue
- Pending / Waiting:
  amber/yellow
- Danger / Reject / Invalid:
  red
- Neutral / Void / Secondary:
  gray

Do not create a separate color system for an individual module.

## 4. Content cards

Use the same card language for:
- Players
- Matches
- Fund
- Tournaments / Leagues
- Member records
- History and other business records

Rules:
- Shared border radius.
- Shared padding rhythm.
- Shared subtle shadow.
- Compact height when content is only a summary.
- Primary information first.
- Metadata visually secondary.
- Actions at the bottom or in a predictable action zone.
- Do not create unnecessarily tall cards.

## 5. Form layout — Desktop

Use two columns when it improves comparison and the fields are logically paired.

Example — Create Match:

    Match time        | Match type
    Score mode        | Competition

    TEAM A            | TEAM B
    Player A1         | Player B1
    Player A2         | Player B2
    Team A score      | Team B score

    Notes: full width
    Actions

Desktop layouts should make comparison between opposing teams easy.

## 6. Form layout — Mobile

Do NOT preserve desktop DOM/grid order if that creates an illogical sequence.

Create Match mobile order MUST follow business groups:

    Match information
    - Match time
    - Match type
    - Score mode
    - Competition when applicable

    TEAM A
    - Player A1
    - Player A2
    - Team A score

    TEAM B
    - Player B1
    - Player B2
    - Team B score

    Notes
    Actions

Forbidden mobile sequence:

    A1
    B1
    A2
    B2
    Score A
    Score B

The same principle applies to every grouped form in PICK WEBAPP.

## 7. Match confirmation — MEMBER

Member confirmation must use a compact accordion.

Example header:

    Confirm results (3)

If multiple matches need confirmation, render compact match cards inside the accordion.

Each confirmation card must contain enough information to make a safe decision:

- Match code.
- Played date/time.
- Match type.
- Team A player 1.
- Team A player 2.
- Team B player 1.
- Team B player 2.
- Score.
- Current status when relevant.
- Main confirmation action.

Do not show only the score without player/team identities.

Eligibility must come from backend authorization/RPC logic.
Frontend must not independently grant confirmation permission.

## 8. Match status groups

Standard match groups:
- Pending
- Approved
- Invalid
- Voided

Each group uses:
- Compact accordion header.
- Status icon.
- Semantic status color.
- Count badge.
- Consistent height with other action accordions.
- Compact spacing between groups.

## 9. Button hierarchy

Each interaction area should have a clear hierarchy.

- Primary:
  the single main action.
- Secondary:
  edit, view, auxiliary actions.
- Danger:
  reject, destructive actions, void/cancel.

Avoid several competing primary buttons in the same context.

Mobile:
- Primary actions may become full width.
- Secondary actions must remain easy to tap.
- Do not compress several buttons until labels become unreadable.

## 10. Typography

Use a common hierarchy throughout the application:

1. Page title
2. Section title
3. Card title
4. Field label
5. Body text
6. Metadata / muted text
7. Badge / small status text

Do not introduce arbitrary font sizes per module unless there is a documented reason.

## 11. Spacing and sizing

Default rhythm:

- Between compact action cards:
  approximately 9–12px.
- Between major sections:
  approximately 16–20px.
- Desktop field gap:
  approximately 12–16px.
- Mobile spacing:
  slightly tighter while remaining touch-friendly.
- Action header:
  approximately 49–58px.

Prefer shared CSS variables/classes when available.

## 12. ADMIN and MEMBER

ADMIN:
- May expose more management actions.
- Create/Edit/Assign/Approve/Reject/Void tools use Action Accordion.
- Dense administration is allowed but should remain visually structured.

MEMBER:
- Prioritize personal workflows.
- Fewer actions.
- Create My Match, Confirm Result and similar workflows use the same Action Accordion system.
- Do not make MEMBER pages visually unrelated to ADMIN pages.

The underlying components, spacing, colors and responsive behavior remain shared.

## 13. Loading / Empty / Error states

Every dynamic area must have intentional states.

Loading:
- Short status text or shared loading/skeleton treatment.
- Avoid layout jumping where practical.

Empty:
- Compact, calm empty state.
- Explain that there is currently no relevant data.
- Do not render a large blank card.

Error:
- Use the shared notice/error treatment.
- Preserve readable Vietnamese Unicode.
- Never expose raw technical errors when a user-friendly message exists.

## 14. Unicode and Vietnamese text

- Source files use UTF-8.
- Do not introduce mojibake such as:
  `X?c nh?n`, `V?V`, `Tr?n`.
- Validate newly added Vietnamese strings after scripted edits.
- Prefer editing methods that preserve UTF-8 reliably.

## 15. Responsive implementation rule

For each new or modified UI, explicitly verify:

### Desktop
- logical row grouping
- balanced columns
- card heights
- spacing
- action hierarchy

### Mobile
- business-logical field order
- readable labels
- touch target size
- no horizontal overflow
- no desktop-only ordering artifacts
- compact card height
- appropriate full-width actions

A desktop PASS does not imply a mobile PASS.

## 16. Required UI review checklist

Before committing a UI change:

- ADMIN desktop PASS
- ADMIN mobile PASS
- MEMBER desktop PASS
- MEMBER mobile PASS
- Unicode PASS
- Card height consistency PASS
- Semantic colors PASS
- Button hierarchy PASS
- Responsive business ordering PASS
- No unrelated UI regression
- `git diff --check` PASS

Only after local verification passes should the change be committed and pushed.

## 17. Project rule

PICK UI System v1 is the default design contract for the entire PICK WEBAPP.

All future modules and UI refactors — including Matches, Players, Fund, Tournament, League, Rating and Member Portal — must follow this document unless a newer version explicitly supersedes it.