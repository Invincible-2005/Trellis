"use client";

// Instant changes on /feedback (trellis/12 D50).
// Deciding an appeal removes its card at once, then calls the Server Action. If the
// server refuses, the card comes back with a toast. On success the server's fresh
// copy (the action's revalidatePath) replaces ours by itself.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { decideAppeal, type AppealDecision } from "@/lib/api/actions/feedback";
import type { Appeal } from "@/lib/api/queries/feedback";
import { fromAction } from "@/lib/query/action";

/** Cache keys for this page's lists (filled by useServerData in FeedbackView). */
export const APPEALS_KEY = ["feedback", "appeals"];
export const GIVEN_KEY = ["feedback", "given"];

export function useFeedbackChanges() {
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: ({ appeal, decision }: { appeal: Appeal; decision: AppealDecision }) =>
      fromAction(decideAppeal(appeal.id, decision)),
    onMutate: ({ appeal }) => {
      const saved = queryClient.getQueryData<Appeal[]>(APPEALS_KEY);
      queryClient.setQueryData<Appeal[]>(APPEALS_KEY, (list) => (list ?? []).filter((a) => a.id !== appeal.id));
      return saved;
    },
    onError: (error, _variables, saved) => {
      if (saved) queryClient.setQueryData(APPEALS_KEY, saved);
      toast.error(error.message);
    },
    onSuccess: (_strike, { appeal, decision }) => {
      toast.success(
        decision === "uphold"
          ? `Strike upheld for ${appeal.given_to_name}.`
          : `Strike dismissed for ${appeal.given_to_name}. It no longer counts.`,
      );
    },
  });

  return { decide };
}
