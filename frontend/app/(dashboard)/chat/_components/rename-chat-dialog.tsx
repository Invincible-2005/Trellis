"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

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
import { renameChat } from "@/lib/api/actions/chat";
import type { ChatSummary } from "@/lib/api/queries/chat";
import { zRenameChatForm } from "@/lib/api/schemas/chat";

const MAX_TITLE = 100;

export function RenameChatDialog({ chat, onClose }: { chat: ChatSummary; onClose: () => void }) {
  // Checks come from the backend's own rules (generated zod schema, trellis/12 D49).
  const form = useForm({
    resolver: zodResolver(zRenameChatForm),
    defaultValues: { title: chat.title ?? "" },
  });
  const saving = form.formState.isSubmitting;

  // `title` is already checked and trimmed.
  const handleSave = form.handleSubmit(async ({ title }) => {
    if (title === chat.title) return onClose();
    const result = await renameChat(chat.id, title);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
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
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
