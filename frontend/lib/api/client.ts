// The single typed client for calling FastAPI from the Next.js server (BFF).
// Types come from ./v1.d.ts — regenerate with `pnpm api:generate` after the backend
// re-exports backend/openapi.json.
import 'server-only';
import createClient, { type Middleware } from 'openapi-fetch';
import { unstable_rethrow } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import type { paths } from './v1';

// Adds the signed-in user's Clerk session token to every request, per request.
// ONLY the token: the user and active org are inside it, and FastAPI ignores
// X-User-* / X-Org-* headers. Never set auth on client defaults (shared across requests).
const clerkToken: Middleware = {
  async onRequest({ request }) {
    if (request.headers.has('Authorization')) return request;
    try {
      const { getToken } = await auth();
      const token = await getToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
    } catch (err) {
      // At build time auth() throws Next's "this page is per-request" signal: let it through,
      // or the page is wrongly built as static.
      unstable_rethrow(err);
      // Any other failure: call goes out unauthenticated → 401.
    }
    return request;
  },
};

export const api = createClient<paths>({
  baseUrl: process.env.FASTAPI_INTERNAL_URL ?? 'http://127.0.0.1:8000',
});

api.use(clerkToken);
