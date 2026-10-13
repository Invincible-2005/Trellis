"use client";

// A change the assistant prepared, waiting for the user's click (trellis/12 D22).
// Nothing is saved until Confirm. The text comes from the backend, written by code
// from exactly what will be saved, never by the AI (D45). A strike also shows the
// policy check: a warning, never a block (D46), with the passages it used.

import {
  Award,
  Check,
  CircleHelp,
  ClipboardCheck,
  Flag,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CitationBadge } from "./citation-badge";
import type { CardState, ConfirmCard } from "./use-chat-stream";

const ACTION_ICON: Partial<Record<ConfirmCard["action"], LucideIcon>> = {
  create_task: ClipboardCheck,
  give_commendation: Award,
  give_strike: Flag,
};

type Verdict = NonNullable<ConfirmCard["policy"]>["verdict"];

const VERDICT: Record<Verdict, { label: string; icon: LucideIcon; className: string }> = {
  supported: {
    label: "Policy supports this",
    icon: ShieldCheck,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  not_covered: {
    label: "No policy found that covers this reason",
    icon: TriangleAlert,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  unchecked: {
    label: "The policy check couldn't run",
    icon: CircleHelp,
    className: "bg-muted text-muted-foreground",
  },
};

const STATE_LABEL: Partial<Record<CardState, string>> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

interface ConfirmActionCardProps {
  card: ConfirmCard;
  state: CardState;
  /** Another answer is streaming: the buttons wait. */
  busy: boolean;
  onRespond: (decision: "confirm" | "cancel") => void;
}

export function ConfirmActionCard({ card, state, busy, onRespond }: ConfirmActionCardProps) {
  const open = state === "waiting" || state === "sending";
  const Icon = ACTION_ICON[card.action] ?? ClipboardCheck;
  return (
    <div className={cn("max-w-md rounded-xl border bg-card p-4 shadow-xs", !open && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          {card.summary}
        </div>
        {STATE_LABEL[state] && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {STATE_LABEL[state]}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {card.details.map((line) => (
          <div key={line.label} className="contents">
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd className="min-w-0 break-words whitespace-pre-wrap">{line.value}</dd>
          </div>
        ))}
      </dl>

      {card.policy && <PolicyCheckBox policy={card.policy} />}

      {open && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">Nothing is saved until you confirm.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy || state === "sending"} onClick={() => onRespond("confirm")}>
              {state === "sending" ? <Loader2 className="animate-spin" /> : <Check />}
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || state === "sending"}
              onClick={() => onRespond("cancel")}
            >
              <X />
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** D46: what the policy check found. The manager decides; this never blocks Confirm. */
function PolicyCheckBox({ policy }: { policy: NonNullable<ConfirmCard["policy"]> }) {
  const { label, icon: Icon, className } = VERDICT[policy.verdict];
  return (
    <div className={cn("mt-3 rounded-lg px-3 py-2 text-sm", className)}>
      <div className="flex items-center gap-1.5 font-medium">
        <Icon className="size-4 shrink-0" />
        {label}
      </div>
      {policy.explanation && <p className="mt-1 text-foreground/80">{policy.explanation}</p>}
      {policy.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {policy.sources.map((source, i) => (
            <CitationBadge key={source.tag} citation={source} number={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
