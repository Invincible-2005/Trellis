"use client";

import React, { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeMember } from "@/lib/api/actions/members";
import type { Member } from "@/lib/api/queries/members";

interface RemoveMemberDialogProps {
  /** A row with manageable: true (trellis/12 D38). */
  member: Member;
  onClose: () => void;
}

export function RemoveMemberDialog({ member, onClose }: RemoveMemberDialogProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const name = member.name || member.email;

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const res = await removeMember(member.user_id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      // removeMember refreshes /admin/members, so the row disappears by itself.
      toast.success(`${name} was removed from the organization.`);
      onClose();
    } catch {
      toast.error("An unexpected error occurred while removing the member.");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Remove Member</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Remove <strong className="text-foreground">{name}</strong> from the organization?
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>They lose access right away and are taken off all their teams.</li>
                <li>
                  Their tasks, strikes and uploaded documents stay. Team managers can reassign
                  their open tasks.
                </li>
                <li>You can add them again later with Invite Member.</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isRemoving}>
            Keep Member
          </Button>
          <Button type="button" variant="destructive" onClick={handleRemove} disabled={isRemoving}>
            {isRemoving ? "Removing..." : "Remove Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
