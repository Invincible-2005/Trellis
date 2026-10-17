"use client";

import React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import type { Role } from "@/lib/api/queries/roles";
import { zInviteMemberForm } from "@/lib/api/schemas/members";
import { useMemberChanges } from "./use-member-changes";

const EMPTY_FORM = { email: "", role_id: "" };

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignableRoles: Role[];
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  assignableRoles,
}: InviteMemberDialogProps) {

  // Checks come from the backend's own rules (generated zod schema, trellis/12 D49).
  const form = useForm({
    resolver: zodResolver(zInviteMemberForm),
    defaultValues: EMPTY_FORM,
  });
  const { invite } = useMemberChanges();

  const selectedRoleId = useWatch({ control: form.control, name: "role_id" });
  const selectedRole = assignableRoles.find((r) => r.id === selectedRoleId);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) form.reset(EMPTY_FORM);
    onOpenChange(nextOpen);
  };

  // `values` is already checked: email trimmed + lower-cased, "No role" is null.
  // The dialog closes at once and a greyed "Sending…" row appears under Pending
  // invitations until the server answers (use-member-changes.ts).
  const handleSubmit = form.handleSubmit((values) => {
    const role = assignableRoles.find((r) => r.id === values.role_id);
    invite.mutate({ input: values, roleName: role?.name ?? null });
    handleOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Invite Member
            </DialogTitle>
            <DialogDescription>
              Invite a teammate to your organization. If they already use Trellis, they will be enrolled immediately. Otherwise, Clerk will email an invitation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            {/* Email input */}
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-1.5">
                  <FieldLabel htmlFor="member-email">Email Address</FieldLabel>
                  <Input
                    {...field}
                    id="member-email"
                    type="email"
                    placeholder="colleague@company.com"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Role picker */}
            <Controller
              name="role_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-1.5">
                  <FieldLabel htmlFor="member-role">Assign Role</FieldLabel>
                  <select
                    {...field}
                    value={field.value ?? ""}
                    id="member-role"
                    aria-invalid={fieldState.invalid}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">No role (member without org-level role)</option>
                    {assignableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} (Level {role.depth})
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

            {/* Permission preview for selected role */}
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
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Send Invite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
