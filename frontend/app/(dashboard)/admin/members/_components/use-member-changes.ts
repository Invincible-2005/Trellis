"use client";

// Every change on Admin → Members, shown instantly (trellis/12 D50).
// Each one saves the current lists, changes them at once, then calls the Server Action.
// If the server refuses, the saved lists come back with a toast. On success the
// server's fresh copy (the action's revalidatePath) replaces ours by itself.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addMember,
  cancelInvitation,
  removeMember,
  updateMemberRole,
  type AddMemberInput,
} from "@/lib/api/actions/members";
import type { Invitation, Member } from "@/lib/api/queries/members";
import { fromAction } from "@/lib/query/action";

/** Cache keys for this page's two lists (filled by useServerData in MembersView). */
export const MEMBERS_KEY = ["members"];
export const INVITATIONS_KEY = ["invitations"];

/** An invitation row. `pending` = only in the browser so far (temporary id, buttons disabled). */
export type InvitationRow = Invitation & { pending?: boolean };

/** The lists as they were before a change, to put back if the server refuses. */
type Saved = { members?: Member[]; invitations?: InvitationRow[] };

export function useMemberChanges() {
  const queryClient = useQueryClient();

  const save = (): Saved => ({
    members: queryClient.getQueryData<Member[]>(MEMBERS_KEY),
    invitations: queryClient.getQueryData<InvitationRow[]>(INVITATIONS_KEY),
  });
  const updateMembers = (change: (list: Member[]) => Member[]) =>
    queryClient.setQueryData<Member[]>(MEMBERS_KEY, (list) => change(list ?? []));
  const updateInvitations = (change: (list: InvitationRow[]) => InvitationRow[]) =>
    queryClient.setQueryData<InvitationRow[]>(INVITATIONS_KEY, (list) => change(list ?? []));

  // Same for every change: put the old lists back and say why.
  const undo = (error: Error, _variables: unknown, saved: Saved | undefined) => {
    if (saved) {
      queryClient.setQueryData(MEMBERS_KEY, saved.members);
      queryClient.setQueryData(INVITATIONS_KEY, saved.invitations);
    }
    toast.error(error.message);
  };

  const remove = useMutation({
    mutationFn: (member: Member) => fromAction(removeMember(member.user_id)),
    onMutate: (member) => {
      const saved = save();
      updateMembers((list) => list.filter((m) => m.user_id !== member.user_id));
      return saved;
    },
    onError: undo,
    onSuccess: (_result, member) => {
      toast.success(`${member.name || member.email} was removed from the organization.`);
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ member, roleId }: { member: Member; roleId: string | null; roleName: string | null }) =>
      fromAction(updateMemberRole(member.user_id, roleId)),
    onMutate: ({ member, roleId, roleName }) => {
      const saved = save();
      updateMembers((list) =>
        list.map((m) =>
          m.user_id === member.user_id ? { ...m, org_role_id: roleId, org_role_name: roleName } : m,
        ),
      );
      return saved;
    },
    onError: undo,
    onSuccess: (updated, { member }) => {
      updateMembers((list) => list.map((m) => (m.user_id === updated.user_id ? updated : m)));
      toast.success(
        `${member.name || member.email} now has ${updated.org_role_name ? `the ${updated.org_role_name} role` : "no org role"}.`,
      );
    },
  });

  const cancelInvite = useMutation({
    mutationFn: (invitation: InvitationRow) => fromAction(cancelInvitation(invitation.id)),
    onMutate: (invitation) => {
      const saved = save();
      updateInvitations((list) => list.filter((i) => i.id !== invitation.id));
      return saved;
    },
    onError: undo,
    onSuccess: (_result, invitation) => {
      toast.success(`Invitation to ${invitation.email} cancelled.`);
    },
  });

  const invite = useMutation({
    mutationFn: ({ input }: { input: AddMemberInput; roleName: string | null }) =>
      fromAction(addMember(input)),
    // Show a greyed "Sending…" row with a temporary id until the server answers.
    onMutate: ({ input, roleName }) => {
      const saved = save();
      const tempId = crypto.randomUUID();
      const placeholder: InvitationRow = {
        id: tempId,
        email: input.email,
        org_id: "",
        org_name: "",
        role_id: input.role_id ?? null,
        role_name: roleName,
        invited_by_name: "You",
        status: "pending",
        created_at: new Date().toISOString(),
        pending: true,
      };
      updateInvitations((list) => [placeholder, ...list]); // newest first, like the server
      return { ...saved, tempId };
    },
    onError: undo,
    onSuccess: (result, { input }, sent) => {
      // Swap the temporary row for what the server made: a real invite, or (if they
      // already use Trellis) no invite at all and a new row in Members.
      updateInvitations((list) =>
        result.status === "invited" && result.invitation
          ? list.map((i) => (i.id === sent?.tempId ? result.invitation! : i))
          : list.filter((i) => i.id !== sent?.tempId),
      );
      if (result.status === "added" && result.member) {
        const member = result.member;
        updateMembers((list) => [...list.filter((m) => m.user_id !== member.user_id), member]);
        toast.success(`${member.name || input.email} has been added to the organization.`);
      } else {
        toast.success(`Invitation email sent to ${input.email}.`);
      }
    },
  });

  return { remove, changeRole, cancelInvite, invite };
}
