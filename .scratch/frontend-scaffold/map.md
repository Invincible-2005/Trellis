# Wayfinder Map — Frontend Scaffold Architecture
Label: wayfinder:map

## Destination

A complete, locked frontend architecture document: every route, layout boundary, auth group, component responsibility, data-fetching strategy, and inter-layer contract (Clerk ? Next.js ? FastAPI via BFF) is specified precisely enough that the team starts building features without re-deciding structure. No code is written until this map is resolved.

## Notes

**Domain:** Trellis — Role-Aware Agentic RAG Workspace. See `/trellis-prd.md` for the full PRD.

**Stack (locked):**
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- Auth: Clerk (multi-org Organizations API)
- Transport: FastAPI OpenAPI ? `openapi-typescript` types ? `openapi-fetch` typed client (server-side BFF only; browser never reaches FastAPI)
- TanStack Query: for client-side reactive state (chat streaming, optimistic updates) — add when the feature needs it, not upfront
- Charts: Recharts | Diagrams: React Flow | File uploads: Uploadthing | Edge security: Arcjet

**Standing decisions:**
- Route groups by auth state: `(public)`, `(authenticated)`, `(admin)` — each with its own layout
- BFF pattern is non-negotiable: all FastAPI calls happen server-side (Server Components or Route Handlers); the generated API client is never imported in client-side code
- No frontend code files are created until architecture tickets are resolved

**Skills every session should consult:** grilling, domain-modeling

## Decisions so far

- [Admin Console Component Architecture](.scratch/frontend-scaffold/issues/06-admin-console-architecture.md): Dedicated sub-routes under /admin/* with shared tab layout; React Flow hierarchy viewer with Sheet/Dialog modal editors; two-step Uploadthing modal tagging docs strictly to Role OR Team.
- [Authenticated Shell Layout Design](.scratch/frontend-scaffold/issues/05-authenticated-shell-layout.md): Collapsible icon sidebar with top <OrganizationSwitcher /> and bottom <UserButton />; header with breadcrumbs, role badge, and Cmd+K palette; strict route-level _components/ colocation per feature.
- [Route URL Tree and Page Inventory](.scratch/frontend-scaffold/issues/01-route-url-tree.md): Clean session-based URLs (/dashboard, /tasks, /chat, /admin/*); /org-selection standalone route; tasks split between /dashboard summary and /tasks detail; user strikes on dashboard and review on /admin/strikes.
- [Clerk Middleware Pattern for Route Groups](.scratch/frontend-scaffold/issues/02-clerk-middleware-pattern.md): Use clerkMiddleware() (v6, public-by-default); wait auth() everywhere; /org-selection lives outside (authenticated) layout; admin gated via uth.protect((has) => has({ role/permission })).
- [openapi-fetch Server-Only Client Pattern](.scratch/frontend-scaffold/issues/03-openapi-fetch-server-pattern.md): Singleton pi client in lib/api/client.ts with Clerk JWT injected via onRequest middleware; parseAs: 'stream' for SSE proxy Route Handlers; cache() wraps query functions (not the client); import 'server-only' guards the module.

## Not yet specified

- Component-level design for individual surfaces (task list, document uploader, strike panel)
- File and folder naming conventions beyond route structure
- Error boundary and loading skeleton strategy per route group
- Dark mode / theming approach for shadcn components
- Form state management strategy (react-hook-form + zod vs. Server Actions alone)

## Out of scope

<!-- nothing ruled out yet -->




