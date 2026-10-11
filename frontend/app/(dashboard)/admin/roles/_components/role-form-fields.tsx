'use client';

// Fields shared by the Create role and Edit role dialogs: name, description,
// parent role and permissions.
import React from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Permission, Role } from '@/lib/api/queries/roles';

export const PERMISSION_LABELS: Record<Permission, string> = {
  create_role: 'Create Role',
  create_team: 'Create Team',
  add_member: 'Add Member',
  upload_document: 'Upload Document',
  assign_task: 'Assign Task',
  give_strike: 'Give Strike',
  view_aggregate: 'View Aggregates',
  review_strike: 'Review Strikes',
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

export interface RoleFormValues {
  name: string;
  description: string;
  parentRoleId: string;
  permissions: Permission[];
}

/** The message to show, or null when the form can be sent. */
export function validateRoleForm(values: RoleFormValues): string | null {
  if (values.name.trim().length < 2) return 'Role name must be at least 2 characters.';
  if (!values.parentRoleId) return 'Please select a parent role.';
  return null;
}

interface RoleFormFieldsProps {
  values: RoleFormValues;
  onChange: (values: RoleFormValues) => void;
  /** Roles this one may sit under: your own org role or roles below it. */
  parentOptions: Role[];
  callerOrgRoleId?: string | null;
  /** Permissions shown as checkboxes. */
  permissionOptions: Permission[];
}

export function RoleFormFields({
  values,
  onChange,
  parentOptions,
  callerOrgRoleId,
  permissionOptions,
}: RoleFormFieldsProps) {
  const set = (patch: Partial<RoleFormValues>) => onChange({ ...values, ...patch });

  const togglePermission = (perm: Permission) =>
    set({
      permissions: values.permissions.includes(perm)
        ? values.permissions.filter((p) => p !== perm)
        : [...values.permissions, perm],
    });

  return (
    <div className="space-y-3 py-1">
      {/* Role Name */}
      <div className="space-y-1.5">
        <Label htmlFor="role-name">Role Name</Label>
        <Input
          id="role-name"
          placeholder="e.g. Lead Engineer, Operations Analyst"
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={50}
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="role-description">Description (Optional)</Label>
        <Input
          id="role-description"
          placeholder="Role responsibilities and scope"
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>

      {/* Parent Role Picker */}
      <div className="space-y-1.5">
        <Label htmlFor="parent-role">Parent Role</Label>
        {parentOptions.length === 0 ? (
          <p className="text-xs text-destructive">
            No eligible parent roles available for your permission level.
          </p>
        ) : (
          <select
            id="parent-role"
            value={values.parentRoleId}
            onChange={(e) => set({ parentRoleId: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            required
          >
            {parentOptions.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name} (Level {parent.depth})
                {parent.id === callerOrgRoleId ? ' — Your Role' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Permission Checkboxes */}
      <div className="space-y-2 pt-1">
        <Label>Permissions</Label>
        <p className="text-xs text-muted-foreground">
          You can only add permissions that your own role holds.
        </p>
        {permissionOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No grantable permissions available.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto rounded-md border p-2.5">
            {permissionOptions.map((perm) => (
              <label
                key={perm}
                className="flex items-center gap-2 text-xs cursor-pointer select-none rounded p-1 hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                  checked={values.permissions.includes(perm)}
                  onChange={() => togglePermission(perm)}
                />
                <span className="truncate">{PERMISSION_LABELS[perm]}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
