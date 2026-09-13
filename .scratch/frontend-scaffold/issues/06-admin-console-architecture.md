# 06 — Admin Console Component Architecture
Type: grilling
Blocked by: 01, 05
Status: open

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
