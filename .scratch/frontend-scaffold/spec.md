# Trellis Frontend Scaffold — Architecture & Route Specification

This is the canonical frontend architecture specification for Trellis. It serves as the primary reference for teammates and coding agents.

---

## 1. Core Architectural Directives

1. **Strict Decoupling from Backend**: The frontend lives exclusively in `frontend/`. It never touches backend code or database directly.
2. **Server-Side BFF Pattern**: All FastAPI backend communication occurs through `openapi-fetch` inside Server Components or Route Handlers (`import ''server-only''`). The browser NEVER communicates directly with FastAPI.
3. **Identity & Multi-Tenancy**: Clerk handles authentication and multi-tenancy. Active organization context (`orgId`) is session-managed.
4. **Colocated Component Architecture**:
   - Generic design system primitives live in `components/ui/` (shadcn) and `components/shared/`.
   - Feature-specific UI components **MUST** be colocated inside private `_components/` folders within their respective route directory in `app/`.

---

## 2. Complete File & Directory Blueprint

```text
frontend/
├── app/
│   ├── layout.tsx                                # Root HTML shell (fonts, theme provider, ClerkProvider)
│   ├── globals.css                               # Tailwind CSS v4 variables
│   │
│   ├── (marketing)/                              # Public marketing layout (header with Sign In / Get Started)
│   │   ├── layout.tsx
│   │   ├── page.tsx                              # Landing page (Hero, features, security showcase)
│   │   └── _components/
│   │       ├── landing-navbar.tsx
│   │       ├── hero-section.tsx
│   │       └── feature-cards.tsx
│   │
│   ├── (auth)/                                   # Centered layout for auth flows
│   │   ├── layout.tsx
│   │   ├── sign-in/[[...sign-in]]/page.tsx       # Clerk <SignIn /> component
│   │   ├── sign-up/[[...sign-up]]/page.tsx       # Clerk <SignUp /> component
│   │   └── org-selection/                        # Multi-org entry point (outside authenticated shell)
│   │       ├── page.tsx                          # Renders Clerk <OrganizationList />
│   │       └── _components/
│   │           └── org-selection-card.tsx
│   │
│   ├── (dashboard)/                              # Authenticated application shell
│   │   ├── layout.tsx                            # Sidebar + Header wrapper with Clerk auth check
│   │   ├── _components/                          # Shell-level private components
│   │   │   ├── app-sidebar.tsx                   # Collapsible icon sidebar with <OrganizationSwitcher />
│   │   │   ├── app-header.tsx                    # Breadcrumbs, Active Role badge, Command search trigger
│   │   │   ├── nav-items.tsx                     # Dynamic role-filtered navigation items
│   │   │   ├── user-nav.tsx                      # Clerk <UserButton /> + Theme toggle
│   │   │   └── command-menu.tsx                  # Cmd+K quick search modal
│   │   │
│   │   ├── dashboard/                            # Route: /dashboard
│   │   │   ├── page.tsx                          # Role-scoped summary view (Recharts metrics, deadlines)
│   │   │   └── _components/
│   │   │       ├── role-metrics-cards.tsx        # High-level KPIs based on user scope
│   │   │       ├── deadline-tracker.tsx          # Upcoming task deadlines widget
│   │   │       └── personal-strikes-card.tsx     # Current user strike summary
│   │   │
│   │   ├── tasks/                                # Route: /tasks
│   │   │   ├── page.tsx                          # Dedicated task management table
│   │   │   └── _components/
│   │   │       ├── task-data-table.tsx           # Sortable, filterable task list
│   │   │       ├── task-filter-toolbar.tsx       # Filter by status, team, assignee
│   │   │       └── create-task-dialog.tsx        # Task assignment dialog (with dependency selector)
│   │   │
│   │   ├── chat/                                 # Route: /chat
│   │   │   ├── page.tsx                          # Role-aware Agentic RAG chat interface
│   │   │   └── _components/
│   │   │       ├── chat-message-list.tsx         # Message bubbles with markdown rendering
│   │   │       ├── chat-input-box.tsx            # Input area with file context toggle
│   │   │       ├── citation-badge.tsx            # Clickable SOP source references
│   │   │       └── thinking-stepper.tsx          # Agent reasoning & tool-call indicator
│   │   │
│   │   ├── documents/                            # Route: /documents
│   │   │   ├── page.tsx                          # Role-accessible SOP & policy document browser
│   │   │   └── _components/
│   │   │       ├── document-grid.tsx             # Card grid of accessible docs
│   │   │       └── document-viewer-sheet.tsx     # Slide-over preview for policy docs
│   │   │
│   │   └── admin/                                # Route: /admin/* (Restricted to roles with admin perms)
│   │       ├── layout.tsx                        # Admin sub-navigation tabs (Roles, Teams, Docs, Strikes)
│   │       ├── page.tsx                          # Redirects to /admin/roles or shows admin overview
│   │       ├── roles/                            # Route: /admin/roles
│   │       │   ├── page.tsx                      # Visual Role Hierarchy builder
│   │       │   └── _components/
│   │       │       ├── role-flow-tree.tsx        # React Flow canvas rendering hierarchy DAG
│   │       │       ├── role-node.tsx             # Custom React Flow node displaying role & permissions
│   │       │       └── create-role-dialog.tsx    # Dialog to add role and configure parent_role_id
│   │       ├── teams/                            # Route: /admin/teams
│   │       │   ├── page.tsx                      # Team directory and membership management
│   │       │   └── _components/
│   │       │       ├── team-list.tsx             # Cards/table of teams
│   │       │       ├── create-team-dialog.tsx    # Create new team
│   │       │       └── add-member-dialog.tsx     # Invite user by email and assign team role
│   │       ├── documents/                        # Route: /admin/documents
│   │       │   ├── page.tsx                      # Upload & Tag Policy/SOP documents
│   │       │   └── _components/
│   │       │       ├── doc-upload-dropzone.tsx   # Uploadthing file dropzone
│   │       │       └── tag-scope-select.tsx      # Modal to choose Role OR Team scope tag
│   │       └── strikes/                          # Route: /admin/strikes
│   │           ├── page.tsx                      # Strike appeal review & policy validation audit
│   │           └── _components/
│   │               ├── appeal-review-table.tsx   # Pending appeals for review_strike roles
│   │               └── strike-audit-drawer.tsx   # Drawer showing agent RAG validation rationale
│   │
│   └── api/
│       └── chat/
│           └── stream/
│               └── route.ts                      # Route Handler: BFF SSE proxy to FastAPI /chat/stream
│
├── components/
│   ├── ui/                                       # shadcn/ui primitives (button, dialog, sheet, sidebar)
│   └── shared/                                   # App-wide reusable components (theme-toggle, icons)
│
├── lib/
│   ├── api/
│   │   ├── v1.d.ts                               # Auto-generated OpenAPI TypeScript types
│   │   ├── client.ts                             # Singleton openapi-fetch client with Clerk auth middleware
│   │   └── queries/                              # cache()-wrapped Server Component data fetchers
│   └── utils.ts                                  # cn() and shared formatting utilities
│
└── middleware.ts                                 # Clerk route protection & active-org redirect logic
```
