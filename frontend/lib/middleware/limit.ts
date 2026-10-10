// Per-action rate limits (trellis/12 D27). proxy.ts can't tell one Server Action
// from another (they all POST to the page URL), so each action checks its own tier.
import 'server-only';
import { request } from '@arcjet/next';
import { auth } from '@clerk/nextjs/server';
import { tiers, type ActionTier } from './arcjet';

const MESSAGES: Record<ActionTier, string> = {
  write: "You're saving changes too quickly. Wait a moment and try again.",
  heavyRead: "You're sending messages too quickly. Wait a minute and try again.",
  heavyWrite: 'Too many uploads or invites for now. Try again in a few minutes.',
};

/**
 * Put this first in a Server Action. Returns null when allowed, or a failure
 * ready for the toast (D18).
 *
 *   const blocked = await limit('heavyWrite');
 *   if (blocked) return blocked;
 *
 * Route handlers (the chat stream) turn a failure into `apiError(429, 'rate_limited', message)`.
 */
export async function limit(tier: ActionTier): Promise<{ ok: false; message: string } | null> {
  const client = tiers?.[tier];
  const { userId } = await auth();
  // Arcjet off, or signed out (the backend rejects that call anyway).
  if (!client || !userId) return null;

  const decision = await client.protect(await request(), { userId });
  return decision.isDenied() ? { ok: false, message: MESSAGES[tier] } : null;
}
