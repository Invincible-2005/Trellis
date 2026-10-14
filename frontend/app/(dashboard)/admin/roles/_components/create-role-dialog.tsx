'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CreateRoleInput } from '@/lib/api/actions/roles';
import type { Role } from '@/lib/api/queries/roles';
import { zCreateRoleRequest } from '@/lib/api/schemas/roles';
import {
  ALL_PERMISSIONS,
  RoleFormFields,
  type RoleFormOutput,
  type RoleFormValues,
} from './role-form-fields';

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  callerOrgRoleId?: string | null;
  callerOrgPermissions?: string[];
  /** Adds the role to the tree at once; the server's answer comes later (use-role-changes.ts). */
  onCreate: (input: CreateRoleInput) => void;
}

export function CreateRoleDialog({
  open,
  onOpenChange,
  roles,
  callerOrgRoleId,
  callerOrgPermissions = [],
  onCreate,
}: CreateRoleDialogProps) {
  // Parent picker: own org role + roles with manageable: true
  const allowedParents = roles.filter(
    (r) => r.id === callerOrgRoleId || r.manageable
  );
  // Permission checkboxes: only what the caller holds (D9)
  const grantable = ALL_PERMISSIONS.filter((p) => callerOrgPermissions.includes(p));

  // The first allowed parent (the caller's own role) starts selected.
  const emptyForm: RoleFormValues = {
    name: '',
    description: '',
    parent_role_id: allowedParents[0]?.id ?? '',
    permissions: [],
  };

  // Checks come from the backend's own rules (generated zod schema, trellis/12 D49).
  const form = useForm<RoleFormValues, unknown, RoleFormOutput>({
    resolver: zodResolver(zCreateRoleRequest),
    defaultValues: emptyForm,
  });

  const onSubmit = form.handleSubmit((values) => {
    onCreate({
      ...values,
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
    });
    form.reset(emptyForm);
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create New Role
            </DialogTitle>
            <DialogDescription>
              New roles must sit under your role or a role below yours in the hierarchy.
            </DialogDescription>
          </DialogHeader>

          <RoleFormFields
            control={form.control}
            parentOptions={allowedParents}
            callerOrgRoleId={callerOrgRoleId}
            permissionOptions={grantable}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={allowedParents.length === 0}>
              Create Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
