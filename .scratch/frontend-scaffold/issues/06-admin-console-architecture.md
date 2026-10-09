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

### 0. Who may access `/admin` — resolved 2026-10-08 (trellis ticket 12 D4)
- **Trellis RBAC decides access, not Clerk roles.**
- **Console entry (widened 2026-10-09, trellis/12 D4 follow-up):** the user may open at least one tab. The backend sends the list as `active_org.admin_tabs` in `/auth/context`; `can_open_admin` = list not empty. *Superseded:* the user holds `create_role` **or** `add_member` through their **org-level** role.
- **Each tab checks its own permission:**

| Tab | Required (org-wide unless noted) |
|---|---|
| `/admin/roles` | `create_role` |
| `/admin/teams` | `add_member` or `create_team` |
| `/admin/documents` | `upload_document` (org-wide **or on any team**) |
| `/admin/strikes` | `review_strike` |

- **Implementation:**
  - `app/(dashboard)/admin/layout.tsx` (a Server Component) calls a `cache()`-wrapped `getAuthContext()` → `GET /api/v1/auth/context`. If `active_org.can_open_admin` is false, it calls `redirect('/dashboard')`. The tab bar shows exactly `active_org.admin_tabs`.
  - Tabs the user lacks are hidden. Each `page.tsx` re-checks its own permission and redirects to the first allowed tab.
  - The sidebar's `nav-items.tsx` uses the same data to show or hide the "Admin" entry.
- **The gate only affects what users see.** FastAPI enforces every admin action independently.
- **Role editor rules (D9):**
  - The root `Admin` role (`is_system`) has its delete, re-parent and permission-removal controls disabled.
  - Parent and permission pickers only offer roles below the user's own and permissions the user holds. The backend rejects anything else.
- ~~**Open follow-up (D4):** a role holding only `review_strike` or only `upload_document` can't open the console.~~ **Resolved 2026-10-09:** entry = any tab permission; `upload_document` also counts on a team, so a team manager sees only Documents.

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
> **Built 2026-10-09 (plumbing):** `app/api/uploadthing/{core,route}.ts` (endpoint `policyDocument`: pdf/docx/pptx/txt/md, 16 MB, gate = signed in + active org + `upload_document` somewhere), `lib/uploadthing.ts` (`UploadDropzone`), `lib/api/queries/documents.ts::getDocuments`, `lib/api/actions/documents.ts::createDocument/getDocumentStatus/deleteDocument`. Flow: dropzone → `serverData.url` → tag dialog → `createDocument` → poll `getDocumentStatus` until `ready`/`failed`. Tag choices follow trellis/12 D23 (role: own org role or `manageable` roles; team: teams you can upload to and see). Needs `UPLOADTHING_TOKEN` in `frontend/.env`.
- Uses a **Two-step Dialog/Modal**:
  1. Uploadthing dropzone (`doc-upload-dropzone.tsx`) accepts the document.
  2. The user picks a scope: `Org` (whole organization, no target), `Role`, or `Team`, and for Role/Team selects the specific target from a searchable dropdown (`tag-scope-select.tsx`). A document has exactly one scope — never both a role and a team. *(`Org` option added 2026-10-08 to match trellis ticket 11.)*

