// BFF stream proxy for one chat message (trellis/12 D2, D27; frontend-scaffold 03 §3).
// The browser POSTs { message } (or { resume: "confirm" | "cancel" } for a Confirm
// card, D22) here; we forward it to FastAPI with the user's Clerk token (added by
// `api`) and pipe the SSE answer back unchanged.
// Errors before the stream opens keep FastAPI's { detail: { code, message } } body.
import 'server-only';
import type { NextRequest } from 'next/server';
import { api } from '@/lib/api/client';
import { limit } from '@/lib/middleware/limit';
import { apiError } from '@/lib/middleware/gate';
import { firstError, zSendMessageRequest } from '@/lib/api/schemas/chat';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/chat/sessions/[sessionId]/message'>) {
  // Each message costs 2–4 AI calls: 5 per minute per user (D27)
  const blocked = await limit('heavyRead');
  if (blocked) return apiError(429, 'rate_limited', blocked.message);

  const { sessionId } = await ctx.params;
  // Same generated schema as the backend's SendMessageRequest (trellis/12 D49)
  const parsed = zSendMessageRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request', firstError(parsed.error));
  const { message, resume } = parsed.data;
  if ((message == null) === (resume == null)) {
    return apiError(400, 'bad_request', 'Send { "message": "..." } or { "resume": "confirm" | "cancel" }.');
  }

  let result;
  try {
    result = await api.POST('/api/v1/chat/sessions/{session_id}/message', {
      params: { path: { session_id: sessionId } },
      body: message != null ? { message } : { resume },
      parseAs: 'stream',
      signal: req.signal, // the user leaves the page → FastAPI stops answering too
    });
  } catch {
    return apiError(503, 'backend_unavailable', 'The server is unreachable. Please try again.');
  }

  const { response, error } = result;
  if (!response.ok || !response.body) {
    // e.g. 404 chat_not_found, 400 message_too_long, 409 chat_busy / nothing_to_confirm, 422 empty message
    return Response.json(error ?? { detail: { code: 'unexpected', message: 'Something went wrong. Please try again.' } }, {
      status: response.status || 502,
    });
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
