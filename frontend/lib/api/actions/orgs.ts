'use server';
// Org profile changes from the /organization page (trellis/12 D18, D35).
// Expected failures come back as { ok: false, message } for a toast: Next.js hides
// the message of a thrown error in production. Redirect codes still redirect.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import type { components } from '../v1';

type OrgProfile = components['schemas']['OrgProfileResponse'];

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Save the org description (root Admin role only; up to 1,000 characters; empty clears it).
 *
 *   const result = await updateOrgDescription(text);
 *   if (!result.ok) toast.error(result.message);   // e.g. "Only the organization's Admin can edit its description."
 */
export async function updateOrgDescription(description: string): Promise<ActionResult<OrgProfile>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const org = await unwrap(api.PATCH('/api/v1/orgs/current', { body: { description } }));
    revalidatePath('/organization');
    return { ok: true, data: org };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, message: err.message };
    throw err; // redirect() from unwrap, or a real bug
  }
}
