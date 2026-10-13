'use client';

// Fields shared by the Create role and Edit role dialogs: name, description,
// parent role and permissions. The rules (name length, a parent must be picked)
// come from the generated zCreateRoleRequest both dialogs pass to useForm: Edit
// always sends every field, so it must meet the same rules (trellis/12 D49).
import React from 'react';
import { Controller, type Control } from 'react-hook-form';
import type { z } from 'zod';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Permission, Role } from '@/lib/api/queries/roles';
import type { zCreateRoleRequest } from '@/lib/api/schemas/roles';

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

/** What the form holds: the backend's CreateRoleRequest, before and after zod checks it. */
export type RoleFormValues = z.input<typeof zCreateRoleRequest>;
export type RoleFormOutput = z.output<typeof zCreateRoleRequest>;

interface RoleFormFieldsProps {
  control: Control<RoleFormValues, unknown, RoleFormOutput>;
  /** Roles this one may sit under: your own org role or roles below it. */
  parentOptions: Role[];
  callerOrgRoleId?: string | null;
  /** Permissions shown as checkboxes. */
  permissionOptions: Permission[];
}

export function RoleFormFields({
  control,
  parentOptions,
  callerOrgRoleId,
  permissionOptions,
}: RoleFormFieldsProps) {
  return (
    <div className="space-y-3 py-1">
      <Controller
        name="name"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="role-name">Role Name</FieldLabel>
            <Input
              {...field}
              id="role-name"
              placeholder="e.g. Lead Engineer, Operations Analyst"
              maxLength={50}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        name="description"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="role-description">Description (Optional)</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ''}
              id="role-description"
              placeholder="Role responsibilities and scope"
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        name="parent_role_id"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="parent-role">Parent Role</FieldLabel>
            {parentOptions.length === 0 ? (
              <p className="text-xs text-destructive">
                No eligible parent roles available for your permission level.
              </p>
            ) : (
              <select
                {...field}
                id="parent-role"
                aria-invalid={fieldState.invalid}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {parentOptions.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name} (Level {parent.depth})
                    {parent.id === callerOrgRoleId ? ' — Your Role' : ''}
                  </option>
                ))}
              </select>
            )}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        name="permissions"
        control={control}
        render={({ field, fieldState }) => {
          const selected = field.value ?? [];
          const toggle = (perm: Permission) =>
            field.onChange(
              selected.includes(perm) ? selected.filter((p) => p !== perm) : [...selected, perm]
            );
          return (
            <Field data-invalid={fieldState.invalid} className="pt-1">
              <FieldLabel>Permissions</FieldLabel>
              <FieldDescription className="text-xs">
                You can only add permissions that your own role holds.
              </FieldDescription>
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
                        checked={selected.includes(perm)}
                        onChange={() => toggle(perm)}
                      />
                      <span className="truncate">{PERMISSION_LABELS[perm]}</span>
                    </label>
                  ))}
                </div>
              )}
              <FieldError errors={[fieldState.error]} />
            </Field>
          );
        }}
      />
    </div>
  );
}
