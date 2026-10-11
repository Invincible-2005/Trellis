"use client";

import React, { useState } from "react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { updateMemberRole } from "@/lib/api/actions/members";
import type { Member } from "@/lib/api/queries/members";
import type { Role } from "@/lib/api/queries/roles";

interface ChangeRoleDialogProps {
  /** A row with manageable: true (trellis/12 D38). */
  member: Member;
  assignableRoles: Role[];
  onClose: () => void;
}

export function ChangeRoleDialog({ member, assignableRoles, onClose }: ChangeRoleDialogProps) {
  const currentRoleId = member.org_role_id ?? "";
  const [roleId, setRoleId] = useState(currentRoleId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Their current role may hold a permission you lack, so it isn't always in the
  // assignable list: keep it visible as "(current)" so nothing changes by accident.
  const currentIsListed = !member.org_role_id || assignableRoles.some((r) => r.id === currentRoleId);
  const selectedRole = assignableRoles.find((r) => r.id === roleId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await updateMemberRole(member.user_id, roleId || null);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(
        `${member.name || member.email} now has ${res.data.org_role_name ? `the ${res.data.org_role_name} role` : "no org role"}.`
      );
      onClose();
    } catch {
      toast.error("An unexpected error occurred while changing the role.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSave} className="space-y-4">
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

          <div className="space-y-1.5">
            <Label htmlFor="member-new-role">Org Role</Label>
            <select
              id="member-new-role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
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
            <p className="text-[11px] text-muted-foreground">
              You can give roles below your own, with permissions you hold.
            </p>
          </div>

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
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || roleId === currentRoleId}>
              {isSubmitting ? "Saving..." : "Save Role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
