// All Arcjet rules in one place (trellis/12 D27).
// proxy.ts uses gate.ts; Server Actions (and later the chat route) use limit.ts.
// Nothing else imports @arcjet/next directly.
import arcjet, { detectBot, shield, slidingWindow } from '@arcjet/next';

// "DRY_RUN" logs what would be blocked without blocking anything; handy while tuning.
const MODE = 'LIVE';

/** Requests allowed per signed-in user. Starting numbers: tune them from the Arcjet dashboard. */
const LIMITS = {
  read: { max: 120, interval: '1m' }, // page loads and data fetches (checked in proxy.ts)
  write: { max: 20, interval: '1m' }, // form saves: roles, deletes, cancelling invites
  heavyRead: { max: 5, interval: '1m' }, // chat messages: each one is 2-4 Gemini calls
  heavyWrite: { max: 10, interval: '10m' }, // document indexing (embeddings), invites (emails)
} as const;

/** The tiers an action can ask for; `read` is applied to every request by proxy.ts. */
export type ActionTier = Exclude<keyof typeof LIMITS, 'read'>;

// Keyed by the Clerk user ID, so people sharing an office IP don't share a limit.
function perUser(tier: keyof typeof LIMITS) {
  return slidingWindow({ mode: MODE, characteristics: ['userId'], ...LIMITS[tier] });
}

const key = process.env.ARCJET_KEY;

// No ARCJET_KEY (e.g. a fresh clone) → Arcjet is off and every request passes.
const base = key ? arcjet({ key, rules: [] }) : null;

/** Front gate for everyone: known attack patterns, and bots (search engines and link previews allowed). */
export const anyone = base
  ?.withRule(shield({ mode: MODE }))
  .withRule(detectBot({ mode: MODE, allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'] }));

/** Front gate for signed-in users: the same checks plus the read limit, in one Arcjet call. */
export const signedIn = anyone?.withRule(perUser('read'));

/** Per-action limits, used through limit.ts. */
export const tiers = base && {
  write: base.withRule(perUser('write')),
  heavyRead: base.withRule(perUser('heavyRead')),
  heavyWrite: base.withRule(perUser('heavyWrite')),
};
