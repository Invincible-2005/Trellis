"use client";

// Sends a chat message through our Next.js stream route and turns the SSE answer
// into state for the chat screen (trellis ticket 09, frontend-scaffold 07).
// Plain fetch + reader: EventSource can't POST, and no library is needed.
// The event shapes mirror backend/app/services/chat.py::stream_turn (SSE events
// aren't in v1.d.ts), so keep them in step with it.

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { components } from "@/lib/api/v1";

export type Citation = components["schemas"]["Citation"];

/** A message on screen. `pending` = the answer is still streaming. */
export interface ChatMessageView {
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  error?: string;
  pending?: boolean;
}

/** status steps (ticket 09). Unknown future steps fall back to "Working…". */
export const STEP_LABELS: Record<string, string> = {
  routing: "Understanding your question…",
  thinking: "Thinking…",
  searching_documents: "Searching documents…",
  looking_up_tasks: "Looking up tasks…",
  looking_up_teams: "Looking up teams…",
  grading_relevance: "Checking the results…",
  rewriting_query: "Searching again…",
  writing_answer: "Writing the answer…",
  verifying_citations: "Checking sources…",
};

type StreamEvent =
  | { event: "status"; data: { step: string } }
  | { event: "tool_call"; data: { tool: string; status: "start" | "end" } }
  | { event: "token"; data: { content: string } }
  | { event: "citations"; data: Citation[] }
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
   * Send `text` to chat `chatId` and stream the answer into `messages`.
   * Returns false when the message was refused before answering (a toast shows why).
   */
  const send = useCallback(
    async (chatId: string, text: string): Promise<boolean> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsAnswering(true);
      setStep(null);
      setMessages((current) => [
        ...current,
        { role: "user", content: text, citations: [] },
        { role: "assistant", content: "", citations: [], pending: true },
      ]);

      try {
        const response = await fetch(`/api/chat/sessions/${chatId}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          // Refused before answering (too long, busy, rate limit…): take the message back
          setMessages((current) => current.slice(0, -2));
          if (response.status === 401) {
            router.push("/sign-in");
            return false;
          }
          const body = await response.json().catch(() => null);
          toast.error(body?.detail?.message ?? "Something went wrong. Please try again.");
          return false;
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
            else if (ev.event === "error") updateAnswer((a) => ({ ...a, error: ev.data.message }));
          }
        }
        return true;
      } catch (err) {
        if (controller.signal.aborted) return true; // the user left or stopped it
        updateAnswer((a) => ({ ...a, error: "The connection was lost. Please try again." }));
        console.error(err);
        return true;
      } finally {
        updateAnswer((a) => ({ ...a, pending: false }));
        setIsAnswering(false);
        setStep(null);
        abortRef.current = null;
      }
    },
    [router, updateAnswer],
  );

  /** Stop listening (e.g. when leaving the page). The backend stops too. */
  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, step, isAnswering, send, stop };
}
