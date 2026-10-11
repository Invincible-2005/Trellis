"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Document, DocumentTagOptions } from "@/lib/api/queries/documents";
import { DocUploadDropzone } from "./doc-upload-dropzone";
import { DocumentsTable } from "./documents-table";

interface DocumentsViewProps {
  documents: Document[];
  tagOptions: DocumentTagOptions;
}

export function DocumentsView({ documents, tagOptions }: DocumentsViewProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Knowledge Base &amp; Documents
          </h2>
          <p className="text-sm text-muted-foreground">
            Upload organizational policies, SOPs, and team documentation for role-aware RAG search.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="flex items-center gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      <DocumentsTable documents={documents} tagOptions={tagOptions} />

      <DocUploadDropzone
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        tagOptions={tagOptions}
      />
    </div>
  );
}
