'use client';

// Every change on Admin → Roles, shown instantly (trellis/12 D50). Same shape as
// admin/members/_components/use-member-changes.ts: save the list, change it at once,
// call the Server Action; a refusal (e.g. deleting a role still in use) puts the saved
// list back with a toast. On success the server's fresh copy (revalidatePath) replaces
// ours, which also corrects what only the server knows (manageable, assignable).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createRole,
  deleteRole,
  updateRole,
  type CreateRoleInput,
  type UpdateRoleInput,
} from '@/lib/api/actions/roles';
import type { Role } from '@/lib/api/queries/roles';
import { fromAction } from '@/lib/query/action';

/** Cache key for the role list (filled by useServerData in RoleFlowTree). */
export const ROLES_KEY = ['roles'];

/** A role in the tree. `pending` = only in the browser so far (temporary id, not clickable). */
export type RoleRow = Role & { pending?: boolean };

/** Ids of every role below `roleId` (its sub-roles, their sub-roles, ...). */
export function descendantIds(roleId: string, roles: Role[]): Set<string> {
  const found = new Set<string>();
  const queue = [roleId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const r of roles) {
      if (r.parent_role_id === current && !found.has(r.id)) {
        found.add(r.id);
        queue.push(r.id);
      }
    }
  }
  return found;
}

/** The list with `roleId` edited. A move takes its sub-roles along, one level per step. */
function applyEdit(list: RoleRow[], roleId: string, input: UpdateRoleInput): RoleRow[] {
  const role = list.find((r) => r.id === roleId);
  if (!role) return list;
  const parentId = input.parent_role_id ?? role.parent_role_id;
  const parent = list.find((r) => r.id === parentId);
  const depth = parent ? parent.depth + 1 : role.depth;
  const shift = depth - role.depth;
  const below = descendantIds(roleId, list);

  return list.map((r) => {
    if (r.id === roleId) {
      return {
        ...r,
        name: input.name ?? r.name,
        description: input.description !== undefined ? input.description || null : r.description,
        permissions: input.permissions ?? r.permissions,
        parent_role_id: parentId,
        depth,
      };
    }
    return below.has(r.id) ? { ...r, depth: r.depth + shift } : r;
  });
}

export function useRoleChanges() {
  const queryClient = useQueryClient();

  /** The list as it was before a change, to put back if the server refuses. */
  const save = () => ({ roles: queryClient.getQueryData<RoleRow[]>(ROLES_KEY) });
  const updateRoles = (change: (list: RoleRow[]) => RoleRow[]) =>
    queryClient.setQueryData<RoleRow[]>(ROLES_KEY, (list) => change(list ?? []));

  // Same for every change: put the old list back and say why.
  const undo = (error: Error, _variables: unknown, saved: { roles?: RoleRow[] } | undefined) => {
    if (saved) queryClient.setQueryData(ROLES_KEY, saved.roles);
    toast.error(error.message);
  };

  const create = useMutation({
    mutationFn: (input: CreateRoleInput) => fromAction(createRole(input)),
    // Show a greyed box under its parent with a temporary id until the server answers.
    onMutate: (input) => {
      const saved = save();
      const tempId = crypto.randomUUID();
      updateRoles((list) => {
        const parent = list.find((r) => r.id === input.parent_role_id);
        const placeholder: RoleRow = {
          id: tempId,
          name: input.name,
          description: input.description ?? null,
          parent_role_id: input.parent_role_id ?? null,
          depth: parent ? parent.depth + 1 : 0,
          permissions: input.permissions ?? [],
          is_system: false,
          manageable: false,
          assignable: false,
          created_at: new Date().toISOString(),
          pending: true,
        };
        return [...list, placeholder];
      });
      return { ...saved, tempId };
    },
    onError: undo,
    onSuccess: (created, _input, sent) => {
      updateRoles((list) => list.map((r) => (r.id === sent?.tempId ? created : r)));
      toast.success(`Role "${created.name}" created successfully.`);
    },
  });

  const edit = useMutation({
    mutationFn: ({ role, input }: { role: Role; input: UpdateRoleInput }) =>
      fromAction(updateRole(role.id, input)),
    onMutate: ({ role, input }) => {
      const saved = save();
      updateRoles((list) => applyEdit(list, role.id, input));
      return saved;
    },
    onError: undo,
    onSuccess: (updated) => {
      updateRoles((list) => list.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`Role "${updated.name}" updated.`);
    },
  });

  const remove = useMutation({
    mutationFn: (role: Role) => fromAction(deleteRole(role.id)),
    onMutate: (role) => {
      const saved = save();
      updateRoles((list) => list.filter((r) => r.id !== role.id));
      return saved;
    },
    onError: undo, // e.g. "Move or delete the roles under this one first."
    onSuccess: (_result, role) => {
      toast.success(`Role "${role.name}" deleted.`);
    },
  });

  return { create, edit, remove };
}
