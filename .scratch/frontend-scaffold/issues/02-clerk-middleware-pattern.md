# 02 — Clerk Middleware Pattern for Route Groups
Type: research
Status: resolved

## Question

How does Clerk's Next.js SDK (v6+) gate specific route groups in App Router? Specifically:

- What does `middleware.ts` look like when `(public)` routes are unprotected, `(authenticated)` routes require any valid Clerk session, and `(admin)` routes additionally require a role/permission check?
- How does Clerk's `auth()` helper work in Server Components vs. Route Handlers?
- How is the active org (`orgId`) accessed server-side for passing to FastAPI as the BFF context?
- What is the correct pattern for the org-selection redirect (user is authed but has no active org ? send to `/org/select`)?

## Answer

> ⚠️ **Audit notes (2026-10-08):**
> - Next.js 16 uses **`frontend/proxy.ts`** (not `middleware.ts`); installed `@clerk/nextjs` is **v7**. The `clerkMiddleware`/`auth.protect` patterns below still apply — re-verify against v7 docs when wiring. Current `proxy.ts` is a bare `clerkMiddleware()` with no route protection yet.
> - The raw-`fetch` Route Handler and `createServerApiClient()` factory below are **superseded by ticket 03** (singleton `openapi-fetch` client + `onRequest` middleware).
> - **Admin gate resolved (trellis ticket 12 D4):** `proxy.ts` does **not** gate `/admin` with Clerk roles. Clerk roles grant nothing in Trellis.
>   - `proxy.ts` checks only signed-in and active org.
>   - `app/(dashboard)/admin/layout.tsx` fetches `GET /api/v1/auth/context` and redirects unless `active_org.can_open_admin` is true (`create_role` or `add_member` held org-wide).
>   - Each admin tab page checks its own permission.
>   - FastAPI enforces every action regardless.
> - **Headers resolved (D8):** the BFF sends **only** `Authorization: Bearer <token>`. `X-Org-Id`, `X-User-Id` and `X-Org-Role` are removed, and FastAPI ignores them.
> - **New route (D10):** `/onboarding` (in `(auth)`, outside the shell). `<OrganizationList afterCreateOrganizationUrl="/onboarding" />` sends new org creators there to call `POST /api/v1/orgs/provision`. It needs a signed-in user with an active org, so it goes through the normal rules below.

### Executive Summary

1. **Route groups `(public)`, `(authenticated)`, `(admin)` are filesystem-only** — `middleware.ts` matches against the actual URL pathnames, not the directory names.
2. **`clerkMiddleware` is public-by-default** — anything not explicitly guarded with `auth.protect()` is accessible.
3. **`auth()` is async in v6** — always `await auth()` everywhere (Server Components, Route Handlers, middleware).
4. **BFF org-context forwarding**: pass **only** `Authorization: Bearer <token>`. The active org is inside the token. *(`X-Org-Id` and `X-Org-Role` removed 2026-10-08, D8.)*
5. **`/org-selection` must NOT live inside the `(authenticated)` layout tree** — circular redirect risk.

---

### 1. `middleware.ts` for Trellis Route Groups

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

const isOrgSelectRoute = createRouteMatcher(['/org-selection(.*)']);
// No isAdminRoute matcher: admin access is decided by Trellis permissions in
// app/(dashboard)/admin/layout.tsx, not by Clerk roles (trellis ticket 12 D4).

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, orgId } = await auth();

  if (!userId) {
    return (await auth()).redirectToSignIn({ returnBackUrl: req.url });
  }

  // No active org ? send to org selection (guard against infinite loop)
  if (!orgId && !isOrgSelectRoute(req)) {
    const url = new URL('/org-selection', req.url);
    url.searchParams.set('redirect_url', req.url);
    return NextResponse.redirect(url);
  }

  if (isOrgSelectRoute(req)) return;

  // Superseded 2026-10-08 (D4): no Clerk-role gate for /admin here.
  // Signed-in + active org is all proxy.ts enforces; Trellis RBAC does the rest.
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

---

### 2. `auth()` in Server Components vs Route Handlers

**Server Components:**
```tsx
// app/(authenticated)/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) redirect('/sign-in');
  if (!orgId) redirect('/org-selection');
  // fetch data server-side...
}
```

**Route Handlers (e.g. SSE proxy for chat):**
```typescript
// app/api/chat/stream/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { userId, orgId, orgRole, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: 'No active org' }, { status: 400 });

  const token = await getToken();
  const backendRes = await fetch(`${process.env.FASTAPI_INTERNAL_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Org-Id': orgId,
      'X-User-Id': userId,
      'X-Org-Role': orgRole ?? '',
    },
    body: JSON.stringify(await req.json()),
  });

  // Pipe FastAPI SSE stream directly to browser
  return new Response(backendRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

---

### 3. Server API Client Factory (BFF pattern)

```typescript
// lib/api/server-client.ts
import { auth } from '@clerk/nextjs/server';
import createClient from 'openapi-fetch';
import type { paths } from '@/types/fastapi'; // generated by openapi-typescript

export async function createServerApiClient() {
  const { userId, orgId, orgRole, getToken } = await auth();
  if (!userId || !orgId) throw new Error('Auth + active org required');

  const token = await getToken();
  return createClient<paths>({
    baseUrl: process.env.FASTAPI_INTERNAL_URL ?? 'http://127.0.0.1:8000',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Org-Id': orgId,
      'X-User-Id': userId,
      ...(orgRole ? { 'X-Org-Role': orgRole } : {}),
    },
  });
}
```

---

### 4. Org Selection Page

`/org-selection` must be outside `(authenticated)` layout to avoid circular redirects:

```tsx
// app/org-selection/page.tsx
import { OrganizationList } from '@clerk/nextjs';

export default async function OrgSelectionPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  const destination = redirect_url || '/dashboard';
  return (
    <div className="flex min-h-screen items-center justify-center">
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl={destination}
        afterCreateOrganizationUrl={destination}
      />
    </div>
  );
}
```

---

### 5. Breaking Changes: v4 ? v6

| Area | v4/v5 | v6+ |
|---|---|---|
| Middleware fn | `authMiddleware()` | `clerkMiddleware()` only (`authMiddleware` removed) |
| Default posture | Block-by-default | Public-by-default |
| `auth()` | Synchronous | **`await auth()`** everywhere |
| Role/perm check | Manual `orgRole` inspection | `auth.protect((has) => has({ role/permission }))` |
| Server imports | `@clerk/nextjs` | **`@clerk/nextjs/server`** for all server-side helpers |
| `params`/`searchParams` | Sync objects | **Promises** in Next.js 15+ — must `await` them |

