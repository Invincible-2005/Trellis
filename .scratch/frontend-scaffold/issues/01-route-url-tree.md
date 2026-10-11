# 01 — Route URL Tree and Page Inventory
Type: grilling
Status: resolved

## Question

What are ALL the routes/pages in the Trellis frontend, what are their exact URLs, which auth route group do they live in (`(public)`, `(authenticated)`, `(admin)`), and what layout does each group share?

This is the most foundational ticket: every other frontend decision depends on knowing the complete page inventory and the URL structure.

Decisions this ticket must lock:
- Complete list of all pages with their URL paths
- Which route group each page belongs to
- What shared layout each route group renders (sidebar, topbar, none)
- Which pages are server-rendered vs. need client interactivity
- The org-context URL pattern (is org ID in the URL, e.g. `/org/[orgId]/dashboard`, or is it a session variable from Clerk?)

## Answer

### 1. Locked URL & Route Structure

> ⚠️ **Folder names superseded (2026-10-08):** ticket 05 and `spec.md` renamed the groups to `(marketing)`, `(auth)`, `(dashboard)` (admin nested at `(dashboard)/admin/*`). **URLs below are unchanged and still canonical;** only the File Location column is stale.

The frontend is structured by auth state route groups: `app/(public)`, `app/(auth)`, `app/(authenticated)`, and `app/(admin)`.

- **Org Context**: Managed via Clerk session state (NOT in the URL path). All app URLs are clean: `/dashboard`, `/tasks`, `/chat`, `/admin`.
- **First-time / Org Switch Onboarding**: Standalone route outside authenticated layout: `/org-selection`.
- **Tasks**: Summary widget on `/dashboard` + dedicated CRUD & filtering page on `/tasks`.
- **Strikes & Appeals**: User's personal strikes shown on `/dashboard`; strike review & appeals in `/admin/strikes`.

### 2. Complete Route Map

| Route URL | Route Group / File Location | Rendering Strategy | Purpose & Shared Layout |
|---|---|---|---|
| `/` | `app/(public)/page.tsx` | Static / RSC | Public landing page (Hero, Sign In/Up CTA, About) |
| `/sign-in(.*)` | `app/(auth)/sign-in/[[...sign-in]]/page.tsx` | Client / Clerk | Clerk hosted/embedded Sign-in |
| `/sign-up(.*)` | `app/(auth)/sign-up/[[...sign-up]]/page.tsx` | Client / Clerk | Clerk hosted/embedded Sign-up |
| `/org-selection` | `app/(auth)/org-selection/page.tsx` | RSC + Clerk Client | Standalone layout. Prompts user to pick/create an org |
| `/onboarding` | `app/(auth)/onboarding/page.tsx` | RSC | *(added 2026-10-08, trellis/12 D10)* After Clerk org creation: calls `POST /api/v1/orgs/provision`, then redirects to `/dashboard`. Also the target of any `409 org_not_provisioned` |
| `/dashboard` | `app/(authenticated)/dashboard/page.tsx` | RSC + Client widgets | Authenticated shell (Sidebar + Header). Metrics & strike summary |
| `/tasks` | `app/(authenticated)/tasks/page.tsx` | RSC + Client interactive | Authenticated shell. Full task management, filter by status/team |
| `/chat` | `app/(authenticated)/chat/page.tsx` | RSC shell + Client SSE | Authenticated shell. Agentic RAG chat with streaming & citations |
| ~~`/documents`~~ `/organization` | `app/(dashboard)/organization/page.tsx` | RSC + Client dialogs | Org description + policies you can see; Upload / Delete for people allowed *(renamed 2026-10-11, trellis/12 D34)* |
| `/admin` | `app/(admin)/admin/page.tsx` | RSC | Admin shell. Overview & quick admin navigation |
| `/admin/roles` | `app/(admin)/admin/roles/page.tsx` | Client (React Flow) | Admin shell. Interactive role hierarchy tree & permissions |
| `/teams` | `app/(dashboard)/teams/page.tsx` | RSC + Client dialogs | Teams you can see (D13); Create team if `can_org("create_team")` (added 2026-10-10, trellis/12 D28) |
| `/teams/[teamId]` | `app/(dashboard)/teams/[teamId]/page.tsx` | RSC + Client dialogs | Members + tasks; Add member if `can("add_member", team)`, Create task if `can("assign_task", team)` (D28) |
| ~~`/admin/teams`~~ | ~~`app/(admin)/admin/teams/page.tsx`~~ | | (superseded 2026-10-10 by trellis/12 D28: team work moved to `/teams`) |
| ~~`/admin/documents`~~ | ~~`app/(admin)/admin/documents/page.tsx`~~ | | (superseded 2026-10-11 by trellis/12 D34: uploads moved to `/organization`) |
| `/admin/strikes` | `app/(admin)/admin/strikes/page.tsx` | RSC + Client dialogs | Admin shell. Strike appeal review & policy validation log |
| `/api/chat/sessions/[sessionId]/message` | `app/api/chat/sessions/[sessionId]/message/route.ts` | Route Handler (Node) | BFF SSE proxy to FastAPI `POST /api/v1/chat/sessions/{session_id}/message` *(path updated 2026-10-08, trellis/12 D2)* |

