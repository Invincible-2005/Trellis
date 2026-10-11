"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Shield,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { deleteDocument, getDocumentStatus } from "@/lib/api/actions/documents";
import type { Document, DocumentTagOptions } from "@/lib/api/queries/documents";

interface DocumentsTableProps {
  documents: Document[];
  tagOptions: DocumentTagOptions;
}

export function DocumentsTable({ documents: initialDocuments, tagOptions }: DocumentsTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [docs, setDocs] = useState<Document[]>(initialDocuments);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync state if initialDocuments changes from server
  useEffect(() => {
    setDocs(initialDocuments);
  }, [initialDocuments]);

  // Polling for documents currently in 'processing' status
  useEffect(() => {
    const processingIds = docs.filter((d) => d.status === "processing").map((d) => d.id);
    if (processingIds.length === 0) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      let anyStatusChanged = false;

      const updates = await Promise.all(
        processingIds.map(async (id) => {
          const res = await getDocumentStatus(id);
          if (res.ok && res.data.status !== "processing") {
            anyStatusChanged = true;
            return res.data;
          }
          return null;
        })
      );

      if (!isMounted) return;

      if (anyStatusChanged) {
        setDocs((prev) =>
          prev.map((doc) => {
            const updated = updates.find((u) => u && u.id === doc.id);
            return updated ?? doc;
          })
        );
        startTransition(() => {
          router.refresh();
        });
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [docs, router]);

  // Helpers
  const getScopeBadge = (doc: Document) => {
    if (doc.scope_type === "org") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
          <Building2 className="h-3 w-3" />
          Whole Organization
        </span>
      );
    }
    if (doc.scope_type === "role") {
      const roleName = tagOptions.roles?.find((r) => r.id === doc.role_id)?.name;
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
          <Shield className="h-3 w-3" />
          {roleName ? `Role: ${roleName}` : "Role"}
        </span>
      );
    }
    if (doc.scope_type === "team") {
      const teamName = tagOptions.teams?.find((t) => t.id === doc.team_id)?.name;
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Users className="h-3 w-3" />
          {teamName ? `Team: ${teamName}` : "Team"}
        </span>
      );
    }
    return null;
  };

  const getStatusBadge = (doc: Document) => {
    if (doc.status === "processing") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Indexing...
        </span>
      );
    }
    if (doc.status === "ready") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          Ready
          {doc.chunk_count !== null && doc.chunk_count !== undefined && (
            <span className="text-[10px] opacity-75">({doc.chunk_count} chunks)</span>
          )}
        </span>
      );
    }
    if (doc.status === "failed") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertCircle className="h-3 w-3" />
                Failed
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              {doc.error_message || "Indexing failed. Please check the document and try again."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return null;
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteDocument(docToDelete.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Document deleted successfully.");
      setDocs((prev) => prev.filter((d) => d.id !== docToDelete.id));
      setDocToDelete(null);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      toast.error("Failed to delete document.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (docs.length === 0) {
    return (
      <div className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center bg-card/40">
        <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <h3 className="text-sm font-semibold text-foreground">No documents uploaded yet</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          Upload policy manuals, team guidelines, or SOPs so that the AI assistant can reference them.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Document</th>
                <th className="px-5 py-3.5">Scope / Tag</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Uploaded</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                  {/* Title & Type */}
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{doc.title}</span>
                        <span className="rounded bg-secondary px-1.5 py-0.2 text-[10px] font-mono text-secondary-foreground uppercase">
                          {doc.file_type}
                        </span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {doc.description}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Scope Tag */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {getScopeBadge(doc)}
                  </td>

                  {/* Status Badge */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {getStatusBadge(doc)}
                  </td>

                  {/* Upload Date */}
                  <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(doc.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {doc.file_url && (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="View file"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {doc.deletable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDocToDelete(doc)}
                          className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete document"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{docToDelete?.title}</strong>? This will remove the document and all indexed vector embeddings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDocToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
