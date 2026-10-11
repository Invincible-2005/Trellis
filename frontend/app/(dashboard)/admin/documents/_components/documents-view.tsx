"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Document, DocumentTagOptions } from "@/lib/api/queries/documents";
import { DocUploadDropzone } from "./doc-upload-dropzone";
import { DocumentsTable } from "./documents-table";

interface DocumentsViewProps {
  documents: Document[];
  tagOptions: DocumentTagOptions;
  /** From the Roles page shortcut: open the upload dialog with this role picked. */
  presetRoleId?: string;
}

export function DocumentsView({ documents, tagOptions, presetRoleId }: DocumentsViewProps) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(!!presetRoleId);
  // Upload only when there's somewhere this user may tag a document (D23)
  const canTag = tagOptions.org || tagOptions.roles.length > 0 || tagOptions.teams.length > 0;

  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open);
    // Drop ?role= so a page reload doesn't reopen the dialog
    if (!open && presetRoleId) router.replace("/admin/documents");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Documents
          </h2>
          <p className="text-sm text-muted-foreground">
            Share policies with everyone, with a role, or with a team. The AI assistant answers
            people only from the documents shared with them.
          </p>
        </div>
        {canTag && (
          <Button onClick={() => setUploadOpen(true)} className="flex items-center gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            Upload &amp; share
          </Button>
        )}
      </div>

      <DocumentsTable documents={documents} tagOptions={tagOptions} />

      <DocUploadDropzone
        open={uploadOpen}
        onOpenChange={handleUploadOpenChange}
        tagOptions={tagOptions}
        presetRoleId={presetRoleId}
      />
    </div>
  );
}
