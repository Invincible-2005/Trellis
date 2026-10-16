/**
 * app/(dashboard)/chat/layout.tsx — the Chat screen's frame (trellis/12 D41)
 *
 * Your chats on the left (a hideable panel; a drawer on phones), the open chat
 * on the right. The list stays put while you switch chats. Fills the height
 * under the header: the dashboard's page padding is cancelled here, for chat only.
 */
import { getChats } from "@/lib/api/queries/chat";
import { ChatSessionList } from "./_components/chat-list/chat-session-list";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const chats = await getChats();

  return (
    <div className="relative -m-4 flex h-[calc(100svh-3.5rem)] overflow-hidden md:-m-6">
      <ChatSessionList chats={chats} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
