"use client";

import React, { useState } from "react";
import { Clock, Shield, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMemberChanges, type InvitationRow } from "./use-member-changes";

interface InvitationsTableProps {
  invitations: InvitationRow[];
}

export function InvitationsTable({ invitations }: InvitationsTableProps) {
  const [inviteToCancel, setInviteToCancel] = useState<InvitationRow | null>(null);
  const { cancelInvite } = useMemberChanges();

  // The row disappears at once; the server's answer comes later (use-member-changes.ts).
  const handleCancelInvite = () => {
    if (!inviteToCancel) return;
    cancelInvite.mutate(inviteToCancel);
    setInviteToCancel(null);
  };

  if (invitations.length === 0) {
    return null;
  }

  return (
    <>
      <div className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Email</th>
                <th className="px-5 py-3.5">Assigned Role</th>
                <th className="px-5 py-3.5">Invited By</th>
                <th className="px-5 py-3.5">Sent</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invitations.map((inv) => (
                <tr
                  key={inv.id}
                  className={inv.pending ? "opacity-60" : "hover:bg-muted/30 transition-colors"}
                >
                  {/* Email */}
                  <td className="px-5 py-3.5 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span>{inv.email}</span>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {inv.role_name ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                        <Shield className="h-3 w-3" />
                        {inv.role_name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        No role
                      </span>
                    )}
                  </td>

                  {/* Invited By */}
                  <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {inv.invited_by_name || "—"}
                  </td>

                  {/* Sent Date */}
                  <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {inv.pending
                      ? "Sending…"
                      : new Date(inv.created_at).toLocaleDateString("en-GB", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                  </td>

                  {/* Cancel Action: not until the server has the invite (it has no real id yet) */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={inv.pending}
                      onClick={() => setInviteToCancel(inv)}
                      className="text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!inviteToCancel} onOpenChange={(open) => !open && setInviteToCancel(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Cancel Invitation</DialogTitle>
            <DialogDescription>
              Cancel the invite to <strong className="text-foreground">{inviteToCancel?.email}</strong>? The link in their email will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setInviteToCancel(null)}>
              Keep Invite
            </Button>
            <Button type="button" variant="destructive" onClick={handleCancelInvite}>
              Cancel Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
