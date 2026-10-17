"use client";

import React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import type { Member } from "@/lib/api/queries/members";
import type { Role } from "@/lib/api/queries/roles";
import { zChangeMemberRoleForm } from "@/lib/api/schemas/members";

interface ChangeRoleDialogProps {
  /** A row with manageable: true (trellis/12 D38). */
  member: Member;
  assignableRoles: Role[];
  /** Shows the new role at once; the server's answer comes later (use-member-changes.ts). */
  onSave: (roleId: string | null, roleName: string | null) => void;
  onClose: () => void;
}

export function ChangeRoleDialog({ member, assignableRoles, onSave, onClose }: ChangeRoleDialogProps) {
  const currentRoleId = member.org_role_id ?? "";
  // Checks come from the backend's own rules (generated zod schema, trellis/12 D49).
  const form = useForm({
    resolver: zodResolver(zChangeMemberRoleForm),
    defaultValues: { role_id: currentRoleId },
  });
  const roleId = useWatch({ control: form.control, name: "role_id" }) ?? "";

  // Their current role may hold a permission you lack, so it isn't always in the
  // assignable list: keep it visible as "(current)" so nothing changes by accident.
  const currentIsListed = !member.org_role_id || assignableRoles.some((r) => r.id === currentRoleId);
  const selectedRole = assignableRoles.find((r) => r.id === roleId);

  // `values.role_id` is already checked: "No role" is null.
  const handleSave = form.handleSubmit((values) => {
    const newRole = assignableRoles.find((r) => r.id === values.role_id);
    onSave(values.role_id, newRole?.name ?? null);
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Change Role
            </DialogTitle>
            <DialogDescription>
              Change the organization-wide role of{" "}
              <strong className="text-foreground">{member.name || member.email}</strong>. Their team
              roles stay as they are.
            </DialogDescription>
          </DialogHeader>

          <Controller
            name="role_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-1.5">
                <FieldLabel htmlFor="member-new-role">Org Role</FieldLabel>
                <select
                  {...field}
                  value={field.value ?? ""}
                  id="member-new-role"
                  aria-invalid={fieldState.invalid}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">No role{!member.org_role_id ? " (current)" : ""}</option>
                  {!currentIsListed && (
                    <option value={currentRoleId}>{member.org_role_name} (current)</option>
                  )}
                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} (Level {role.depth}){role.id === currentRoleId ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <FieldDescription className="text-[11px]">
                  You can give roles below your own, with permissions you hold.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {/* Permission preview for the chosen role */}
          {selectedRole && selectedRole.permissions && selectedRole.permissions.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-2.5 space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground block">
                Permissions granted by {selectedRole.name}:
              </span>
              <div className="flex flex-wrap gap-1">
                {selectedRole.permissions.map((perm) => (
                  <span
                    key={perm}
                    className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-secondary-foreground"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={roleId === currentRoleId}>
              Save Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
