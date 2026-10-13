'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { FileText, Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { deleteRole, updateRole } from '@/lib/api/actions/roles';
import type { Permission, Role } from '@/lib/api/queries/roles';
import { zCreateRoleRequest } from '@/lib/api/schemas/roles';
import {
  ALL_PERMISSIONS,
  RoleFormFields,
  type RoleFormOutput,
  type RoleFormValues,
} from './role-form-fields';

interface EditRoleDialogProps {
  /** A role with manageable: true (never the protected Admin role). */
  role: Role;
  roles: Role[];
  onClose: () => void;
  callerOrgRoleId?: string | null;
  callerOrgPermissions?: string[];
}

/** Ids of every role below `roleId` (its sub-roles, their sub-roles, ...). */
function descendantIds(roleId: string, roles: Role[]): Set<string> {
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

export function EditRoleDialog({
  role,
  roles,
  onClose,
  callerOrgRoleId,
  callerOrgPermissions = [],
}: EditRoleDialogProps) {
  // Parent picker: own org role + manageable roles, but never the role itself or
  // one of its sub-roles (the backend refuses that with invalid_parent).
  const below = descendantIds(role.id, roles);
  const allowedParents = roles.filter(
    (r) =>
      (r.id === callerOrgRoleId || r.manageable) && r.id !== role.id && !below.has(r.id)
  );

  // Permission checkboxes: the caller's own (may be added) plus the role's current
  // ones (removing is always allowed, D17).
  const currentPermissions = (role.permissions ?? []) as Permission[];
  const permissionOptions = ALL_PERMISSIONS.filter(
    (p) => callerOrgPermissions.includes(p) || currentPermissions.includes(p)
  );

  // Checks come from the backend's own rules (generated zod schema, trellis/12 D49).
  // Edit sends every field, so it uses the same rules as a new role; updateRole
  // re-checks with zUpdateRoleRequest on the server.
  const form = useForm<RoleFormValues, unknown, RoleFormOutput>({
    resolver: zodResolver(zCreateRoleRequest),
    defaultValues: {
      name: role.name,
      description: role.description ?? '',
      parent_role_id: role.parent_role_id ?? '',
      permissions: currentPermissions,
    },
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isSubmitting = form.formState.isSubmitting || isDeleting;

  const handleSave = form.handleSubmit(async (values) => {
    try {
      const result = await updateRole(role.id, {
        ...values,
        name: values.name.trim(),
        description: values.description?.trim() ?? '', // empty clears it
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(`Role "${result.data.name}" updated.`);
      onClose();
    } catch {
      toast.error('An unexpected error occurred while saving the role.');
    }
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteRole(role.id);

      if (!result.ok) {
        // e.g. "Move or delete the roles under this one first."
        toast.error(result.message);
        setConfirmingDelete(false);
        return;
      }

      toast.success(`Role "${role.name}" deleted.`);
      onClose();
    } catch {
      toast.error('An unexpected error occurred while deleting the role.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        {confirmingDelete ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete Role</DialogTitle>
              <DialogDescription>
                Delete <strong className="text-foreground">{role.name}</strong>? This only works
                while no one holds it and no sub-role, invitation or document uses it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingDelete(false)}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Deleting...' : 'Delete Role'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSave} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Edit Role
              </DialogTitle>
              <DialogDescription>
                Moving a role also moves every role under it.
              </DialogDescription>
            </DialogHeader>

            {/* Sharing a document with a role needs org-wide upload_document (D23) */}
            {callerOrgPermissions.includes('upload_document') && (
              <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                <Link href={`/admin/documents?role=${role.id}`}>
                  <FileText className="h-4 w-4" />
                  Add a document for {role.name}
                </Link>
              </Button>
            )}

            <RoleFormFields
              control={form.control}
              parentOptions={allowedParents}
              callerOrgRoleId={callerOrgRoleId}
              permissionOptions={permissionOptions}
            />

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
                disabled={isSubmitting}
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || allowedParents.length === 0}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
