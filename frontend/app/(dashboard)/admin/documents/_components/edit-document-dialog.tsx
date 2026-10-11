"use client";

import React, { useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDocument, type UpdateDocumentInput } from "@/lib/api/actions/documents";
import type { Document, DocumentTagOptions } from "@/lib/api/queries/documents";
import { TagScopeSelect } from "./tag-scope-select";

type ScopeType = "org" | "role" | "team";

interface EditDocumentDialogProps {
  /** A row with deletable: true (trellis/12 D39: you may edit what you may delete). */
  document: Document;
  tagOptions: DocumentTagOptions;
  onClose: () => void;
}

export function EditDocumentDialog({ document, tagOptions, onClose }: EditDocumentDialogProps) {
  const currentTargetId = document.role_id ?? document.team_id ?? undefined;

  const [title, setTitle] = useState(document.title);
  const [description, setDescription] = useState(document.description ?? "");
  const [scopeType, setScopeType] = useState<ScopeType>(document.scope_type);
  const [targetId, setTargetId] = useState<string | undefined>(currentTargetId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // While indexing, the backend refuses a new audience (its search pieces are still being written).
  const isProcessing = document.status === "processing";

  const audienceChanged = scopeType !== document.scope_type || targetId !== currentTargetId;
  const changed =
    title.trim() !== document.title ||
    description.trim() !== (document.description ?? "") ||
    audienceChanged;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) {
      toast.error("Document title must be at least 2 characters.");
      return;
    }

    // Send only what changed, so a rename never touches the audience.
    const input: UpdateDocumentInput = {};
    if (title.trim() !== document.title) input.title = title.trim();
    if (description.trim() !== (document.description ?? "")) input.description = description.trim();
    if (audienceChanged) {
      input.scope_type = scopeType;
      input.role_id = scopeType === "role" ? targetId : undefined;
      input.team_id = scopeType === "team" ? targetId : undefined;
    }

    setIsSubmitting(true);
    try {
      const result = await updateDocument(document.id, input);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        audienceChanged
          ? "Document updated. The new audience applies to the chat right away."
          : "Document updated."
      );
      onClose();
    } catch {
      toast.error("An unexpected error occurred while saving the document.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSave} className="space-y-4">
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
            <div className="space-y-1.5">
              <Label htmlFor="edit-doc-title">Document Title</Label>
              <Input
                id="edit-doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-doc-description">Description (Optional)</Label>
              <Input
                id="edit-doc-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {isProcessing ? (
              <p className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                This document is still being indexed. You can change who sees it once it shows Ready.
              </p>
            ) : (
              <TagScopeSelect
                tagOptions={tagOptions}
                scopeType={scopeType}
                targetId={targetId}
                onScopeChange={(newScope, newTargetId) => {
                  setScopeType(newScope);
                  setTargetId(newTargetId);
                }}
              />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !changed}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
