/**
 * app/(dashboard)/chat/page.tsx — Route: /chat (a new chat)
 *
 * Nothing is saved until the first message is sent (trellis/12 D42): then the
 * chat is created and the address becomes /chat/<id> without a reload.
 * The chat screen's parts live with /chat/[sessionId]; this is the same screen, empty.
 */
import { getMentions } from "@/lib/api/queries/chat";
import { ChatConversation } from "./[sessionId]/_components/chat-conversation";

export default async function NewChatPage() {
  const mentions = await getMentions();
  return <ChatConversation chatId={null} initialMessages={[]} mentions={mentions} />;
}
