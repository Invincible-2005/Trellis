"use client";

import React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Member } from "@/lib/api/queries/members";

interface RemoveMemberDialogProps {
  /** A row with manageable: true (trellis/12 D38). */
  member: Member;
  /** Removes the row at once; the server's answer comes later (use-member-changes.ts). */
  onRemove: () => void;
  onClose: () => void;
}

export function RemoveMemberDialog({ member, onRemove, onClose }: RemoveMemberDialogProps) {
  const name = member.name || member.email;

  const handleRemove = () => {
    onRemove();
    onClose();
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
          <Button type="button" variant="outline" onClick={onClose}>
            Keep Member
          </Button>
          <Button type="button" variant="destructive" onClick={handleRemove}>
            Remove Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
