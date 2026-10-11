"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMember } from "@/lib/api/actions/members";
import type { Role } from "@/lib/api/queries/roles";

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
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRole = assignableRoles.find((r) => r.id === selectedRoleId);

  const resetForm = () => {
    setEmail("");
    setSelectedRoleId("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await addMember({
        email: trimmedEmail,
        role_id: selectedRoleId ? selectedRoleId : undefined,
      });

      if (!res.ok) {
        toast.error(res.message);
        return;
      }

      if (res.data.status === "added") {
        const name = res.data.member?.name || trimmedEmail;
        toast.success(`${name} has been added to the organization.`);
      } else {
        toast.success(`Invitation email sent to ${trimmedEmail}.`);
      }

      handleOpenChange(false);
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred while adding member.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email Address</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </div>

            {/* Role picker */}
            <div className="space-y-1.5">
              <Label htmlFor="member-role">Assign Role</Label>
              <select
                id="member-role"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">No role (member without org-level role)</option>
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} (Level {role.depth})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Only roles at or below your authority that hold permissions you possess can be assigned.
              </p>
            </div>

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
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invite"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
