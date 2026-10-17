"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Puts the data a Server Component loaded into the TanStack cache and returns the cached
 * copy, which `useMutation` changes instantly (trellis/12 D50).
 *
 * "The server's copy wins": when the server sends fresh data (a Server Action's
 * `revalidatePath` / `refresh()`, or coming back to the page), it replaces the cached copy.
 * Same content as last time = no change, so a pending instant change isn't undone.
 *
 * Usage, in a page's client component:
 *   const members = useServerData(["members"], props.members);
 */
export function useServerData<T>(queryKey: QueryKey, serverData: T): T {
  const queryClient = useQueryClient();
  const lastCopied = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey,
    // Never runs on its own (staleTime: Infinity in the provider); if something does
    // ask for a refetch, the answer is the server's latest copy.
    queryFn: () => serverData,
    initialData: serverData,
  });

  useEffect(() => {
    const json = JSON.stringify(serverData);
    if (json === lastCopied.current) return;
    lastCopied.current = json;
    queryClient.setQueryData(queryKey, serverData);
  }, [queryClient, queryKey, serverData]);

  return data ?? serverData;
}
