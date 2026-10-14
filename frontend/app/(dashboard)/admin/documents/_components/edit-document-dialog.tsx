"use client";

import React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { UpdateDocumentInput } from "@/lib/api/actions/documents";
import type { Document, DocumentTagOptions } from "@/lib/api/queries/documents";
import { zEditDocumentForm } from "@/lib/api/schemas/documents";
import { TagScopeSelect } from "./tag-scope-select";

interface EditDocumentDialogProps {
  /** A row with deletable: true (trellis/12 D39: you may edit what you may delete). */
  document: Document;
  tagOptions: DocumentTagOptions;
  /** Shows the change at once; the server's answer comes later (use-document-changes.ts). */
  onSave: (input: UpdateDocumentInput) => void;
  onClose: () => void;
}

export function EditDocumentDialog({ document, tagOptions, onSave, onClose }: EditDocumentDialogProps) {
  const currentTargetId = document.role_id ?? document.team_id ?? undefined;

  // Checks come from the backend's own rules (generated zod schema, trellis/12 D49).
  const form = useForm({
    resolver: zodResolver(zEditDocumentForm),
    defaultValues: {
      title: document.title,
      description: document.description ?? "",
      scope_type: document.scope_type,
      role_id: document.role_id ?? undefined,
      team_id: document.team_id ?? undefined,
    },
  });
  const [title, description, scopeType, roleId, teamId] = useWatch({
    control: form.control,
    name: ["title", "description", "scope_type", "role_id", "team_id"],
  });
  const targetId = (scopeType === "role" ? roleId : scopeType === "team" ? teamId : undefined) ?? undefined;
  const targetError = form.formState.errors.role_id ?? form.formState.errors.team_id;

  // While indexing, the backend refuses a new audience (its search pieces are still being written).
  const isProcessing = document.status === "processing";

  const audienceChanged = scopeType !== document.scope_type || targetId !== currentTargetId;
  const changed =
    title.trim() !== document.title ||
    (description ?? "").trim() !== (document.description ?? "") ||
    audienceChanged;

  // `values` is already checked (title trimmed, a role or team picked for that audience).
  const handleSave = form.handleSubmit((values) => {
    // Send only what changed, so a rename never touches the audience.
    const input: UpdateDocumentInput = {};
    if (values.title !== document.title) input.title = values.title;
    const newDescription = (values.description ?? "").trim();
    if (newDescription !== (document.description ?? "")) input.description = newDescription;
    if (audienceChanged) {
      input.scope_type = values.scope_type;
      input.role_id = values.scope_type === "role" ? values.role_id : undefined;
      input.team_id = values.scope_type === "team" ? values.team_id : undefined;
    }

    onSave(input);
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Edit Document
            </DialogTitle>
            <DialogDescription>
              Change the name, description or who can see it. To replace the file itself, delete
              this document and upload the new file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-1.5">
                  <FieldLabel htmlFor="edit-doc-title">Document Title</FieldLabel>
                  <Input {...field} id="edit-doc-title" maxLength={200} aria-invalid={fieldState.invalid} />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-1.5">
                  <FieldLabel htmlFor="edit-doc-description">Description (Optional)</FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="edit-doc-description"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {isProcessing ? (
              <p className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                This document is still being indexed. You can change who sees it once it shows Ready.
              </p>
            ) : (
              <div className="space-y-1.5">
                <TagScopeSelect
                  tagOptions={tagOptions}
                  scopeType={scopeType ?? document.scope_type}
                  targetId={targetId}
                  onScopeChange={(newScope, newTargetId) => {
                    form.setValue("scope_type", newScope);
                    form.setValue("role_id", newScope === "role" ? newTargetId : undefined);
                    form.setValue("team_id", newScope === "team" ? newTargetId : undefined);
                    form.clearErrors(["role_id", "team_id"]);
                  }}
                />
                <FieldError errors={[targetError]} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!changed}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
