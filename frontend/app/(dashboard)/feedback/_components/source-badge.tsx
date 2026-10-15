"use client";

// A policy passage behind a strike's policy check: "1 · Employee handbook · part 2".
// Click → the passage. Only passages the check really retrieved are shown (trellis/12 D46).
// Feedback's own copy of chat's citation badge (kept separate on purpose, 2026-10-15).

import { FileText } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { components } from "@/lib/api/v1";

type Source = components["schemas"]["Citation"];

export function SourceBadge({ source, number }: { source: Source; number: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span className="font-semibold text-foreground">{number}</span>
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{source.title}</span>
          <span className="shrink-0">· part {source.chunk_index + 1}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2">
        <p className="text-sm font-medium">
          {source.title} · part {source.chunk_index + 1}
        </p>
        <p className="text-xs leading-relaxed whitespace-pre-line text-muted-foreground">{source.excerpt}</p>
      </PopoverContent>
    </Popover>
  );
}
