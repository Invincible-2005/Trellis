"use client";

// The conversation: your messages on the right (mentions as chips), answers on the
// left as formatted markdown. Citation tags like [3f9a12bc] become small numbers
// matching the source badges; tags the backend couldn't verify are hidden (D20).
// A change the assistant prepared shows as a Confirm / Cancel card (D22).

import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { CitationBadge } from "./citation-badge";
import { ConfirmActionCard } from "./confirm-action-card";
import { splitMentions } from "./mentions";
import { ThinkingStepper } from "./thinking-stepper";
import type { ChatMessageView, Citation } from "./use-chat-stream";

const CITE_GROUP = /\[([^[\]]+)\]/g; // [3f9a12bc] or [3f9a12bc, 77aa01cd]
const HEX8 = /^[0-9a-f]{8}$/i;

/**
 * Citation tags → markdown links "#cite-<n>" (rendered as small numbers).
 * While the answer is still streaming there are no badges yet, so tags are hidden.
 */
function linkCitations(content: string, citations: Citation[], pending: boolean): string {
  const numberOf = new Map(citations.map((c, i) => [c.tag.toLowerCase(), i + 1]));
  return content.replace(CITE_GROUP, (whole, group: string) => {
    const tags = group.split(/[,\s]+/).filter(Boolean);
    if (!tags.every((t) => HEX8.test(t))) return whole; // not a citation, e.g. a link's text
    if (pending) return "";
    return tags
      .map((t) => numberOf.get(t.toLowerCase()))
      .filter((n): n is number => n !== undefined)
      .map((n) => `[${n}](#cite-${n})`)
      .join("");
  });
}

const markdown: Components = {
  p: (props) => <p className="mb-3 leading-relaxed last:mb-0" {...props} />,
  ul: (props) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: (props) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  h1: (props) => <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />,
  h2: (props) => <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />,
  h3: (props) => <h4 className="mt-3 mb-1.5 font-semibold first:mt-0" {...props} />,
  blockquote: (props) => <blockquote className="mb-3 border-l-2 pl-3 text-muted-foreground" {...props} />,
  code: (props) => <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]" {...props} />,
  pre: (props) => <pre className="mb-3 overflow-x-auto rounded-md bg-muted p-3 text-xs" {...props} />,
  table: (props) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => <th className="border px-2 py-1 text-left font-semibold" {...props} />,
  td: (props) => <td className="border px-2 py-1" {...props} />,
  a: ({ href, children, ...props }: ComponentProps<"a">) =>
    href?.startsWith("#cite-") ? (
      <sup className="ml-0.5 rounded bg-muted px-1 text-[0.7em] font-semibold text-muted-foreground">{children}</sup>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2" {...props}>
        {children}
      </a>
    ),
};

interface ChatMessageListProps {
  messages: ChatMessageView[];
  step: string | null;
  /** An answer is streaming: card buttons wait. */
  isAnswering: boolean;
  onRespond: (decision: "confirm" | "cancel") => void;
}

export function ChatMessageList({ messages, step, isAnswering, onRespond }: ChatMessageListProps) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((message, i) =>
        message.role === "user" ? (
          <UserMessage key={i} content={message.content} />
        ) : (
          <AssistantMessage key={i} message={message} step={step} isAnswering={isAnswering} onRespond={onRespond} />
        )
      )}
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
        {splitMentions(content).map((part, i) =>
          typeof part === "string" ? (
            part
          ) : (
            // Colored text only: people blue, teams green (D43). Dark shades so they read on the orange bubble.
            <span key={i} className={cn("font-semibold", part.kind === "user" ? "text-blue-800" : "text-green-800")}>
              {part.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  step,
  isAnswering,
  onRespond,
}: { message: ChatMessageView; step: string | null } & Omit<ChatMessageListProps, "messages" | "step">) {
  const { content, citations, error, pending, card, cardState } = message;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {content && (
        <div className={cn("text-foreground", pending && "opacity-90")}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdown}>
            {linkCitations(content, citations, !!pending)}
          </ReactMarkdown>
        </div>
      )}
      {card && (
        <ConfirmActionCard card={card} state={cardState ?? "waiting"} busy={isAnswering} onRespond={onRespond} />
      )}
      {pending && <ThinkingStepper step={step} />}
      {error && (
        <p className="flex items-start gap-1.5 text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      {citations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {citations.map((citation, i) => (
            <CitationBadge key={citation.tag} citation={citation} number={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
