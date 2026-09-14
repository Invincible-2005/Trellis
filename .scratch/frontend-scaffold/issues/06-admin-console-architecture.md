# 06 — Admin Console Component Architecture
Type: grilling
Blocked by: 01, 05
Status: resolved

## Question

What is the component structure of the Admin Console surfaces?

The PRD specifies three sub-surfaces:
1. **Role management** — interactive React Flow tree (create roles, set parent_role_id, assign permissions)
2. **Team management** — create teams, invite users by email, assign per-team role
3. **Document management** — upload policy/SOP docs, tag to role or team (Uploadthing)

Decisions to lock:
- Are these three sub-surfaces tabs within one `/admin` page, or separate routes (`/admin/roles`, `/admin/teams`, `/admin/documents`)?
- React Flow: is the role tree read-only (visual) with edit modals, or is it drag-and-drop editable inline?
- Document upload: what does the tagging UX look like? (Dropdown to pick role OR team after upload?)
- Who can access the admin console? Any role with the right permission, not just "Admin" — how does the middleware reflect that?

## Answer

### 1. Sub-Routes & Layout
The Admin Console uses dedicated sub-routes wrapped by a shared `app/(dashboard)/admin/layout.tsx`:
- `/admin/roles`: Visual Role Hierarchy builder (React Flow)
- `/admin/teams`: Team directory and member assignments
- `/admin/documents`: Policy/SOP document uploader & tagging
- `/admin/strikes`: Strike appeal reviews and audit log
The shared admin layout provides top navigation tabs between these four surfaces so admins can switch contexts without re-fetching unrelated data.

### 2. React Flow Interaction Model
- The hierarchy tree is rendered as an interactive, read-only DAG canvas with custom nodes (`role-node.tsx`).
- Adding or editing roles is handled via shadcn **Dialogs and Sheets** (`create-role-dialog.tsx`), allowing admins to set `parent_role_id` and toggle permissions cleanly without brittle canvas drag-and-drop mechanics.

### 3. Document Upload & Tagging Flow
- Uses a **Two-step Dialog/Modal**:
  1. Uploadthing dropzone (`doc-upload-dropzone.tsx`) accepts the document.
  2. The user toggles between `Role` vs `Team` scope tag and selects the specific target from a searchable dropdown (`tag-scope-select.tsx`). A document can only be tagged to either a role or a team, never both.

