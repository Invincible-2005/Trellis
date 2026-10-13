/**
 * app/(dashboard)/chat/[sessionId]/page.tsx — Route: /chat/[sessionId] (one of your chats)
 *
 * Loads the conversation saved by the backend (questions + final answers with
 * their source badges, and a Confirm card still waiting, trellis/12 D45).
 * Someone else's chat, or a missing one, is a 404.
 */
import { notFound } from "next/navigation";

import { getChat, getMentions } from "@/lib/api/queries/chat";
import { ChatConversation } from "../_components/chat-conversation";

export default async function ChatPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const [chat, mentions] = await Promise.all([getChat(sessionId), getMentions()]);
  if (!chat) notFound();

  return (
    <ChatConversation
      key={chat.id}
      chatId={chat.id}
      initialMessages={chat.messages}
      pendingAction={chat.pending_action}
      mentions={mentions}
    />
  );
}
