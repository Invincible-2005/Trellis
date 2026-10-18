"use client";

// The /feedback page (trellis/12 D54): Give · Given by you · Appeals to review.
// Only the tabs this user can use are shown (the backend's `tabs`). The open tab
// lives in the address (?tab=…), so a reload keeps it.

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Appeal, FeedbackOptions, GivenFeedback } from "@/lib/api/queries/feedback";
import { useServerData } from "@/lib/query/use-server-data";
import { AppealCard } from "./appeal-card";
import { GiveFeedbackForm } from "./give-feedback-form";
import { GivenFeedbackList } from "./given-feedback-list";
import { APPEALS_KEY, GIVEN_KEY, useFeedbackChanges } from "./use-feedback-changes";

const NO_GIVEN: GivenFeedback = { strikes: [], commendations: [] };
const NO_APPEALS: Appeal[] = [];

type TabId = "give" | "given" | "appeals";

interface FeedbackViewProps {
  options: FeedbackOptions;
  /** Null when you can't give (no Give / Given tabs). */
  given: GivenFeedback | null;
  /** Null when you can't review appeals. */
  appeals: Appeal[] | null;
  initialTab?: string;
}

export function FeedbackView({ options, given: serverGiven, appeals: serverAppeals, initialTab }: FeedbackViewProps) {
  // Kept in TanStack so deciding an appeal shows at once; the server's fresh copy
  // (after any save's revalidatePath) replaces it (trellis/12 D50).
  const given = useServerData(GIVEN_KEY, serverGiven ?? NO_GIVEN);
  const appeals = useServerData(APPEALS_KEY, serverAppeals ?? NO_APPEALS);
  const { decide } = useFeedbackChanges();
  const canStrike = options.tabs.includes("give_strike");
  const canGive = canStrike || options.tabs.includes("give_commendation");
  const canReview = options.tabs.includes("review_appeals");

  const tabs: TabId[] = [
    ...(canGive ? (["give", "given"] as const) : []),
    ...(canReview ? (["appeals"] as const) : []),
  ];
  const [tab, setTab] = useState<TabId>(
    tabs.includes(initialTab as TabId) ? (initialTab as TabId) : tabs[0],
  );

  // Only the address changes: no server round trip (the data for every tab is already here)
  const changeTab = (next: string) => {
    setTab(next as TabId);
    window.history.replaceState(null, "", `/feedback?tab=${next}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Feedback</h2>
        <p className="text-sm text-muted-foreground">
          {canGive && canReview
            ? "Recognise good work, record strikes, and review appeals."
            : canGive
              ? canStrike
                ? "Recognise good work and record strikes for people on your teams."
                : "Recognise good work by people on your teams."
              : "Review appeals of strikes in the teams you oversee."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="gap-1 p-1 group-data-horizontal/tabs:h-10">
          {canGive && (
            <TabsTrigger value="give" className="px-3">
              Give
            </TabsTrigger>
          )}
          {canGive && (
            <TabsTrigger value="given" className="px-3">
              Given by you
            </TabsTrigger>
          )}
          {canReview && (
            <TabsTrigger value="appeals" className="px-3">
              Appeals to review
              {appeals.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs text-primary">
                  {appeals.length}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {canGive && (
          // Kept mounted when hidden, so a half-filled form survives a look at another tab
          <TabsContent value="give" forceMount className="pt-4 data-[state=inactive]:hidden">
            <GiveFeedbackForm options={options} canStrike={canStrike} />
          </TabsContent>
        )}
        {canGive && (
          <TabsContent value="given" className="pt-4">
            <GivenFeedbackList given={given} />
          </TabsContent>
        )}
        {canReview && (
          <TabsContent value="appeals" className="pt-4">
            {appeals.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <p className="text-sm font-medium">No appeals waiting for you</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When someone appeals a strike in a team you review, it shows up here. Appeals of strikes
                  you gave or received go to someone else.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {appeals.map((appeal) => (
                  <AppealCard
                    key={appeal.id}
                    appeal={appeal}
                    onDecide={(decision) => decide.mutate({ appeal, decision })}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
