'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import type { UpdateRoleInput } from '@/lib/api/actions/roles';
import type { Permission, Role } from '@/lib/api/queries/roles';
import { zCreateRoleRequest } from '@/lib/api/schemas/roles';
import {
  ALL_PERMISSIONS,
  RoleFormFields,
  type RoleFormOutput,
  type RoleFormValues,
} from './role-form-fields';
import { descendantIds } from './use-role-changes';

interface EditRoleDialogProps {
  /** A role with manageable: true (never the protected Admin role). */
  role: Role;
  roles: Role[];
  /** Show the change at once; the server's answer comes later (use-role-changes.ts). */
  onSave: (input: UpdateRoleInput) => void;
  onDelete: () => void;
  onClose: () => void;
  callerOrgRoleId?: string | null;
  callerOrgPermissions?: string[];
}

export function EditRoleDialog({
  role,
  roles,
  onSave,
  onDelete,
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

  const handleSave = form.handleSubmit((values) => {
    onSave({
      ...values,
      name: values.name.trim(),
      description: values.description?.trim() ?? '', // empty clears it
    });
    onClose();
  });

  // A role still in use comes back with the server's reason as a toast (use-role-changes.ts).
  const handleDelete = () => {
    onDelete();
    onClose();
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
              >
                Back
              </Button>
              <Button type="button" variant="destructive" onClick={handleDelete}>
                Delete Role
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
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={allowedParents.length === 0}>
                  Save Changes
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
