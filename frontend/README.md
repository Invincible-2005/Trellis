# Trellis Frontend

The Next.js app for Trellis. It is the only thing the browser talks to: it shows the pages and also acts as the **BFF** (backend for frontend), calling the FastAPI backend from the server with the user's Clerk token.

For what Trellis is and how to set up the whole project, see the [root README](../README.md).

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Needs `frontend/.env` (Clerk, `FASTAPI_INTERNAL_URL`, Arcjet, UploadThing keys). The full list is in the root README, section 7.3. The backend must be running first.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server. |
| `pnpm build` / `pnpm start` | Production build and run. |
| `pnpm lint` | Run ESLint. |
| `pnpm api:generate` | Regenerate the typed API client (`lib/api/v1.d.ts`) and the zod schemas (`lib/api/schemas/zod.gen.ts`) from `../backend/openapi.json`. Run it after every backend endpoint change. |
| `pnpm api:generate:live` | Same, but reads from a running backend at `127.0.0.1:8000`. |

## Folder guide

```
app/
  (marketing)/    public landing page
  (auth)/         sign-in, sign-up, org selection, onboarding
  (dashboard)/    the signed-in app: dashboard, chat, tasks, teams, feedback, admin/*
  api/            chat stream proxy and UploadThing route
  <page>/_components/   UI that belongs to just that page
components/
  ui/             shadcn building blocks
  shared/         our own pieces used in several pages (created when first needed)
lib/
  api/queries/    server-side data loaders (reads)
  api/actions/    Server Actions (writes, return { ok, message } for a toast)
  api/schemas/    zod form checks, one file per area (built on the generated ones)
  query/          TanStack Query setup for instant (optimistic) updates
  middleware/     Arcjet rate limits and bot protection
proxy.ts          route protection (Next.js 16's name for middleware)
```

## How data flows

- **Read:** a page's Server Component calls a loader in `lib/api/queries/`, which calls FastAPI with the user's token.
- **Write:** a form calls a Server Action in `lib/api/actions/`. It validates with zod, calls FastAPI, then refreshes the page data. Errors show as toasts.
- **Chat:** the browser posts to `app/api/chat/...`, which forwards to FastAPI and streams the answer back (SSE).
- The browser never calls FastAPI directly.

## Rules to remember

- Never edit `lib/api/v1.d.ts` or `lib/api/schemas/zod.gen.ts` by hand. They are generated.
- Show or hide navigation using the permissions from `GET /api/v1/auth/context`, never a Clerk role. The backend still enforces every action.
- Do not call `router.refresh()` after a Server Action; the action already refreshes the page.
- This is Next.js 16, which differs from older versions. Check `node_modules/next/dist/docs/` before using a Next.js feature.
- Before adding or moving files, check [`.scratch/frontend-scaffold/spec.md`](../.scratch/frontend-scaffold/spec.md) (the agreed file tree) and `CLAUDE.md` in this folder.
