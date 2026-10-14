"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * One TanStack Query cache per browser tab, used for instant (optimistic) changes
 * (trellis/12 D50). The cache never fetches on its own: its data always comes from the
 * server through `useServerData`, so queries never go stale and never refetch.
 *
 * Changes are always sent at once (`networkMode: "always"`). TanStack's default holds a
 * change while the browser says it's offline and sends it when it's back online, so a
 * Remove tried offline would still happen later. Now offline fails at once and rolls back.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: Infinity },
          mutations: { networkMode: "always" },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
