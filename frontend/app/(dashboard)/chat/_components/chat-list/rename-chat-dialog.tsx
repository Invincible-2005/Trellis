"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ChatSummary } from "@/lib/api/queries/chat";
import { zRenameChatForm } from "@/lib/api/schemas/chat";

const MAX_TITLE = 100;

interface RenameChatDialogProps {
  chat: ChatSummary;
  /** Shows the new name at once; the server's answer comes later (use-chat-changes.ts). */
  onRename: (title: string) => void;
  onClose: () => void;
}

export function RenameChatDialog({ chat, onRename, onClose }: RenameChatDialogProps) {
  // Checks come from the backend's own rules (generated zod schema, trellis/12 D49).
  const form = useForm({
    resolver: zodResolver(zRenameChatForm),
    defaultValues: { title: chat.title ?? "" },
  });

  // `title` is already checked and trimmed.
  const handleSave = form.handleSubmit(({ title }) => {
    if (title !== chat.title) onRename(title);
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Controller
            name="title"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <Input
                  {...field}
                  autoFocus
                  maxLength={MAX_TITLE}
                  aria-label="Chat name"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
