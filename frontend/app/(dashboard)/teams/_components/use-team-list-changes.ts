"use client";

// Creating a team on /teams, shown instantly (trellis/12 D50): a greyed "Creating…"
// card appears at once and becomes the real team when the server answers. If the
// server refuses (e.g. the name is taken), the card goes away with a toast.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createTeam, type CreateTeamInput } from "@/lib/api/actions/teams";
import type { Team } from "@/lib/api/queries/teams";
import { fromAction } from "@/lib/query/action";

/** Cache key for the /teams cards (filled by useServerData in TeamList). */
export const TEAMS_KEY = ["teams"];

/** A team card. `pending` = only in the browser so far (temporary id, not clickable). */
export type TeamCard = Team & { pending?: boolean };

export function useTeamListChanges() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (input: CreateTeamInput) => fromAction(createTeam(input)),
    onMutate: (input) => {
      const saved = queryClient.getQueryData<TeamCard[]>(TEAMS_KEY);
      const tempId = crypto.randomUUID();
      const placeholder: TeamCard = {
        id: tempId,
        name: input.name,
        my_role_name: null,
        member_count: 0,
        open_tasks: 0,
        overdue_tasks: 0,
        can_add_member: false,
        can_assign_task: false,
        deletable: false,
        pending: true,
      };
      queryClient.setQueryData<TeamCard[]>(TEAMS_KEY, (list) => [...(list ?? []), placeholder]);
      return { saved, tempId };
    },
    onError: (error, _input, sent) => {
      if (sent) queryClient.setQueryData(TEAMS_KEY, sent.saved);
      toast.error(error.message);
    },
    onSuccess: (team, _input, sent) => {
      queryClient.setQueryData<TeamCard[]>(TEAMS_KEY, (list) =>
        (list ?? []).map((t) => (t.id === sent?.tempId ? team : t)),
      );
      toast.success(`Team "${team.name}" created.`);
    },
  });

  return { create };
}
