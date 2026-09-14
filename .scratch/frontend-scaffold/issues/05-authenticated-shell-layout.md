# 05 — Authenticated Shell Layout Design
Type: grilling
Blocked by: 01
Status: resolved

## Question

What does the shared layout for the `(authenticated)` route group look like?

Decisions to lock:
- Sidebar vs. topbar vs. hybrid navigation pattern — what links live there?
- Org switcher placement (Clerk's `<OrganizationSwitcher />` component) — header? sidebar top?
- How does the shell adapt per role? (Employee sees fewer nav items than Admin — is this a single layout with conditional items, or separate layouts?)
- Does the shell include a breadcrumb? Global notification badge?
- Where does the user avatar / sign-out live?

## Answer

### 1. Shell Layout & Navigation Design
- **Sidebar**: Collapsible Icon Sidebar using shadcn/ui `Sidebar` primitive. Supports expanding to full width (260px) and collapsing to icon-only mode (`Cmd+B` toggle).
- **Clerk Placement**:
  - `<OrganizationSwitcher />` located at the top of the sidebar.
  - `<UserButton />` and theme toggle at the footer of the sidebar.
- **Header Bar**:
  - Left: Hamburger toggle (mobile / collapse) + Breadcrumbs.
  - Right: Active "Role Badge" (displaying current role in active org/team) + Global Command Palette search trigger (`Cmd+K`).
- **Role-Based Filtering**: Single unified shell. Navigation items dynamically show/hide based on Clerk session role and resolved permissions.

### 2. Route Group & Colocation Directory Pattern
Adopting colocation with Next.js private folders (`_components`):
- `(marketing)` / `(public)`: Public layout (Navbar + Footer)
- `(auth)`: Clean centered layout for Clerk authentication (`/sign-in`, `/sign-up`, `/org-selection`)
- `(dashboard)`: Authenticated shell layout (Sidebar + Header).
- Each feature route owns its own `_components/` folder for private UI components (e.g. `dashboard/_components/`, `tasks/_components/`, `chat/_components/`, `admin/_components/`).
- Global, reusable primitives stay in `components/ui/` (shadcn) and `components/shared/`.

