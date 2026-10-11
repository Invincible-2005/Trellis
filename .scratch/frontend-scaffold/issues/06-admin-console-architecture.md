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
| `/admin/members` | `add_member` *(added 2026-10-09, trellis/12 D25)* |
| ~~`/admin/teams`~~ | ~~`add_member` or `create_team`~~ (superseded 2026-10-10 by trellis/12 D28: team work moved to `/teams`) |
| `/admin/documents` | `upload_document` (org-wide **or on any team**) *(dropped by D34 and restored the same day by trellis/12 D37: people without upload permission get no documents page)* |
| `/admin/strikes` | `review_strike` (org-level, or on any team: D6 2026-10-10) |

- **Implementation:**
  - `app/(dashboard)/admin/layout.tsx` (a Server Component) calls a `cache()`-wrapped `getAuthContext()` → `GET /api/v1/auth/context`. If `active_org.can_open_admin` is false, it calls `redirect('/dashboard')`. ~~The tab bar shows exactly `active_org.admin_tabs`.~~ *(Superseded 2026-10-11 by trellis/12 D36: no tab bar; the layout is only the gate and renders `children`.)*
  - Tabs the user lacks are hidden. Each `page.tsx` re-checks its own permission and redirects to the first allowed tab.
  - The sidebar's `nav-items.tsx` uses the same data to show the "Admin" entry and its sub-list (one link per `admin_tabs` item). This is the only admin navigation (D36).
- **The gate only affects what users see.** FastAPI enforces every admin action independently.
- **Role editor rules (D9):**
  - The root `Admin` role (`is_system`) has its delete, re-parent and permission-removal controls disabled.
  - Parent and permission pickers only offer roles below the user's own and permissions the user holds. The backend rejects anything else.
- ~~**Open follow-up (D4):** a role holding only `review_strike` or only `upload_document` can't open the console.~~ **Resolved 2026-10-09:** entry = any tab permission; `upload_document` also counts on a team, so a team manager sees only Documents.

### 1. Sub-Routes & Layout
The Admin Console uses dedicated sub-routes wrapped by a shared `app/(dashboard)/admin/layout.tsx`:
- `/admin/roles`: Visual Role Hierarchy builder (React Flow)
- `/admin/members`: Everyone in the org with their org role, pending invites, "Invite member" (email + optional role). **Change role** and **Remove** on rows with `manageable: true` (every role the person holds is below yours; trellis/12 D38, 2026-10-11). *Added 2026-10-09 (trellis/12 D25/D26); brief in `plans/member-management/frontend.md`.*
- ~~`/admin/teams`: Team directory and member assignments (existing org members only, after D25)~~ (superseded 2026-10-10 by trellis/12 D28: team work moved to `/teams`)
- `/admin/documents`: Policy/SOP documents you can see, uploader & tagging; **Edit** (title, description, who sees it) and **Delete** on rows with `deletable: true` (trellis/12 D23, D39) *(restored 2026-10-11 by trellis/12 D37 after D34 briefly moved it to `/organization`)*
- `/admin/strikes`: Strike appeal reviews and audit log (D6: lists only appeals the viewer may review; the giver of a strike never reviews its appeal)
~~The shared admin layout provides top navigation tabs between these four surfaces so admins can switch contexts without re-fetching unrelated data.~~ *(Superseded 2026-10-11 by trellis/12 D36: the sidebar's Admin sub-list is the only admin navigation; the shared layout is just the permission gate.)*
- `/admin` itself (`admin/page.tsx`): redirects to the first tab in `admin_tabs`.

### 2. React Flow Interaction Model
- The hierarchy tree is rendered as an interactive, read-only DAG canvas with custom nodes (`role-node.tsx`).
- Adding or editing roles is handled via shadcn **Dialogs and Sheets** (`create-role-dialog.tsx`), allowing admins to set `parent_role_id` and toggle permissions cleanly without brittle canvas drag-and-drop mechanics.

### 3. Document Upload & Tagging Flow
> **Built 2026-10-09 (plumbing):** `app/api/uploadthing/{core,route}.ts` (endpoint `policyDocument`: pdf/docx/pptx/txt/md, 16 MB, gate = signed in + active org + `upload_document` somewhere), `lib/uploadthing.ts` (`UploadDropzone`), `lib/api/queries/documents.ts::getDocuments`, `lib/api/actions/documents.ts::createDocument/getDocumentStatus/deleteDocument`. Flow: dropzone → `serverData.url` → tag dialog → `createDocument` → poll `getDocumentStatus` until `ready`/`failed`. Tag choices follow trellis/12 D23 (role: own org role or `manageable` roles; team: teams you can upload to and see). Needs `UPLOADTHING_TOKEN` in `frontend/.env`.
- Uses a **Two-step Dialog/Modal**:
  1. Uploadthing dropzone (`doc-upload-dropzone.tsx`) accepts the document.
  2. The user picks a scope: `Org` (whole organization, no target), `Role`, or `Team`, and for Role/Team selects the specific target from a searchable dropdown (`tag-scope-select.tsx`). A document has exactly one scope — never both a role and a team. *(`Org` option added 2026-10-08 to match trellis ticket 11.)*

### 4. Fix list from the review of commit 390608c (2026-10-11) — ✅ done by Claude 2026-10-11
Roles and Members followed this ticket and the briefs; the Documents tab followed the pre-D34 brief. Fixed (`tsc` clean, `next build` passes):

- [x] **`admin/documents/`** stays an admin tab (D37). `documents-table.tsx` no longer keeps its own copy of the list and polls only while a document is processing; Upload shows only if the user can tag somewhere.
- [x] **`admin/layout.tsx` = gate only (D36):** no heading, tab bar, `TAB_META` or inner `<main>`.
- [x] **`admin/page.tsx`** redirects to the first tab in `admin_tabs`.
- [x] **Roles: edit and delete.** Click a role with `manageable: true` → `edit-role-dialog.tsx` (name, description, parent, permissions → `updateRole`; Delete with a confirm → `deleteRole`, refusals as toasts). Parent choices skip the role and its sub-roles; permission boxes = yours + the role's current ones (removing is always allowed). Shared fields in `role-form-fields.tsx`. The tree is now laid out parent-over-children and is view-only (no dragging or connecting); dark mode follows the app theme.
- [x] **Lint:** no props copied into state in `invitations-table.tsx`, `create-role-dialog.tsx`, `policy-list.tsx`. (`use-mobile.ts` still has one: shadcn's stock helper, harmless.)
- [x] **Wording:** invite hint says "below your own"; unknown inviter shows "—", not "Admin".
- [x] **Sidebar starts open** for new users.
- [x] **Build fix in `lib/api/`:** `client.ts` and `errors.ts` swallowed Next's "render per request" signal at build time, so `next build` tried to prerender signed-in pages and failed; both now call `unstable_rethrow(err)`.
- [ ] Teammates: run `pnpm install` after pulling (React Flow, `@xyflow/react`).
- [ ] Check in a browser: Roles (create, click to edit, delete a role in use → toast), Members, `/admin` redirect, sidebar Admin list.

- [x] **Making "share with a role" findable (Piyush, 2026-10-11):** Documents page and upload dialog in plain words ("Who should see this document?": Everyone / A role (and every role above it) / A team; table column "Shared with"; greyed "A role" explains it needs org-wide upload). Edit role dialog has **"Add a document for <role>"** (shown with org-wide `upload_document`) → `/admin/documents?role=<id>` opens the upload with that role picked.

**Known, not a bug:** the Strikes link appears for people with `review_strike`, but `/admin/strikes` isn't built yet, so it shows a 404 until the strikes feature lands.
