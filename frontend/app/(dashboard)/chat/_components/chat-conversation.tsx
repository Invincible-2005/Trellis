"use client";

// One chat: the messages and the input box, used by /chat (new chat) and
// /chat/[sessionId]. A new chat is created only when its first message is sent
// (trellis/12 D42); once that first answer has finished, the address becomes
// /chat/<id> (no reload).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { toast } from "sonner";

import { createChat } from "@/lib/api/actions/chat";
import type { ChatMessage, Mentions } from "@/lib/api/queries/chat";
import { ChatInputBox } from "./chat-input-box";
import { ChatMessageList } from "./chat-message-list";
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
  mentions: Mentions;
}

export function ChatConversation({ chatId, initialMessages, mentions }: ChatConversationProps) {
  const router = useRouter();
  const chatIdRef = useRef(chatId);
  const { messages, step, isAnswering, send, stop } = useChatStream(
    initialMessages.map((m) => ({ ...m, citations: m.citations ?? [] }))
  );
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
      let id = chatIdRef.current;
      const isNew = !id;
      if (!id) {
        const created = await createChat();
        if (!created.ok) {
          toast.error(created.message);
          return false;
        }
        id = created.data.id;
        chatIdRef.current = id;
      }
      const accepted = await send(id, text);
      // Only now move a new chat to its own address: changing the URL mid-answer
      // re-renders the page, which would cut the stream off.
      if (isNew) router.replace(`/chat/${id}`);
      router.refresh(); // the chat list: new title, most recent first
      return accepted;
    },
    [router, send]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-6 md:pt-6">
          {messages.length === 0 ? (
            <EmptyState onPick={setDraft} />
          ) : (
            <ChatMessageList messages={messages} step={step} />
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
