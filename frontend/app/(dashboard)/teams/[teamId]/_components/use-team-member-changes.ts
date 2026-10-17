"use client";

// Adding and removing team members on /teams/[teamId], shown instantly (trellis/12 D50).
// Each change saves the current list, changes it at once, then calls the Server Action.
// If the server refuses, the saved list comes back with a toast. On success the
// server's fresh copy (the action's revalidatePath) replaces ours by itself.

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { addTeamMember, removeTeamMember, type AddTeamMemberInput } from "@/lib/api/actions/teams";
import type { TeamMember } from "@/lib/api/queries/teams";
import { fromAction } from "@/lib/query/action";

/** Cache key for one team's members (filled by useServerData in TeamDetailClient). */
export const teamMembersKey = (teamId: string): QueryKey => ["team", teamId, "members"];

/** A member row. `pending` = only in the browser so far (buttons hidden). */
export type MemberRow = TeamMember & { pending?: boolean };

export function useTeamMemberChanges(teamId: string, teamName: string) {
  const queryClient = useQueryClient();
  const key = teamMembersKey(teamId);

  const save = () => queryClient.getQueryData<MemberRow[]>(key);
  const update = (change: (list: MemberRow[]) => MemberRow[]) =>
    queryClient.setQueryData<MemberRow[]>(key, (list) => change(list ?? []));

  // Same for every change: put the old list back and say why.
  const undo = (error: Error, _variables: unknown, context: { saved?: MemberRow[] } | undefined) => {
    if (context?.saved) queryClient.setQueryData(key, context.saved);
    toast.error(error.message);
  };

  const add = useMutation({
    mutationFn: ({ input }: { input: AddTeamMemberInput; name: string; email: string; roleName: string }) =>
      fromAction(addTeamMember(teamId, input)),
    // Show a greyed "Adding…" row until the server answers.
    onMutate: ({ input, name, email, roleName }) => {
      const saved = save();
      const placeholder: MemberRow = {
        user_id: input.user_id,
        name,
        email,
        role_id: input.role_id,
        role_name: roleName,
        joined_at: new Date().toISOString(),
        removable: false,
        assignable: false,
        pending: true,
      };
      update((list) => [...list.filter((m) => m.user_id !== input.user_id), placeholder]);
      return { saved };
    },
    onError: undo,
    onSuccess: (member) => {
      update((list) => list.map((m) => (m.user_id === member.user_id ? member : m)));
      toast.success(`${member.name} added to ${teamName}.`);
    },
  });

  const remove = useMutation({
    mutationFn: (member: MemberRow) => fromAction(removeTeamMember(teamId, member.user_id)),
    onMutate: (member) => {
      const saved = save();
      update((list) => list.filter((m) => m.user_id !== member.user_id));
      return { saved };
    },
    onError: undo,
    onSuccess: (_result, member) => {
      toast.success(`${member.name} removed from ${teamName}.`);
    },
  });

  return { add, remove };
}
