"use client";

// Given by you (trellis/12 D54): strikes and commendations you gave, newest first,
// each with where it stands now. A strike you gave that was appealed waits for
// someone else to review it (D6).

import { Award, Flag } from "lucide-react";

import type { GivenFeedback } from "@/lib/api/queries/feedback";
import { cn } from "@/lib/utils";

type Strike = GivenFeedback["strikes"][number];
type Commendation = GivenFeedback["commendations"][number];
type Row = { kind: "strike"; item: Strike } | { kind: "commendation"; item: Commendation };

const TONE = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
  grey: "bg-muted text-muted-foreground",
};

function strikeStatus(strike: Strike): { label: string; tone: keyof typeof TONE } {
  if (strike.status === "appealed") return { label: "Appealed · waiting for another reviewer", tone: "amber" };
  if (strike.status === "dismissed")
    return { label: `Dismissed${strike.reviewed_by_name ? ` by ${strike.reviewed_by_name}` : ""}`, tone: "grey" };
  if (strike.reviewed_at)
    return { label: `Upheld${strike.reviewed_by_name ? ` by ${strike.reviewed_by_name}` : ""}`, tone: "red" };
  return { label: "Active", tone: "red" };
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Pill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs whitespace-nowrap", TONE[tone])}>{children}</span>;
}

export function GivenFeedbackList({ given }: { given: GivenFeedback }) {
  const rows: Row[] = [
    ...given.strikes.map((item) => ({ kind: "strike" as const, item })),
    ...given.commendations.map((item) => ({ kind: "commendation" as const, item })),
  ].sort((a, b) => b.item.created_at.localeCompare(a.item.created_at));

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm font-medium">Nothing given yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Strikes and commendations you give from the Give tab or from chat show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-xl border">
      {rows.map(({ kind, item }) => {
        const Icon = kind === "strike" ? Flag : Award;
        const status = kind === "strike" ? strikeStatus(item as Strike) : null;
        const strike = kind === "strike" ? (item as Strike) : null;
        return (
          <li key={`${kind}-${item.id}`} className="flex gap-3 p-3 sm:p-4">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{item.given_to_name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.team_name} · {shortDate(item.created_at)}
                </span>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {strike?.escalated && <Pill tone="red">Escalated</Pill>}
                  {status ? <Pill tone={status.tone}>{status.label}</Pill> : <Pill tone="green">Commendation</Pill>}
                </span>
              </div>
              <p className="text-sm break-words whitespace-pre-wrap text-foreground/80">{item.reason}</p>
              {strike?.appeal_notes && (
                <p className="border-l-2 pl-2 text-xs text-muted-foreground">
                  Their appeal: {strike.appeal_notes}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
