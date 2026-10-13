'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
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
import { createRole } from '@/lib/api/actions/roles';
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
}

export function CreateRoleDialog({
  open,
  onOpenChange,
  roles,
  callerOrgRoleId,
  callerOrgPermissions = [],
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
  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await createRole({
        ...values,
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(`Role "${result.data.name}" created successfully.`);
      form.reset(emptyForm);
      onOpenChange(false);
    } catch {
      toast.error('An unexpected error occurred while creating the role.');
    }
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
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || allowedParents.length === 0}>
              {isSubmitting ? 'Creating...' : 'Create Role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
