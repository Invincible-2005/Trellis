/**
 * app/(dashboard)/feedback/page.tsx — /feedback (trellis/12 D54)
 *
 * Server Component:
 * - Only for people with at least one Feedback tab (active_org.feedback_tabs);
 *   everyone else goes to the dashboard.
 * - Loads what the page offers (options), what you gave, and the appeals you may
 *   decide, in parallel. Each is loaded only if you get the tab that shows it.
 * - ?tab=give | given | appeals picks the open tab (FeedbackView checks it).
 */
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/api/queries/auth";
import { getAppeals, getFeedbackOptions, getGivenFeedback } from "@/lib/api/queries/feedback";
import { FeedbackView } from "./_components/feedback-view";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const ctx = await getAuthContext();
  const { tab } = await searchParams;

  const feedbackTabs = ctx.active_org?.feedback_tabs ?? [];
  if (feedbackTabs.length === 0) redirect("/dashboard");

  const canGive = feedbackTabs.includes("give_strike") || feedbackTabs.includes("give_commendation");
  const canReview = feedbackTabs.includes("review_appeals");

  const [options, given, appeals] = await Promise.all([
    getFeedbackOptions(),
    canGive ? getGivenFeedback() : null,
    canReview ? getAppeals() : null,
  ]);

  return (
    <FeedbackView
      options={options}
      given={given}
      appeals={appeals}
      initialTab={typeof tab === "string" ? tab : undefined}
    />
  );
}
