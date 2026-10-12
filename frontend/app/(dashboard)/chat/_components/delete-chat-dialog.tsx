"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { deleteChat } from "@/lib/api/actions/chat";
import type { ChatSummary } from "@/lib/api/queries/chat";

export function DeleteChatDialog({ chat, onClose }: { chat: ChatSummary; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // keep the dialog open until the delete finishes
    setDeleting(true);
    const result = await deleteChat(chat.id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onClose();
    // The open chat is gone: start a new one
    if (pathname === `/chat/${chat.id}`) router.push("/chat");
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
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
