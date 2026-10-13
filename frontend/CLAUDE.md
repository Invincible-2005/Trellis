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
| Form input checks | zod schemas are **generated** from the backend: `pnpm api:generate` writes `lib/api/schemas/zod.gen.ts` (never edit or import it directly). Import from the area file, e.g. `@/lib/api/schemas/roles` (`members`, `teams`, `tasks`, `documents`, `chat`, `orgs`). The dialog uses `useForm({ resolver: zodResolver(zXxxRequest) })` with shadcn `Field` / `FieldError` (`components/ui/field.tsx`) so errors show under the field; see the Roles dialogs for the pattern; the Server Action runs the same schema's `safeParse(input)` first and returns `{ ok: false, message }` if it fails. Need a frontend-only tweak (trim, a picker's "None" = `""` → `emptyAsNull()`, a cross-field rule)? Add a form version in the area file by `.extend()`-ing the generated schema; never retype backend rules by hand (trellis/12 D49). |
| Rate limits and bot protection | `lib/middleware/` (Arcjet). New Server Actions that change data start with `const blocked = await limit('write'); if (blocked) return blocked;` (`heavyWrite` for uploads/invites, `heavyRead` for chat). |

## Rules of thumb
- `lib/api/v1.d.ts` and `lib/api/schemas/zod.gen.ts` are generated from the backend's `openapi.json` (`pnpm api:generate`). Never edit them by hand; rerun the command after a backend change.
- **Never call `router.refresh()` after a Server Action.** The action's `revalidatePath` / `refresh()` already updates the page; a client refresh on top collides with that update and freezes the page's router (found 2026-10-13 on Admin → Documents). Polling: let a Server Action call `refresh()` from `next/cache` when something changed (see `checkProcessingDocuments`).
- Show or hide navigation and admin pages using the permissions from `GET /api/v1/auth/context`, never a Clerk role.
- Check `node_modules/next/dist/docs/` before using a Next.js feature (see the block above).

## When to ask
Ask the user before: adding a new route group or top-level folder, putting a component in `components/shared/` instead of a page's `_components/`, or deviating from the spec's tree. If the spec and the code already disagree, mention it and let the user decide whether to update the spec.
