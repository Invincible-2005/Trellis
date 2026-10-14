"use client";

import React, { useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Invitation, Member } from "@/lib/api/queries/members";
import type { Role } from "@/lib/api/queries/roles";
import { useServerData } from "@/lib/query/use-server-data";
import { InvitationsTable } from "./invitations-table";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MembersTable } from "./members-table";
import { INVITATIONS_KEY, MEMBERS_KEY, type InvitationRow } from "./use-member-changes";

interface MembersViewProps {
  members: Member[];
  invitations: Invitation[];
  assignableRoles: Role[];
}

export function MembersView(props: MembersViewProps) {
  const { assignableRoles } = props;
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // The server's lists, kept in TanStack so changes show instantly (use-member-changes.ts).
  const members = useServerData(MEMBERS_KEY, props.members);
  const invitations = useServerData<InvitationRow[]>(INVITATIONS_KEY, props.invitations);

  return (
    <div className="space-y-8">
      {/* ── Page Header ───────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Organization Members
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage teammates enrolled in your organization and their organization-level roles.
          </p>
        </div>
        <Button onClick={() => setInviteDialogOpen(true)} className="flex items-center gap-1.5 shrink-0">
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {/* ── Active Members Section ────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Active Members ({members.length})
          </h3>
        </div>
        <MembersTable members={members} assignableRoles={assignableRoles} />
      </div>

      {/* ── Pending Invitations Section ───────────────────────── */}
      {invitations.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Pending Invitations ({invitations.length})
            </h3>
          </div>
          <InvitationsTable invitations={invitations} />
        </div>
      )}

      {/* ── Invite Dialog ─────────────────────────────────────── */}
      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        assignableRoles={assignableRoles}
      />
    </div>
  );
}
