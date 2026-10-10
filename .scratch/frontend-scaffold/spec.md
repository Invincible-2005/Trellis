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
│   │   ├── org-selection/                        # Multi-org entry point (outside authenticated shell)
│   │   │   ├── page.tsx                          # <OrganizationList hidePersonal afterCreateOrganizationUrl="/onboarding" />
│   │   │   └── _components/
│   │   │       └── org-selection-card.tsx
│   │   └── onboarding/                           # New-org setup (trellis ticket 12 D10)
│   │       └── page.tsx                          # Server Component: POST /api/v1/orgs/provision → redirect('/dashboard')
│   │
│   ├── (dashboard)/                              # Authenticated application shell
│   │   ├── layout.tsx                            # Sidebar + Header wrapper with Clerk auth check
│   │   ├── _components/                          # Shell-level private components
│   │   │   ├── app-sidebar.tsx                   # Collapsible icon sidebar with <OrganizationSwitcher />
│   │   │   ├── app-header.tsx                    # Breadcrumbs, Active Role badge, Command search trigger
│   │   │   ├── nav-items.tsx                     # Nav items filtered by auth/context permissions
│   │   │   ├── user-nav.tsx                      # Clerk <UserButton /> + Theme toggle
│   │   │   ├── use-mobile.ts                     # shadcn sidebar's phone-size helper; moved here from hooks/ (no top-level hooks/ folder, decided 2026-10-10)
│   │   │   └── command-menu.tsx                  # Cmd+K quick search modal (optional)
│   │   │
│   │   ├── dashboard/                            # Route: /dashboard
│   │   │   ├── page.tsx                          # Role-scoped summary view (Recharts metrics, deadlines)
│   │   │   └── _components/
│   │   │       ├── role-metrics-cards.tsx        # High-level KPIs based on user scope
│   │   │       ├── deadline-tracker.tsx          # Upcoming task deadlines widget
│   │   │       └── personal-strikes-card.tsx     # Current user strike summary
│   │   │
│   │   ├── teams/                                # Route: /teams (added 2026-10-10, trellis/12 D28)
│   │   │   ├── page.tsx                          # Teams you can see (D13); Create team if can_org(create_team)
│   │   │   ├── _components/
│   │   │   │   ├── team-list.tsx                 # Cards: name · "You: <role>" or "Overseeing" · N members · open/overdue tasks
│   │   │   │   └── create-team-dialog.tsx        # Create new team
│   │   │   └── [teamId]/                         # Route: /teams/[teamId]
│   │   │       ├── page.tsx                      # Members + team tasks (task-data-table + create-task-dialog from tasks/_components)
│   │   │       └── _components/
│   │   │           ├── team-members-table.tsx    # Name, team role
│   │   │           ├── add-member-dialog.tsx     # Existing org member + team role (D25); shown if can(add_member, team)
│   │   │           └── delete-team-button.tsx    # Confirm + deleteTeam; shown if deletable (D31)
│   │   │       (Create task reuses tasks/_components/create-task-dialog.tsx; shown if can(assign_task, team))
│   │   │       Data: lib/api/queries/teams.ts, lib/api/actions/teams.ts (added 2026-10-10)
│   │   │
│   │   ├── tasks/                                # Route: /tasks (core round 2026-10-10, trellis/12 D32/D33)
│   │   │   ├── page.tsx                          # My tasks by default; filters in URL search params
│   │   │   └── _components/
│   │   │       ├── task-data-table.tsx           # Rows; status dropdown if can_change_status, Edit/Delete if can_edit (also on team page)
│   │   │       ├── task-filter-toolbar.tsx       # Mine/All, team, status, overdue
│   │   │       ├── create-task-dialog.tsx        # Team, title, description, assignee (assignable members), deadline (no dependency selector yet)
│   │   │       └── edit-task-dialog.tsx          # Same fields prefilled; only for can_edit
│   │   │       Data: lib/api/queries/tasks.ts, lib/api/actions/tasks.ts (added 2026-10-10)
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
│   │   └── admin/                                # Route: /admin/* (create_role OR add_member org-wide; per-tab perms)
│   │       ├── layout.tsx                        # Tabs + gate: redirect unless auth/context.active_org.can_open_admin (D4)
│   │       ├── page.tsx                          # Redirects to /admin/roles or shows admin overview
│   │       ├── roles/                            # Route: /admin/roles
│   │       │   ├── page.tsx                      # Visual Role Hierarchy builder
│   │       │   └── _components/
│   │       │       ├── role-flow-tree.tsx        # React Flow canvas rendering hierarchy DAG
│   │       │       ├── role-node.tsx             # Custom React Flow node displaying role & permissions
│   │       │       └── create-role-dialog.tsx    # Dialog to add role and configure parent_role_id
│   │       ├── members/                          # Route: /admin/members (add_member; added 2026-10-09, trellis/12 D25)
│   │       │   ├── page.tsx                      # Org members + pending invites
│   │       │   └── _components/
│   │       │       ├── members-table.tsx         # Name, email, org role, joined
│   │       │       ├── invitations-table.tsx     # Pending invites with Cancel
│   │       │       └── invite-member-dialog.tsx  # Email + role picker (assignable roles)
│   │       │   (teams/ tab removed 2026-10-10, trellis/12 D28 → see /teams above)
│   │       ├── documents/                        # Route: /admin/documents
│   │       │   ├── page.tsx                      # Upload & Tag Policy/SOP documents
│   │       │   └── _components/
│   │       │       ├── documents-table.tsx       # Rows, status badge (polls while processing), delete (added 2026-10-09)
│   │       │       ├── doc-upload-dropzone.tsx   # Uploadthing file dropzone
│   │       │       └── tag-scope-select.tsx      # Modal to choose Org / Role / Team scope tag
│   │       └── strikes/                          # Route: /admin/strikes
│   │           ├── page.tsx                      # Strike appeal review & policy validation audit
│   │           └── _components/
│   │               ├── appeal-review-table.tsx   # Pending appeals for review_strike roles
│   │               └── strike-audit-drawer.tsx   # Drawer showing agent RAG validation rationale
│   │
│   └── api/
│       ├── uploadthing/                          # Added 2026-10-09 (documents effort)
│       │   ├── core.ts                           # Upload rules: file types, 16 MB, gate = signed in + upload_document
│       │   └── route.ts                          # UploadThing endpoint (public in proxy.ts for UploadThing's callback)
│       └── chat/
│           └── sessions/
│               └── [sessionId]/
│                   └── message/
│                       └── route.ts              # BFF SSE proxy → FastAPI POST /api/v1/chat/sessions/{session_id}/message
│
├── components/
│   ├── ui/                                       # shadcn/ui primitives (button, dialog, sheet, sidebar)
│   └── shared/                                   # App-wide reusable components (theme-toggle, icons)
│
├── lib/
│   ├── api/
│   │   ├── v1.d.ts                               # Auto-generated OpenAPI TypeScript types
│   │   ├── client.ts                             # Singleton openapi-fetch client with Clerk auth middleware
│   │   ├── queries/                              # cache()-wrapped Server Component data fetchers (reads)
│   │   └── actions/                              # 'use server' Server Actions for form writes; return { ok, message } (trellis/12 D18)
│   ├── middleware/                               # Arcjet request protection (trellis/12 D27, added 2026-10-10)
│   │   ├── arcjet.ts                             # All rules + per-user limits (read, write, heavyRead, heavyWrite)
│   │   ├── gate.ts                               # gate(): front gate run by proxy.ts (shield, bots, read limit)
│   │   └── limit.ts                              # limit(tier): first line of a Server Action / chat route
│   ├── uploadthing.ts                            # Typed UploadDropzone / UploadButton (added 2026-10-09)
│   └── utils.ts                                  # cn() and shared formatting utilities
│
└── proxy.ts                                      # Next.js 16 name for middleware: Arcjet gate, Clerk route protection & active-org redirect
```
