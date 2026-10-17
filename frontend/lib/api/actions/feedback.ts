'use server';
// Giving strikes and commendations, appealing and reviewing (trellis/12 D54, D55, D6, D46).
// Expected failures come back as { ok: false, message } for a toast: Next.js hides
// the message of a thrown error in production. Redirect codes still redirect.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import {
  firstError,
  zAppealStrikeRequest,
  zCreateCommendationRequest,
  zCreateStrikeRequest,
  zReviewAppealRequest,
} from '../schemas/feedback';
import type { components } from '../v1';
import type { ActionResult } from './roles';

type Strike = components['schemas']['StrikeResponse'];
type Commendation = components['schemas']['CommendationResponse'];
type StrikePreview = components['schemas']['StrikePreviewResponse'];
export type GiveStrikeInput = components['schemas']['CreateStrikeRequest'];
export type GiveCommendationInput = components['schemas']['CreateCommendationRequest'];
export type AppealDecision = components['schemas']['ReviewAppealRequest']['decision'];

/**
 * Step 1 of a strike: checks every rule and the policy (D46), saves nothing.
 * Show `data.policy` (verdict "supported" | "not_covered" | "unchecked", explanation,
 * sources), `data.active_strikes` and `data.will_escalate`, then Confirm → giveStrike(same input).
 * The policy check is an AI call, so it shares chat's limit (5 a minute).
 *
 *   const result = await checkStrike({ team_id, given_to_user_id, reason });
 *   if (!result.ok) toast.error(result.message);
 */
export async function checkStrike(input: GiveStrikeInput): Promise<ActionResult<StrikePreview>> {
  const blocked = await limit('heavyRead');
  if (blocked) return blocked;
  const parsed = zCreateStrikeRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    return { ok: true, data: await unwrap(api.POST('/api/v1/feedback/strikes/check', { body: parsed.data })) };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Step 2 of a strike, after Confirm. Send exactly what was checked: the backend keeps
 * that check's policy result (10 minutes) instead of asking the AI again.
 * `data.escalated` is true when this was their 3rd active strike in the team.
 */
export async function giveStrike(input: GiveStrikeInput): Promise<ActionResult<Strike>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zCreateStrikeRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const strike = await unwrap(api.POST('/api/v1/feedback/strikes', { body: parsed.data }));
    revalidatePath('/feedback');
    revalidatePath('/dashboard'); // team cards show active strike counts
    return { ok: true, data: strike };
  } catch (err) {
    return toFailure(err);
  }
}

/** Commend someone ranked below you in that team (D5). No preview step. */
export async function giveCommendation(input: GiveCommendationInput): Promise<ActionResult<Commendation>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zCreateCommendationRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const commendation = await unwrap(api.POST('/api/v1/feedback/commendations', { body: parsed.data }));
    revalidatePath('/feedback');
    return { ok: true, data: commendation };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Appeal a strike you received, once, with a note (dashboard; only when `can_appeal`).
 * Refused with a message if it was already appealed or reviewed.
 */
export async function appealStrike(strikeId: string, appealNotes: string): Promise<ActionResult<Strike>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zAppealStrikeRequest.safeParse({ appeal_notes: appealNotes });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const strike = await unwrap(
      api.POST('/api/v1/feedback/strikes/{strike_id}/appeal', {
        params: { path: { strike_id: strikeId } },
        body: parsed.data,
      }),
    );
    revalidatePath('/dashboard');
    revalidatePath('/feedback'); // the giver's "given" list and reviewers' appeals
    return { ok: true, data: strike };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Decide an appeal from the "Appeals to review" tab: 'uphold' (the strike stays)
 * or 'dismiss' (it stops counting). Refused if you gave or received it, or it's already decided.
 */
export async function decideAppeal(strikeId: string, decision: AppealDecision): Promise<ActionResult<Strike>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zReviewAppealRequest.safeParse({ decision });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const strike = await unwrap(
      api.POST('/api/v1/feedback/appeals/{strike_id}/decision', {
        params: { path: { strike_id: strikeId } },
        body: parsed.data,
      }),
    );
    revalidatePath('/feedback');
    return { ok: true, data: strike };
  } catch (err) {
    return toFailure(err);
  }
}

function toFailure(err: unknown): { ok: false; message: string } {
  if (err instanceof ApiError) return { ok: false, message: err.message };
  throw err; // redirect() from unwrap, or a real bug
}
