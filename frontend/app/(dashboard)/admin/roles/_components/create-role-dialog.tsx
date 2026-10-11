'use client';

import React, { useState } from 'react';
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
import {
  ALL_PERMISSIONS,
  RoleFormFields,
  validateRoleForm,
  type RoleFormValues,
} from './role-form-fields';

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  callerOrgRoleId?: string | null;
  callerOrgPermissions?: string[];
}

const EMPTY_FORM: RoleFormValues = {
  name: '',
  description: '',
  parentRoleId: '',
  permissions: [],
};

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

  const [form, setForm] = useState<RoleFormValues>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Until the user picks a parent, the first allowed one (their own role) is selected.
  const values = { ...form, parentRoleId: form.parentRoleId || allowedParents[0]?.id || '' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateRoleForm(values);
    if (error) {
      toast.error(error);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createRole({
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        parent_role_id: values.parentRoleId,
        permissions: values.permissions,
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(`Role "${result.data.name}" created successfully.`);
      setForm(EMPTY_FORM);
      onOpenChange(false);
    } catch {
      toast.error('An unexpected error occurred while creating the role.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit} className="space-y-4">
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
            values={values}
            onChange={setForm}
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
