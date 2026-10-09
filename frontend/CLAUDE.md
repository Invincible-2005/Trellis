@AGENTS.md

# Frontend: where files go

The canonical file tree is [`.scratch/frontend-scaffold/spec.md`](../.scratch/frontend-scaffold/spec.md), with its plan in `.scratch/frontend-scaffold/map.md`. **Read the spec before creating or moving any file in `frontend/`.** If the right place isn't obvious or the spec doesn't cover it, **ask the user** (plain words, one question, one recommendation) instead of guessing or inventing a new folder.

(`AGENTS.md` above is rewritten by `next dev`. Put our own rules here, not there.)

## Where things go

| What | Where |
|---|---|
| A page / route | `app/<route-group>/<route>/page.tsx`. Groups: `(marketing)` public, `(auth)` sign-in/onboarding, `(dashboard)` signed-in app. |
| UI that belongs to one page | A private `_components/` folder next to that page. Not in `components/`. |
| Generic building blocks (shadcn buttons, dialogs, theme toggle) | `components/ui/` (shadcn) or `components/shared/` (our own, used in several places) |
| Calling the backend | Reads: `lib/api/queries/` (server-side data fetchers). Writes from forms: `lib/api/actions/` (Server Actions that return `{ ok, message }` for a toast). The browser never calls FastAPI directly; it goes through the Next.js server (BFF). |
| Chat stream proxy | `app/api/chat/sessions/[sessionId]/message/route.ts` |
| Small helpers | `lib/utils.ts` |
| Route protection | `proxy.ts` (Next.js 16's name for middleware) |

## Rules of thumb
- `lib/api/v1.d.ts` is generated from the backend's `openapi.json`. Never edit it by hand.
- Show or hide navigation and admin pages using the permissions from `GET /api/v1/auth/context`, never a Clerk role.
- Check `node_modules/next/dist/docs/` before using a Next.js feature (see the block above).

## When to ask
Ask the user before: adding a new route group or top-level folder, putting a component in `components/shared/` instead of a page's `_components/`, or deviating from the spec's tree. If the spec and the code already disagree, mention it and let the user decide whether to update the spec.
