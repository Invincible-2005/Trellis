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
- Route groups (as built, per `spec.md`): `(marketing)` public, `(auth)` sign-in/up + `/org-selection`, `(dashboard)` authenticated shell with `admin/` nested inside it. *(Original wording `(public)/(authenticated)/(admin)` superseded 2026-10-08.)*
- Next.js 16 renames `middleware.ts` → **`proxy.ts`**; installed Clerk is **`@clerk/nextjs` v7** (ticket 02 was researched against v6 — APIs used there still apply).
- BFF pattern is non-negotiable: all FastAPI calls happen server-side (Server Components or Route Handlers); the generated API client is never imported in client-side code
- No frontend code files are created until architecture tickets are resolved

**Skills every session should consult:** grilling, domain-modeling

## Decisions so far

- [Admin Console Component Architecture](.scratch/frontend-scaffold/issues/06-admin-console-architecture.md): Dedicated sub-routes under /admin/* with shared tab layout; React Flow hierarchy viewer with Sheet/Dialog modal editors; two-step Uploadthing modal tagging docs strictly to Role OR Team.
- [Authenticated Shell Layout Design](.scratch/frontend-scaffold/issues/05-authenticated-shell-layout.md): Collapsible icon sidebar with top <OrganizationSwitcher /> and bottom <UserButton />; header with breadcrumbs, role badge, and Cmd+K palette; strict route-level _components/ colocation per feature.
- [Route URL Tree and Page Inventory](.scratch/frontend-scaffold/issues/01-route-url-tree.md): Clean session-based URLs (/dashboard, /tasks, /chat, /admin/*); /org-selection standalone route; tasks split between /dashboard summary and /tasks detail; user strikes on dashboard and review on ~~/admin/strikes~~ `/feedback` (trellis/12 D54, 2026-10-15: give strikes, give commendations, review appeals on one sidebar page).
- [Clerk Middleware Pattern for Route Groups](.scratch/frontend-scaffold/issues/02-clerk-middleware-pattern.md): Use `clerkMiddleware()` (public-by-default; installed v7, file is `proxy.ts`); `await auth()` everywhere; /org-selection lives outside the authenticated shell. Admin gating by Clerk role is **superseded** by trellis/12 D4 (Trellis permissions checked in `admin/layout.tsx`). **`proxy.ts` rules decided 2026-10-08:** public `/`, `/sign-in`, `/sign-up`; no active org → `/org-selection`; `/api/*` returns D16 JSON errors instead of redirecting; Clerk fallback redirect → `/dashboard`.
- [openapi-fetch Server-Only Client Pattern](.scratch/frontend-scaffold/issues/03-openapi-fetch-server-pattern.md): Singleton `api` client in `lib/api/client.ts` with the Clerk JWT injected via `onRequest` middleware (Bearer token only, no X-* headers, per D8); `parseAs: 'stream'` for SSE proxy Route Handlers; `cache()` wraps query functions (not the client); `import 'server-only'` guards the module.

- [Form writes (trellis/12 D18)](../trellis/issues/12-decision-reconciliation.md): **Server Actions** in `lib/api/actions/`, returning `{ ok, message }` for toasts; `revalidatePath` on success. Route Handlers only for streaming.
- [Form input checks (trellis/12 D49)](../trellis/issues/12-decision-reconciliation.md): **react-hook-form + zod, schemas generated from the backend.** `pnpm api:generate` writes `lib/api/schemas/zod.gen.ts` from `backend/openapi.json` (same source as `v1.d.ts`), so form rules match Pydantic. One file per area (`schemas/roles.ts`, `members.ts`, …) re-exports that area's schemas; `schemas/shared.ts` holds the error wording, `firstError()` and `emptyAsNull()`. Form versions (e.g. `zInviteMemberForm`: email trimmed, "No role" → null) live in the area file. Dialogs use `zodResolver(zXxxRequest)` + shadcn `Form` (errors under the field; `.extend()` only for frontend-only fields); Server Actions `safeParse` the same schema before calling the backend.
- [Request protection (trellis/12 D27)](../trellis/issues/12-decision-reconciliation.md): Arcjet in `lib/middleware/`: `gate()` runs in `proxy.ts` (shield, bots, read limit); Server Actions start with `limit(tier)` (write / heavyRead / heavyWrite). No CORS.
- ~~[Policies page (trellis/12 D34)](../trellis/issues/12-decision-reconciliation.md): `/documents` → **`/organization`** (org description + policies you can see); Upload / Delete on that page for people allowed; no `/admin/documents`. Admin = Roles, Members, Strikes.~~ Superseded by D37: `/admin/documents` again (upload permission org-wide or on a team); no `/organization` page.
- [Optimistic updates (trellis/12 D50)](issues/09-tanstack-query-setup.md): TanStack Query `useMutation` calls the existing Server Action. The change appears at once (a create gets a temp uuid that is swapped for the real id on success) and rolls back with a toast on error. The cache is seeded from Server Component props, and the server's fresh copy replaces it after `revalidatePath`. No browser reads; Route Handlers stay for streaming. Order: Members → Documents → Chat sidebar → Roles; Teams and Tasks added 2026-10-17 (`use-task-changes.ts`, `use-team-list-changes.ts`, `use-team-member-changes.ts`).
- [Admin navigation (trellis/12 D36)](../trellis/issues/12-decision-reconciliation.md): no tab bar in `admin/layout.tsx` (gate only); the sidebar's Admin sub-list is the admin nav. Fix list from the 2026-10-11 review of the admin console is in ticket 06 §4.

## Cross-map links (audit 2026-10-08)

- System-level conflicts that affect the frontend are tracked in [trellis/12-decision-reconciliation](../trellis/issues/12-decision-reconciliation.md): chat endpoint `POST /api/v1/chat/sessions/{session_id}/message` (D2, resolved), `/api/v1` prefix (D3, resolved), admin-console access (D4, resolved: Trellis RBAC, `create_role` OR `add_member` org-wide, per-tab gating, no Clerk-role gate in `proxy.ts`), BFF sends only the Bearer token (D8, resolved), `/onboarding` + `POST /api/v1/orgs/provision` for new orgs (D10, resolved).
- Ticket 07 here ↔ trellis/09 (SSE) and trellis/07; ticket 08 here ↔ trellis/07 and trellis/05 (polymorphic `GET /api/v1/dashboard`).
- Ticket 04 (Clerk setup) looks done in practice (`ClerkProvider` + `frontend/.env` exist), but D8/D10 **added dashboard settings** (self-serve org creation, backend Clerk env vars). Finish the checklist, then mark it resolved. **Decided 2026-10-08:** keep the teammate's existing Clerk app (one shared dev instance); no custom session claims; the owner shares the backend keys and records the token's claim format and `azp`.
- Implementation of identity and onboarding (backend + `/onboarding` page + admin layout gate): [trellis/13](../trellis/issues/13-identity-and-org-provisioning.md).

## Not yet specified

- Component-level design for individual surfaces (task list, document uploader, strike panel)
- File and folder naming conventions beyond route structure
- Error boundary and loading skeleton strategy per route group
- Dark mode / theming approach for shadcn components
- ~~Form state management strategy (react-hook-form + zod vs. Server Actions alone).~~ Decided 2026-10-13 (trellis/12 D49): react-hook-form + zod, see "Form input checks" above.

## Out of scope

<!-- nothing ruled out yet -->




