'use server';
// Adding, re-roling and removing people from Admin → Members (trellis/12 D18, D25, D26, D38).
// Expected failures come back as { ok: false, message } for a toast: Next.js hides
// the message of a thrown error in production. Redirect codes still redirect.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import type { components } from '../v1';

type AddMemberResult = components['schemas']['AddMemberResponse'];
type Member = components['schemas']['MemberResponse'];
export type AddMemberInput = components['schemas']['AddMemberRequest'];

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Add someone by email, with an optional org role (pick from roles where `assignable`).
 * `data.status` is "added" (already used Trellis, now in the org) or "invited"
 * (Clerk emailed them; they get the role on their first visit).
 *
 *   const result = await addMember({ email, role_id });
 *   if (!result.ok) toast.error(result.message);
 *   else toast.success(result.data.status === 'added' ? 'Added' : 'Invitation sent');
 */
export async function addMember(input: AddMemberInput): Promise<ActionResult<AddMemberResult>> {
  const blocked = await limit('heavyWrite');
  if (blocked) return blocked;
  try {
    const result = await unwrap(api.POST('/api/v1/admin/members', { body: input }));
    revalidatePath('/admin/members');
    return { ok: true, data: result };
  } catch (err) {
    return toFailure(err);
  }
}

/** Cancel a pending invite; its email link stops working. Only for invites with no role or a role below yours. */
export async function cancelInvitation(invitationId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(
      api.DELETE('/api/v1/admin/invitations/{invitation_id}', {
        params: { path: { invitation_id: invitationId } },
      }),
    );
    revalidatePath('/admin/members');
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Give a member another org role, or none (`roleId: null`). Only for rows with
 * `manageable: true`; pick from roles where `assignable` (trellis/12 D38).
 */
export async function updateMemberRole(
  userId: string,
  roleId: string | null,
): Promise<ActionResult<Member>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const member = await unwrap(
      api.PATCH('/api/v1/admin/members/{user_id}', {
        params: { path: { user_id: userId } },
        body: { role_id: roleId },
      }),
    );
    revalidatePath('/admin/members');
    return { ok: true, data: member };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Remove someone from the org: out of Clerk, off every team, out of the org.
 * Their tasks, strikes and documents stay (trellis/12 D38).
 */
export async function removeMember(userId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(
      api.DELETE('/api/v1/admin/members/{user_id}', { params: { path: { user_id: userId } } }),
    );
    revalidatePath('/admin/members');
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

function toFailure(err: unknown): { ok: false; message: string } {
  if (err instanceof ApiError) return { ok: false, message: err.message };
  throw err; // redirect() from unwrap, or a real bug
}
