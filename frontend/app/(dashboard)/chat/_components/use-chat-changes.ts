"use client";

// Every change to your chat list, shown instantly (trellis/12 D50). Same shape as
// admin/members/_components/use-member-changes.ts: save the list, change it at once,
// call the Server Action; a refusal puts the saved list back with a toast. On success the
// server's fresh copy (revalidatePath, or the conversation's refresh after an answer)
// replaces ours. Sending a message isn't here: it streams (use-chat-stream.ts).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createChat, deleteChat, renameChat } from "@/lib/api/actions/chat";
import type { ChatSummary } from "@/lib/api/queries/chat";
import { fromAction } from "@/lib/query/action";

/** Cache key for the chat list (filled by useServerData in ChatSessionList). */
export const CHATS_KEY = ["chats"];

/** A chat in the list. `pending` = only in the browser so far (temporary id, not a link yet). */
export type ChatRow = ChatSummary & { pending?: boolean };

export function useChatChanges() {
  const queryClient = useQueryClient();

  /** The list as it was before a change, to put back if the server refuses. */
  const save = () => ({ chats: queryClient.getQueryData<ChatRow[]>(CHATS_KEY) });
  const updateChats = (change: (list: ChatRow[]) => ChatRow[]) =>
    queryClient.setQueryData<ChatRow[]>(CHATS_KEY, (list) => change(list ?? []));

  // Same for every change: put the old list back and say why.
  const undo = (error: Error, _variables: unknown, saved: { chats?: ChatRow[] } | undefined) => {
    if (saved) queryClient.setQueryData(CHATS_KEY, saved.chats);
    toast.error(error.message);
  };

  const rename = useMutation({
    mutationFn: ({ chat, title }: { chat: ChatSummary; title: string }) =>
      fromAction(renameChat(chat.id, title)),
    onMutate: ({ chat, title }) => {
      const saved = save();
      updateChats((list) => list.map((c) => (c.id === chat.id ? { ...c, title } : c)));
      return saved;
    },
    onError: undo,
    onSuccess: (renamed) => {
      updateChats((list) => list.map((c) => (c.id === renamed.id ? renamed : c)));
    },
  });

  const remove = useMutation({
    mutationFn: (chat: ChatSummary) => fromAction(deleteChat(chat.id)),
    onMutate: (chat) => {
      const saved = save();
      updateChats((list) => list.filter((c) => c.id !== chat.id));
      return saved;
    },
    onError: undo,
  });

  // A chat is created when its first message is sent (trellis/12 D42). Call with
  // mutateAsync: the conversation needs the real id before it can stream the answer.
  const create = useMutation({
    mutationFn: () => fromAction(createChat()),
    // Show a greyed "New chat" row at the top with a temporary id until the server answers.
    onMutate: () => {
      const saved = save();
      const tempId = crypto.randomUUID();
      const now = new Date().toISOString();
      const placeholder: ChatRow = { id: tempId, title: null, created_at: now, last_active_at: now, pending: true };
      updateChats((list) => [placeholder, ...list]); // most recent first, like the server
      return { ...saved, tempId };
    },
    onError: undo,
    onSuccess: (created, _variables, sent) => {
      updateChats((list) => list.map((c) => (c.id === sent?.tempId ? created : c)));
    },
  });

  return { rename, remove, create };
}
