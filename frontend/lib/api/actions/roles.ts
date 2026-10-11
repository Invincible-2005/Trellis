'use server';
// Role changes from the admin console's dialogs (trellis/12 D18).
// Expected failures come back as { ok: false, message } for a toast: Next.js hides
// the message of a thrown error in production. Redirect codes still redirect.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import type { components } from '../v1';

type Role = components['schemas']['RoleResponse'];
export type CreateRoleInput = components['schemas']['CreateRoleRequest'];
export type UpdateRoleInput = components['schemas']['UpdateRoleRequest'];

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Create a role under the user's own org-level role or a role below it.
 *
 *   const result = await createRole({ name, parent_role_id, permissions });
 *   if (!result.ok) toast.error(result.message);
 */
export async function createRole(input: CreateRoleInput): Promise<ActionResult<Role>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const role = await unwrap(api.POST('/api/v1/admin/roles', { body: input }));
    revalidatePath('/admin/roles');
    return { ok: true, data: role };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Rename, move or change the permissions of a role below the user's own.
 * Leave a field out to keep it unchanged; `permissions` is the full new list.
 */
export async function updateRole(roleId: string, input: UpdateRoleInput): Promise<ActionResult<Role>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const role = await unwrap(
      api.PATCH('/api/v1/admin/roles/{role_id}', { params: { path: { role_id: roleId } }, body: input }),
    );
    revalidatePath('/admin/roles');
    return { ok: true, data: role };
  } catch (err) {
    return toFailure(err);
  }
}

/** Delete a role nobody uses. The backend refuses while sub-roles, members, invitations or documents use it. */
export async function deleteRole(roleId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(api.DELETE('/api/v1/admin/roles/{role_id}', { params: { path: { role_id: roleId } } }));
    revalidatePath('/admin/roles');
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

function toFailure(err: unknown): { ok: false; message: string } {
  if (err instanceof ApiError) return { ok: false, message: err.message };
  throw err; // redirect() from unwrap, or a real bug
}
