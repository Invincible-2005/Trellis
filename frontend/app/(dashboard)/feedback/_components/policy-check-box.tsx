"use client";

// What a strike's policy check found (trellis/12 D46): a warning, never a block.
// The manager decides. Same look as chat's Confirm card; Feedback's own copy.

import { CircleHelp, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";

import type { PolicyCheck } from "@/lib/api/queries/feedback";
import { cn } from "@/lib/utils";
import { SourceBadge } from "./source-badge";

const VERDICT: Record<PolicyCheck["verdict"], { label: string; icon: LucideIcon; className: string }> = {
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

export function PolicyCheckBox({ policy, className }: { policy: PolicyCheck; className?: string }) {
  const { label, icon: Icon, className: tone } = VERDICT[policy.verdict];
  return (
    <div className={cn("rounded-lg px-3 py-2 text-sm", tone, className)}>
      <div className="flex items-center gap-1.5 font-medium">
        <Icon className="size-4 shrink-0" />
        {label}
      </div>
      {policy.explanation && <p className="mt-1 text-foreground/80">{policy.explanation}</p>}
      {(policy.sources ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(policy.sources ?? []).map((source, i) => (
            <SourceBadge key={source.tag} source={source} number={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
