import 'server-only';
import createClient, { type Middleware } from 'openapi-fetch';
import { auth } from '@clerk/nextjs/server';
import type { paths } from './v1';

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (request.headers.has('Authorization')) return request;

    try {
      const { getToken } = await auth();
      const token = await getToken();
      if (token) {
        // Invariant D8: Only Bearer token. No X-Org-Id or X-User-Id headers.
        request.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch {
      // No active request context (e.g. build-time or static routes)
    }

    return request;
  },
};

export const api = createClient<paths>({
  baseUrl: process.env.FASTAPI_INTERNAL_URL ?? 'http://127.0.0.1:8000',
});

api.use(authMiddleware);

// Optional unauthenticated client for public endpoints
export const publicApi = createClient<paths>({
  baseUrl: process.env.FASTAPI_INTERNAL_URL ?? 'http://127.0.0.1:8000',
});