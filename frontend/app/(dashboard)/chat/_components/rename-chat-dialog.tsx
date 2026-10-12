"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { renameChat } from "@/lib/api/actions/chat";
import type { ChatSummary } from "@/lib/api/queries/chat";

const MAX_TITLE = 100;

export function RenameChatDialog({ chat, onClose }: { chat: ChatSummary; onClose: () => void }) {
  const [title, setTitle] = useState(chat.title ?? "");
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || trimmed === chat.title) return onClose();
    setSaving(true);
    const result = await renameChat(chat.id, trimmed);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSave} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={title}
            maxLength={MAX_TITLE}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Chat name"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !trimmed}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
