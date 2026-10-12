/**
 * Shown for /chat/<id> when the chat doesn't exist, was deleted, or isn't yours
 * (getChat → null → notFound()). The chat list beside it still works.
 */
import Link from "next/link";
import { MessageSquareOff, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ChatNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <MessageSquareOff className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Chat not found</h2>
        <p className="text-sm text-muted-foreground">
          This chat doesn&apos;t exist or was deleted. Pick another one from your list, or start a new one.
        </p>
      </div>
      <Button asChild>
        <Link href="/chat">
          <Plus />
          New chat
        </Link>
      </Button>
    </div>
  );
}
