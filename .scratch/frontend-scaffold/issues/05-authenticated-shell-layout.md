# 05 — Authenticated Shell Layout Design
Type: grilling
Blocked by: 01
Status: open

## Question

What does the shared layout for the `(authenticated)` route group look like?

Decisions to lock:
- Sidebar vs. topbar vs. hybrid navigation pattern — what links live there?
- Org switcher placement (Clerk's `<OrganizationSwitcher />` component) — header? sidebar top?
- How does the shell adapt per role? (Employee sees fewer nav items than Admin — is this a single layout with conditional items, or separate layouts?)
- Does the shell include a breadcrumb? Global notification badge?
- Where does the user avatar / sign-out live?
