"use client";

// One appeal waiting for your decision (trellis/12 D6, D55): everything on the card,
// no drawer. Uphold keeps the strike; Dismiss stops it counting. Each asks first;
// the card then leaves the list at once (use-feedback-changes.ts).

import { useState } from "react";
import { Check, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AppealDecision } from "@/lib/api/actions/feedback";
import type { Appeal, PolicyCheck } from "@/lib/api/queries/feedback";
import { PolicyCheckBox } from "./policy-check-box";

// The backend saves the check as "<label>: <explanation>" (services/strikes.py::evaluation_text)
const VERDICT_BY_LABEL: Record<string, PolicyCheck["verdict"]> = {
  "Policy supports this": "supported",
  "No policy found that covers this reason": "not_covered",
  "The policy check couldn't run": "unchecked",
};

function savedPolicy(appeal: Appeal): PolicyCheck | null {
  const text = appeal.policy_evaluation;
  if (!text) return null;
  const [label, ...rest] = text.split(": ");
  return {
    verdict: VERDICT_BY_LABEL[label] ?? "unchecked",
    explanation: rest.join(": "),
    sources: appeal.policy_sources ?? [],
  };
}

const CONFIRM: Record<AppealDecision, { title: string; body: string; action: string }> = {
  uphold: {
    title: "Uphold this strike?",
    body: "The strike stays and keeps counting. The appeal can't be made again.",
    action: "Uphold strike",
  },
  dismiss: {
    title: "Dismiss this strike?",
    body: "The strike stops counting and leaves their dashboard.",
    action: "Dismiss strike",
  },
};

interface AppealCardProps {
  appeal: Appeal;
  onDecide: (decision: AppealDecision) => void;
}

export function AppealCard({ appeal, onDecide }: AppealCardProps) {
  const [confirming, setConfirming] = useState<AppealDecision | null>(null);
  const policy = savedPolicy(appeal);
  const date = new Date(appeal.created_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {appeal.given_to_name} · {appeal.team_name}
          </p>
          <p className="text-xs text-muted-foreground">
            Strike from {appeal.given_by_name}, {date}
          </p>
        </div>
        {appeal.escalated && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-400">
            Escalated
          </span>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Reason for the strike</p>
        <p className="text-sm break-words whitespace-pre-wrap">{appeal.reason}</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Their appeal</p>
        <blockquote className="border-l-2 pl-3 text-sm break-words whitespace-pre-wrap italic">
          {appeal.appeal_notes}
        </blockquote>
      </div>

      {policy ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Policy check when the strike was given</p>
          <PolicyCheckBox policy={policy} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No policy check was saved with this strike.</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={() => setConfirming("uphold")}>
          <Check />
          Uphold strike
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirming("dismiss")}>
          <X />
          Dismiss strike
        </Button>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          {confirming && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRM[confirming].title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {appeal.given_to_name} in {appeal.team_name}. {CONFIRM[confirming].body}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDecide(confirming)}>{CONFIRM[confirming].action}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
