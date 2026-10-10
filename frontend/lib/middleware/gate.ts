// The Arcjet front gate, run by proxy.ts on every request (trellis/12 D27).
// No 'server-only' import here: proxy.ts can't load it.
import { NextResponse, type NextRequest } from 'next/server';
import { anyone, signedIn } from './arcjet';

/** Same body as FastAPI errors (trellis/12 D16). */
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ detail: { code, message } }, { status });
}

/**
 * Attacks and bots for everyone, plus the read limit for signed-in users.
 * Returns the response to send back when blocked, or null to carry on.
 */
export async function gate(req: NextRequest, userId: string | null): Promise<NextResponse | null> {
  const decision = userId ? await signedIn?.protect(req, { userId }) : await anyone?.protect(req);
  if (!decision?.isDenied()) return null;

  return decision.reason.isRateLimit()
    ? deny(req, 429, 'rate_limited', 'Too many requests. Wait a minute and try again.')
    : deny(req, 403, 'blocked', 'This request was blocked.');
}

// /api/* callers read JSON; a page load just shows the text.
function deny(req: NextRequest, status: number, code: string, message: string) {
  if (req.nextUrl.pathname.startsWith('/api')) return apiError(status, code, message);
  return new NextResponse(message, { status });
}
