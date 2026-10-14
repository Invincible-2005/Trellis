"use client";

// One chat: the messages and the input box, used by /chat (new chat) and
// /chat/[sessionId]. A new chat is created only when its first message is sent
// (trellis/12 D42); once that first answer has finished, the address becomes
// /chat/<id> (no reload). A change the assistant prepared waits on a Confirm card
// (trellis/12 D22); a card still waiting when the chat is opened is shown again.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";

import type { ChatMessage, ConfirmCard, Mentions } from "@/lib/api/queries/chat";
import { ChatInputBox } from "./chat-input-box";
import { ChatMessageList } from "./chat-message-list";
import { useChatChanges } from "./use-chat-changes";
import { useChatStream } from "./use-chat-stream";

const EXAMPLES = [
  "What's our leave policy?",
  "Which of my tasks are overdue?",
  "How is my team doing?",
];

interface ChatConversationProps {
  /** null on /chat: nothing saved yet. */
  chatId: string | null;
  initialMessages: ChatMessage[];
  /** A Confirm card still waiting from an earlier visit (D45). */
  pendingAction?: ConfirmCard | null;
  mentions: Mentions;
}

export function ChatConversation({ chatId, initialMessages, pendingAction, mentions }: ChatConversationProps) {
  const router = useRouter();
  const chatIdRef = useRef(chatId);
  // Creates the chat with a greyed "New chat" row in the list at once (use-chat-changes.ts)
  const { mutateAsync: createChat } = useChatChanges().create;
  const { messages, step, isAnswering, send, respond, stop } = useChatStream([
    ...initialMessages.map((m) => ({ ...m, citations: m.citations ?? [] })),
    ...(pendingAction
      ? [{ role: "assistant" as const, content: "", citations: [], card: pendingAction, cardState: "waiting" as const }]
      : []),
  ]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Leaving the chat stops the answer (the backend stops too)
  useEffect(() => stop, [stop]);

  // Keep the newest message in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      const isNew = !chatIdRef.current;
      // A new chat is created behind the message, which shows at once (use-chat-stream.ts)
      const accepted = await send(
        chatIdRef.current ??
          (async () => {
            const id = (await createChat()).id;
            chatIdRef.current = id;
            return id;
          }),
        text
      );
      const id = chatIdRef.current;
      if (!id) return false; // creating it failed: the row is gone and the toast shown
      // Only now move a new chat to its own address: changing the URL mid-answer
      // re-renders the page, which would cut the stream off.
      if (isNew) router.replace(`/chat/${id}`);
      router.refresh(); // the chat list: new title, most recent first
      return accepted;
    },
    [createChat, router, send]
  );

  const handleRespond = useCallback(
    async (decision: "confirm" | "cancel") => {
      if (!chatIdRef.current) return;
      await respond(chatIdRef.current, decision);
      router.refresh(); // the chat list order
    },
    [router, respond]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-6 md:pt-6">
          {messages.length === 0 ? (
            <EmptyState onPick={setDraft} />
          ) : (
            <ChatMessageList messages={messages} step={step} isAnswering={isAnswering} onRespond={handleRespond} />
          )}
        </div>
      </div>
      <div className="border-t bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <ChatInputBox
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            disabled={isAnswering}
            mentions={mentions}
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Answers come only from the documents, tasks and teams you can access.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 pt-[12vh] text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Bot className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Ask Trellis</h2>
        <p className="text-sm text-muted-foreground">
          Questions about your policies, tasks and teams. Type @ for a person or / for a team.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
