<!-- PICK_UI_SYSTEM_V2 -->
## PICK WEBAPP UI rule

For every UI implementation or refactor, read and follow:

`docs/PICK-UI-SYSTEM-V2.md`

PICK UI System v2 is mandatory for ADMIN, delegated MEMBER and normal MEMBER, on Desktop and Mobile.

Important:
- Use decision-first management UI: surface pending/exception work before history.
- Reuse shared action/card/list components and semantic colors.
- Same capability must use the same management workflow for ADMIN and delegated MEMBER.
- Backend authorization remains the source of truth; frontend must not grant permissions.
- Long datasets must use appropriate search/filter and pagination instead of endless vertical rendering.
- Keep list records compact; show secondary metadata and long forms on demand.
- Preserve page/filter/search context after actions where practical.
- Desktop optimizes comparison and data density.
- Mobile follows business-logical task flow and must not mechanically collapse desktop grids.
- Test applicable ADMIN + delegated MEMBER + normal MEMBER flows on desktop + mobile before committing.
- Preserve UTF-8 Vietnamese text.
- PICK UI System v1 remains historical; v2 supersedes it as the active design contract.
<!-- /PICK_UI_SYSTEM_V2 -->