"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { cancelInvitation } from "@/lib/api/actions/members";
import type { Invitation } from "@/lib/api/queries/members";

interface InvitationsTableProps {
  invitations: Invitation[];
}

export function InvitationsTable({ invitations: initialInvitations }: InvitationsTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations);
  const [inviteToCancel, setInviteToCancel] = useState<Invitation | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  React.useEffect(() => {
    setInvitations(initialInvitations);
  }, [initialInvitations]);

  const handleCancelInvite = async () => {
    if (!inviteToCancel) return;

    setIsCancelling(true);
    try {
      const res = await cancelInvitation(inviteToCancel.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }

      toast.success(`Invitation to ${inviteToCancel.email} cancelled.`);
      setInvitations((prev) => prev.filter((inv) => inv.id !== inviteToCancel.id));
      setInviteToCancel(null);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      toast.error("Failed to cancel invitation.");
    } finally {
      setIsCancelling(false);
    }
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
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
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
                    {inv.invited_by_name || "Admin"}
                  </td>

                  {/* Sent Date */}
                  <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(inv.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>

                  {/* Cancel Action */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setInviteToCancel(null)}
              disabled={isCancelling}
            >
              Keep Invite
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancelInvite}
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelling..." : "Cancel Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
