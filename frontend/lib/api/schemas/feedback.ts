// Feedback forms (/feedback: Give a strike or commendation; dashboard: Appeal; Review an appeal).
// Generated from the backend's rules (zod.gen.ts, `pnpm api:generate`); never retype them here.
// Frontend-only adjustments go here as `.extend()` on these schemas (trellis/12 D49).
import { z } from 'zod';
import './shared';
import {
  zAppealStrikeRequest,
  zCreateCommendationRequest,
  zCreateStrikeRequest,
  zReviewAppealRequest,
} from './zod.gen';

export { firstError } from './shared';
export { zAppealStrikeRequest, zCreateCommendationRequest, zCreateStrikeRequest, zReviewAppealRequest };

/**
 * Give form: one form for both kinds. `kind` is frontend-only (it picks the action:
 * strike → checkStrike then giveStrike, commendation → giveCommendation).
 * The reason is trimmed first; strike and commendation share the same backend rules.
 */
export const zGiveFeedbackForm = zCreateStrikeRequest.extend({
  kind: z.enum(['strike', 'commendation']),
  reason: z.string().trim().pipe(zCreateStrikeRequest.shape.reason),
});

/** Appeal dialog (dashboard): the note is trimmed first. */
export const zAppealForm = zAppealStrikeRequest.extend({
  appeal_notes: z.string().trim().pipe(zAppealStrikeRequest.shape.appeal_notes),
});

// Uphold / Dismiss buttons: no form; call decideAppeal(strikeId, decision) directly
// (the Server Action checks it with zReviewAppealRequest).
