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
│   │   ├── layout.tsx                            # Sidebar + Header wrapper with Clerk auth check; wraps everything in QueryProvider keyed by org (D50, 2026-10-14)
│   │   ├── _components/                          # Shell-level private components
│   │   │   ├── app-sidebar.tsx                   # Collapsible icon sidebar; collapse button fixed top-left, <OrganizationSwitcher /> beside it (2026-10-11)
│   │   │   ├── app-header.tsx                    # Breadcrumbs, Active Role badge, Command search trigger
│   │   │   ├── nav-items.tsx                     # Nav items filtered by auth/context permissions; Admin opens a sub-list of the user's admin_tabs (2026-10-11)
│   │   │   ├── user-nav.tsx                      # Whole row (avatar, name, email) opens an account menu: Manage account (Clerk) / Sign out; theme toggle beside it (2026-10-11)
│   │   │   ├── use-mobile.ts                     # shadcn sidebar's phone-size helper; moved here from hooks/ (no top-level hooks/ folder, decided 2026-10-10)
│   │   │   └── command-menu.tsx                  # Cmd+K quick search modal (optional)
│   │   │
│   │   ├── dashboard/                            # Route: /dashboard
│   │   │   ├── page.tsx                          # Server Component: getDashboard() on open, no polling (trellis/12 D47/D48, 2026-10-13)
│   │   │   └── _components/
│   │   │       ├── task-status-chart.tsx         # Client: the one Recharts bar chart (my tasks by status)
│   │   │       ├── role-metrics-cards.tsx        # Team cards (D24) + org totals (view_aggregate only)
│   │   │       ├── deadline-tracker.tsx          # Next 5 deadlines
│   │   │       ├── personal-strikes-card.tsx     # My strikes (teammates build it read-only first); Piyush + Claude add the Appeal button (rows with can_appeal → note dialog, zAppealForm → appealStrike) afterwards (2026-10-15, D54)
│   │   │       └── commendations-card.tsx        # My latest 5 commendations
│   │   │       Data: lib/api/queries/dashboard.ts (getDashboard, added 2026-10-13)
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
│   │   ├── chat/                                 # Route: /chat (agent chat; task discussions are "Comments" inside a task, trellis/12 D41)
│   │   │   ├── layout.tsx                        # Chat-list panel + chat area, full height under the header (D41, 2026-10-12)
│   │   │   ├── page.tsx                          # /chat: new chat (empty screen + input)
│   │   │   ├── [sessionId]/
│   │   │   │   ├── page.tsx                      # /chat/[sessionId]: an existing chat (history loaded on open)
│   │   │   │   └── not-found.tsx                 # "Chat not found" (deleted, someone else's) + New chat (2026-10-12)
│   │   │   └── _components/
│   │   │       ├── use-chat-stream.ts            # Client hook: POST to the stream route, read SSE → messages / current step (built 2026-10-12)
│   │   │       ├── chat-conversation.tsx         # One chat: messages + input; a new chat is created on its first message (D42) (2026-10-12)
│   │   │       ├── chat-session-list.tsx         # New chat + your chats, rename/delete; hideable panel, drawer on phones (plain panel, not a shadcn Sidebar)
│   │   │       ├── rename-chat-dialog.tsx        # Rename (2026-10-12)
│   │   │       ├── delete-chat-dialog.tsx        # Delete with confirmation (2026-10-12)
│   │   │       ├── mention-popover.tsx           # The @ people / / teams list above the input (D43, 2026-10-12)
│   │   │       ├── mentions.ts                   # Mention tokens: chips in sent messages, display → token on send (D43)
│   │   │       ├── chat-message-list.tsx         # Message bubbles with markdown rendering
│   │   │       ├── chat-input-box.tsx            # Input: Enter sends, @ / mentions, 4,000-char counter (file context toggle dropped 2026-10-12)
│   │   │       ├── citation-badge.tsx            # Clickable SOP source references
│   │   │       ├── thinking-stepper.tsx          # Agent reasoning & tool-call indicator
│   │   │       └── confirm-action-card.tsx       # Confirm / Cancel card for the SSE `confirm` event (trellis/12 D22)
│   │   │
│   │   ├── feedback/                             # Route: /feedback (added 2026-10-15, trellis/12 D54; replaces /admin/strikes)
│   │   │   ├── page.tsx                          # Shown if you can give a strike, commend someone or review appeals; loads options, given, appeals
│   │   │   └── _components/                      # Layout settled 2026-10-15 (Piyush + Claude build it)
│   │   │       ├── feedback-view.tsx             # Heading + shadcn Tabs: Give · Given by you · Appeals to review (count); only tabs you can use; ?tab= in the URL
│   │   │       ├── give-feedback-form.tsx        # ONE form: Commendation / Strike switch (Strike only with give_strike), Team, Person, Reason (zGiveFeedbackForm).
│   │   │       │                                 #   Strike: Check policy → policy box (reused from chat's confirm card) + escalation line → Confirm strike; any edit drops the check.
│   │   │       │                                 #   Commendation: Give + "Are you sure?"
│   │   │       ├── given-feedback-list.tsx       # Newest first; status label: commendation / active / appealed, waiting / upheld or dismissed by X
│   │   │       ├── appeal-card.tsx               # Full card (no drawer): person, team, giver, date, escalated, reason, appeal note, saved policy check; Uphold / Dismiss with confirm
│   │   │       ├── policy-check-box.tsx          # Green / amber / grey policy verdict + passages (Feedback's own copy of chat's box, Piyush 2026-10-15)
│   │   │       ├── source-badge.tsx              # Clickable policy passage badge (own copy of chat's citation badge)
│   │   │       └── use-feedback-changes.ts       # Instant changes (D50): decided appeal leaves the list, a new strike/commendation shows in Given
│   │   │       Data: lib/api/queries/feedback.ts, lib/api/actions/feedback.ts, lib/api/schemas/feedback.ts (added 2026-10-15)
│   │   │       Sidebar: "Feedback" link when auth/context feedback_tabs isn't empty (nav-items.tsx)
│   │   │
│   │   │   (organization/ (D34) dropped 2026-10-11 by trellis/12 D37: no documents page outside Admin)
│   │   │
│   │   └── admin/                                # Route: /admin/* (open if any tab is allowed; per-tab perms)
│   │       ├── layout.tsx                        # Gate only: redirect unless auth/context.active_org.can_open_admin (D4). No tab bar: the sidebar's Admin sub-list is the admin nav (D36, 2026-10-11)
│   │       ├── page.tsx                          # Redirects to the first tab in admin_tabs
│   │       ├── roles/                            # Route: /admin/roles
│   │       │   ├── page.tsx                      # Visual Role Hierarchy builder
│   │       │   └── _components/
│   │       │       ├── role-flow-tree.tsx        # React Flow canvas rendering hierarchy DAG
│   │       │       ├── role-node.tsx             # Custom React Flow node displaying role & permissions
│   │       │       ├── create-role-dialog.tsx    # Dialog to add role and configure parent_role_id
│   │       │       ├── edit-role-dialog.tsx      # Click a manageable role: edit name/description/parent/permissions, or Delete (added 2026-10-11)
│   │       │       └── role-form-fields.tsx      # Fields shared by the create and edit dialogs (added 2026-10-11)
│   │       ├── members/                          # Route: /admin/members (add_member; added 2026-10-09, trellis/12 D25)
│   │       │   ├── page.tsx                      # Org members + pending invites
│   │       │   └── _components/
│   │       │       ├── members-table.tsx         # Name, email, org role, joined
│   │       │       ├── invitations-table.tsx     # Pending invites with Cancel
│   │       │       ├── invite-member-dialog.tsx  # Email + role picker (assignable roles)
│   │       │       ├── change-role-dialog.tsx    # Change a member's org role (rows with manageable: true; D38, 2026-10-11)
│   │       │       └── remove-member-dialog.tsx  # Confirm + removeMember (rows with manageable: true; D38, 2026-10-11)
│   │       │   (teams/ tab removed 2026-10-10, trellis/12 D28 → see /teams above)
│   │       ├── documents/                        # Route: /admin/documents (upload_document org-wide or on any team; back 2026-10-11, trellis/12 D37)
│   │       │   ├── page.tsx                      # Documents you can see + Upload (if you can tag somewhere) + Delete (if deletable)
│   │       │   └── _components/
│   │       │       ├── documents-view.tsx        # Heading, Upload button, table, upload dialog
│   │       │       ├── documents-table.tsx       # Rows: title, scope, status badge (polls while processing), Delete if deletable
│   │       │       ├── doc-upload-dropzone.tsx   # Two-step dialog: Uploadthing dropzone → tag → createDocument
│   │       │       ├── edit-document-dialog.tsx  # Edit title / description / who sees it (rows with deletable: true; D39, 2026-10-11)
│   │       │       └── tag-scope-select.tsx      # Tag picker: whole org / a role / a team
│   │       (strikes/ tab dropped 2026-10-15, trellis/12 D54 → see /feedback above)
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
│   │       (chat: queries/chat.ts getChats/getChat/getMentions, actions/chat.ts createChat/renameChat/deleteChat, 2026-10-12)
│   │       (feedback: queries/feedback.ts getFeedbackOptions/getGivenFeedback/getAppeals, actions/feedback.ts checkStrike/giveStrike/giveCommendation/appealStrike/decideAppeal, schemas/feedback.ts zGiveFeedbackForm/zAppealForm, 2026-10-15, trellis/12 D54)
│   │   └── schemas/                              # zod schemas for forms, one file per area (trellis/12 D49)
│   │       ├── zod.gen.ts                        # Auto-generated from openapi.json by `pnpm api:generate`; never edit, never import directly
│   │       ├── shared.ts                         # Friendly error wording (z.config), firstError() for toasts, emptyAsNull() for "None" pickers
│   │       └── roles.ts, members.ts, teams.ts, tasks.ts, documents.ts, chat.ts, orgs.ts  # that area's generated schemas + form versions (e.g. zInviteMemberForm)
│   ├── query/                                    # TanStack Query, only for instant (optimistic) changes (trellis/12 D50, added 2026-10-14)
│   │   ├── provider.tsx                          # QueryProvider: one cache per tab (fresh per org); never fetches on its own
│   │   ├── use-server-data.ts                    # useServerData(key, serverData): page data from the Server Component → cache; the server's fresh copy wins
│   │   └── action.ts                             # fromAction(action): a Server Action's { ok: false, message } becomes a thrown error, so onError rolls back
│   ├── middleware/                               # Arcjet request protection (trellis/12 D27, added 2026-10-10)
│   │   ├── arcjet.ts                             # All rules + per-user limits (read, write, heavyRead, heavyWrite)
│   │   ├── gate.ts                               # gate(): front gate run by proxy.ts (shield, bots, read limit)
│   │   └── limit.ts                              # limit(tier): first line of a Server Action / chat route
│   ├── uploadthing.ts                            # Typed UploadDropzone / UploadButton (added 2026-10-09)
│   └── utils.ts                                  # cn() and shared formatting utilities
│
└── proxy.ts                                      # Next.js 16 name for middleware: Arcjet gate, Clerk route protection & active-org redirect
```
