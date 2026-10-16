"use client";

// A source under an answer: "1 · Leave Policy · part 2". Click → the passage the
// answer used. Only sources the assistant really retrieved get a badge (trellis/12 D20).

import { FileText } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Citation } from "../use-chat-stream";

export function CitationBadge({ citation, number }: { citation: Citation; number: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span className="font-semibold text-foreground">{number}</span>
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{citation.title}</span>
          <span className="shrink-0">· part {citation.chunk_index + 1}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2">
        <p className="text-sm font-medium">
          {citation.title} · part {citation.chunk_index + 1}
        </p>
        <p className="text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
          {citation.excerpt}
          {citation.excerpt.length >= 300 && "…"}
        </p>
      </PopoverContent>
    </Popover>
  );
}
