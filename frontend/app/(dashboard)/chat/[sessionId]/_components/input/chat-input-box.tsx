"use client";

// The message box: Enter sends, Shift+Enter adds a line, disabled while the
// assistant answers. Messages over 4,000 characters are refused by the backend
// (trellis/12 D21), so a counter shows near the limit and Send is disabled past it.
//
// Mentions (D43): at the start of a word, `@` lists people (everyone in the org,
// your teammates first, D51) and `/` lists teams.
// The box shows "@riya@acme.com" / "/Team Alpha"; on send each picked mention is
// swapped for its token with the exact id (mentions.ts).
//
// A textarea can't color part of its text, so a copy of the text sits over it
// with picked mentions colored (people blue, teams green, like sent messages);
// the textarea's own text is transparent but keeps the caret and selection.
// Only color changes in the copy: a bolder font would move the caret.

import { useMemo, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Mentions } from "@/lib/api/queries/chat";
import { markPicked, type PickedMention, withTokens } from "../mentions";
import { MentionPopover, type MentionOption } from "./mention-popover";

export const MAX_MESSAGE_CHARS = 4000;
const SHOW_COUNTER_FROM = 3500;
const MAX_OPTIONS = 8;

// The word being typed at the caret, if it starts with @ or / (start of text or after a space)
const TRIGGER = /(?:^|\s)([@/])([^\s@/]*)$/;

interface ChatInputBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** Gets the text with mention tokens. Resolves false when refused; the text is put back. */
  onSend: (text: string) => Promise<boolean>;
  disabled: boolean;
  mentions: Mentions;
}

export function ChatInputBox({ value, onChange, onSend, disabled, mentions }: ChatInputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState<PickedMention[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null); // Esc closes until the text changes

  const text = value.trim();
  const tooLong = value.length > MAX_MESSAGE_CHARS;
  const canSend = !disabled && text.length > 0 && !tooLong;

  // Is the caret inside an @word or /word?
  const query = useMemo(() => {
    const match = value.slice(0, caret).match(TRIGGER);
    if (!match) return null;
    const [, trigger, search] = match;
    return { trigger: trigger as "@" | "/", search: search.toLowerCase(), start: caret - search.length - 1 };
  }, [value, caret]);

  const options = useMemo<MentionOption[]>(() => {
    if (!query) return [];
    if (query.trigger === "@") {
      return mentions.people
        .filter((p) => p.name.toLowerCase().includes(query.search) || p.email.toLowerCase().includes(query.search))
        .slice(0, MAX_OPTIONS)
        .map((p) => ({
          id: p.id,
          kind: "user",
          label: p.name,
          detail: p.email,
          display: `@${p.email}`,
          group: p.on_my_team ? "Your teams" : "Others in the org",
        }));
    }
    return mentions.teams
      .filter((t) => t.name.toLowerCase().includes(query.search))
      .slice(0, MAX_OPTIONS)
      .map((t) => ({ id: t.id, kind: "team", label: t.name, display: `/${t.name}` }));
  }, [query, mentions]);

  const listOpen = query !== null && dismissedAt !== value && !disabled;

  const placeCaret = (position: number) => {
    setCaret(position);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(position, position));
  };

  const pick = (option: MentionOption) => {
    if (!query) return;
    const insert = `${option.display} `;
    onChange(value.slice(0, query.start) + insert + value.slice(caret));
    placeCaret(query.start + insert.length);
    const token =
      option.kind === "user" ? `@[${option.detail}](user:${option.id})` : `/[${option.label}](team:${option.id})`;
    setPicked((current) =>
      current.some((m) => m.display === option.display)
        ? current
        : [...current, { display: option.display, token, kind: option.kind }]
    );
    setActiveIndex(0);
  };

  const submit = async () => {
    if (!canSend) return;
    onChange("");
    const accepted = await onSend(withTokens(text, picked));
    if (accepted) setPicked([]);
    else onChange(text);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (listOpen && options.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((i) => (i + step + options.length) % options.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(options[Math.min(activeIndex, options.length - 1)]);
        return;
      }
    }
    if (listOpen && e.key === "Escape") {
      e.preventDefault();
      setDismissedAt(value);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="relative"
    >
      {listOpen && query && (
        <MentionPopover
          trigger={query.trigger}
          options={options}
          activeIndex={Math.min(activeIndex, Math.max(options.length - 1, 0))}
          onPick={pick}
          onHover={setActiveIndex}
        />
      )}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
            setActiveIndex(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onScroll={(e) => {
            if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setDismissedAt(value)}
          onFocus={() => setDismissedAt(null)}
          placeholder="Ask about your documents, tasks or teams… (@ person, / team)"
          aria-label="Message"
          aria-expanded={listOpen}
          className="max-h-48 min-h-12 resize-none pr-12 text-transparent caret-foreground [scrollbar-gutter:stable]"
          autoFocus
        />
        {/* Same box size, padding and font as the textarea, so the copy lines up with it */}
        <div
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent px-2.5 py-2 pr-12 text-base break-words whitespace-pre-wrap [scrollbar-gutter:stable] md:text-sm"
        >
          {markPicked(value, picked).map((part, i) =>
            typeof part === "string" ? (
              part
            ) : (
              <span
                key={i}
                className={cn(
                  "rounded-sm",
                  part.kind === "user"
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                    : "bg-green-500/10 text-green-700 dark:text-green-400"
                )}
              >
                {part.label}
              </span>
            )
          )}
          {/* Keeps a trailing new line as a real line, as in the textarea */}
          {"​"}
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          className="absolute right-2 bottom-2 rounded-full"
          aria-label="Send"
        >
          <ArrowUp />
        </Button>
      </div>
      {value.length >= SHOW_COUNTER_FROM && (
        <p className={cn("mt-1 text-right text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
          {value.length.toLocaleString()} / {MAX_MESSAGE_CHARS.toLocaleString()}
        </p>
      )}
    </form>
  );
}
