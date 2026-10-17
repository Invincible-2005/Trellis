"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ChatSummary } from "@/lib/api/queries/chat";

interface DeleteChatDialogProps {
  chat: ChatSummary;
  /** Removes the chat from the list at once; the server's answer comes later (use-chat-changes.ts). */
  onDelete: () => void;
  onClose: () => void;
}

export function DeleteChatDialog({ chat, onDelete, onClose }: DeleteChatDialogProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleDelete = () => {
    // The open chat is going away: start a new one right now, before the delete is sent
    if (pathname === `/chat/${chat.id}`) router.push("/chat");
    onDelete();
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{chat.title ?? "New chat"}&rdquo; and everything in it will be deleted for good.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
