"use client";

// What the assistant is doing right now ("Searching documents…"), from the
// stream's status events (trellis ticket 09). Disappears when the answer is done.

import { Loader2 } from "lucide-react";

import { STEP_LABELS } from "../use-chat-stream";

export function ThinkingStepper({ step }: { step: string | null }) {
  const label = step ? (STEP_LABELS[step] ?? "Working…") : "Starting…";
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
