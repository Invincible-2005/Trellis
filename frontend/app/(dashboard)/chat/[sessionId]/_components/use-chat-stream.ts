"use client";

// Sends a chat message through our Next.js stream route and turns the SSE answer
// into state for the chat screen (trellis ticket 09, frontend-scaffold 07).
// Plain fetch + reader: EventSource can't POST, and no library is needed.
// The event shapes mirror backend/app/services/chat.py::stream_turn (SSE events
// aren't in v1.d.ts), so keep them in step with it.
//
// Confirm cards (trellis/12 D22, D45): a `confirm` event puts a card on the
// answer. The card's buttons call respond(), which sends { resume } to the same
// route and streams the reply ("Done…" / "Cancelled…") as a new answer.

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { components } from "@/lib/api/v1";

export type Citation = components["schemas"]["Citation"];
export type ConfirmCard = components["schemas"]["ConfirmCard"];

/** waiting = buttons active; sending = a click is on its way; confirmed / cancelled = answered. */
export type CardState = "waiting" | "sending" | "confirmed" | "cancelled";

/** A message on screen. `pending` = the answer is still streaming. */
export interface ChatMessageView {
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  error?: string;
  pending?: boolean;
  card?: ConfirmCard;
  cardState?: CardState;
}

/** status steps (ticket 09). Unknown future steps fall back to "Working…". */
export const STEP_LABELS: Record<string, string> = {
  routing: "Understanding your question…",
  thinking: "Thinking…",
  searching_documents: "Searching documents…",
  looking_up_tasks: "Looking up tasks…",
  reading_comments: "Reading comments…",
  looking_up_teams: "Looking up teams…",
  looking_up_people: "Looking up people…",
  checking_document_access: "Checking document access…",
  grading_relevance: "Checking the results…",
  rewriting_query: "Searching again…",
  writing_answer: "Writing the answer…",
  verifying_citations: "Checking sources…",
  preparing_action: "Checking the change…",
  saving_action: "Saving…",
};

type StreamEvent =
  | { event: "status"; data: { step: string } }
  | { event: "tool_call"; data: { tool: string; status: "start" | "end" } }
  | { event: "token"; data: { content: string } }
  | { event: "citations"; data: Citation[] }
  | { event: "confirm"; data: ConfirmCard }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: { audit_id: string } };

/** One SSE frame ("event: x\ndata: {...}") → event, or null for keep-alive comments. */
function parseFrame(frame: string): StreamEvent | null {
  let event = "";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!event || data.length === 0) return null;
  return { event, data: JSON.parse(data.join("\n")) } as StreamEvent;
}

/** The card still waiting for a click gets `state` (a new message cancels it, D22). */
function settleWaitingCard(messages: ChatMessageView[], state: CardState): ChatMessageView[] {
  return messages.map((m) =>
    m.card && (m.cardState === "waiting" || m.cardState === "sending") ? { ...m, cardState: state } : m
  );
}

/** settleWaitingCard on every message except the newest answer (which may bring its own card). */
function settleOlderCards(messages: ChatMessageView[], state: CardState): ChatMessageView[] {
  return [...settleWaitingCard(messages.slice(0, -1), state), ...messages.slice(-1)];
}

export function useChatStream(initialMessages: ChatMessageView[] = []) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [step, setStep] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /** Change the answer being streamed (always the last message). */
  const updateAnswer = useCallback((change: (answer: ChatMessageView) => ChatMessageView) => {
    setMessages((current) => {
      const last = current[current.length - 1];
      if (last?.role !== "assistant") return current;
      return [...current.slice(0, -1), change(last)];
    });
  }, []);

  /**
   * POST `body` to chat `chatId` and stream the answer into the last message.
   * Returns null when it was refused before answering (status + backend body).
   */
  const stream = useCallback(
    async (chatId: string, body: { message: string } | { resume: "confirm" | "cancel" }) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsAnswering(true);
      setStep(null);

      try {
        const response = await fetch(`/api/chat/sessions/${chatId}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const error = await response.json().catch(() => null);
          return { status: response.status, error } as const;
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value.replace(/\r\n/g, "\n");
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? ""; // the last piece may be incomplete
          for (const frame of frames) {
            const ev = parseFrame(frame);
            if (!ev) continue;
            if (ev.event === "status") setStep(ev.data.step);
            else if (ev.event === "token") updateAnswer((a) => ({ ...a, content: a.content + ev.data.content }));
            else if (ev.event === "citations") updateAnswer((a) => ({ ...a, citations: ev.data }));
            else if (ev.event === "confirm") updateAnswer((a) => ({ ...a, card: ev.data, cardState: "waiting" }));
            else if (ev.event === "error") updateAnswer((a) => ({ ...a, error: ev.data.message }));
          }
        }
        return null;
      } catch (err) {
        if (!controller.signal.aborted) {
          // not the user leaving or stopping it
          updateAnswer((a) => ({ ...a, error: "The connection was lost. Please try again." }));
          console.error(err);
        }
        return null;
      } finally {
        updateAnswer((a) => ({ ...a, pending: false }));
        setIsAnswering(false);
        setStep(null);
        abortRef.current = null;
      }
    },
    [updateAnswer]
  );

  /** Refused before answering (too long, busy, rate limit…): explain with a toast. */
  const explainRefusal = useCallback(
    (status: number, error: { detail?: { message?: string } } | null) => {
      if (status === 401) router.push("/sign-in");
      else toast.error(error?.detail?.message ?? "Something went wrong. Please try again.");
    },
    [router]
  );

  /**
   * Send `text` and stream the answer into `messages`. `chat` is the chat's id, or (for a
   * new chat) a function that creates it: the message shows at once either way, and the
   * chat is created behind it (trellis/12 D42, D50).
   * Returns false when the message was refused before answering (a toast shows why).
   */
  const send = useCallback(
    async (chat: string | (() => Promise<string>), text: string): Promise<boolean> => {
      setMessages((current) => [
        ...current,
        { role: "user", content: text, citations: [] },
        { role: "assistant", content: "", citations: [], pending: true },
      ]);
      setIsAnswering(true); // no second message while the chat is being created
      let chatId: string;
      try {
        chatId = typeof chat === "string" ? chat : await chat();
      } catch {
        // Creating the chat failed (its toast is already shown): take the message back
        setMessages((current) => current.slice(0, -2));
        setIsAnswering(false);
        return false;
      }
      const refused = await stream(chatId, { message: text });
      if (refused) {
        setMessages((current) => current.slice(0, -2)); // take the message back
        explainRefusal(refused.status, refused.error);
        return false;
      }
      // The backend cancelled a card that was still waiting (D22)
      setMessages((current) => settleOlderCards(current, "cancelled"));
      return true;
    },
    [stream, explainRefusal]
  );

  /** The Confirm / Cancel click on the waiting card (D22). The reply streams as a new answer. */
  const respond = useCallback(
    async (chatId: string, decision: "confirm" | "cancel") => {
      setMessages((current) => [
        ...settleWaitingCard(current, "sending"),
        { role: "assistant", content: "", citations: [], pending: true },
      ]);
      const refused = await stream(chatId, { resume: decision });
      if (!refused) {
        setMessages((current) => settleOlderCards(current, decision === "confirm" ? "confirmed" : "cancelled"));
        return;
      }
      if (refused.status === 409 && refused.error?.detail?.code === "nothing_to_confirm") {
        // Already answered (another tab, a second click): the card is no longer waiting
        setMessages((current) => settleWaitingCard(current.slice(0, -1), "cancelled"));
      } else {
        setMessages((current) => settleWaitingCard(current.slice(0, -1), "waiting"));
      }
      explainRefusal(refused.status, refused.error);
    },
    [stream, explainRefusal]
  );

  /** Stop listening (e.g. when leaving the page). The backend stops too. */
  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, step, isAnswering, send, respond, stop };
}
