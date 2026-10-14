"use client";

// Every change on Admin → Documents, shown instantly (trellis/12 D50). Same shape as
// admin/members/_components/use-member-changes.ts: save the list, change it at once,
// call the Server Action; a refusal puts the saved list back with a toast. On success the
// server's fresh copy (revalidatePath) replaces ours, like the "Indexing…" check's refresh().
// Upload: the file travels to UploadThing first (step 1, can't be skipped); only step 2's
// Save (registering it with our server) is instant here.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createDocument,
  deleteDocument,
  updateDocument,
  type CreateDocumentInput,
  type UpdateDocumentInput,
} from "@/lib/api/actions/documents";
import type { Document } from "@/lib/api/queries/documents";
import { fromAction } from "@/lib/query/action";

/** Cache key for this page's list (filled by useServerData in DocumentsView). */
export const DOCUMENTS_KEY = ["documents"];

/** A document row. `pending` = only in the browser so far (temporary id, no Edit / Delete). */
export type DocumentRow = Document & { pending?: boolean };

export function useDocumentChanges() {
  const queryClient = useQueryClient();

  /** The list as it was before a change, to put back if the server refuses. */
  const save = () => ({ documents: queryClient.getQueryData<Document[]>(DOCUMENTS_KEY) });
  const updateDocuments = (change: (list: Document[]) => Document[]) =>
    queryClient.setQueryData<Document[]>(DOCUMENTS_KEY, (list) => change(list ?? []));

  // Same for every change: put the old list back and say why.
  const undo = (error: Error, _variables: unknown, saved: { documents?: Document[] } | undefined) => {
    if (saved) queryClient.setQueryData(DOCUMENTS_KEY, saved.documents);
    toast.error(error.message);
  };

  const remove = useMutation({
    mutationFn: (document: Document) => fromAction(deleteDocument(document.id)),
    onMutate: (document) => {
      const saved = save();
      updateDocuments((list) => list.filter((d) => d.id !== document.id));
      return saved;
    },
    onError: undo,
    onSuccess: () => {
      toast.success("Document deleted.");
    },
  });

  const edit = useMutation({
    mutationFn: ({ document, input }: { document: Document; input: UpdateDocumentInput }) =>
      fromAction(updateDocument(document.id, input)),
    // Only the fields in `input` change; a new audience brings its role / team with it.
    onMutate: ({ document, input }) => {
      const saved = save();
      const audienceChanged = input.scope_type !== undefined;
      updateDocuments((list) =>
        list.map((d) =>
          d.id !== document.id
            ? d
            : {
                ...d,
                title: input.title ?? d.title,
                description: input.description !== undefined ? input.description : d.description,
                scope_type: input.scope_type ?? d.scope_type,
                role_id: audienceChanged ? (input.role_id ?? null) : d.role_id,
                team_id: audienceChanged ? (input.team_id ?? null) : d.team_id,
              },
        ),
      );
      return saved;
    },
    onError: undo,
    onSuccess: (updated, { input }) => {
      updateDocuments((list) => list.map((d) => (d.id === updated.id ? updated : d)));
      toast.success(
        input.scope_type !== undefined
          ? "Document updated. The new audience applies to the chat right away."
          : "Document updated.",
      );
    },
  });

  const create = useMutation({
    mutationFn: (input: CreateDocumentInput) => fromAction(createDocument(input)),
    // Show a greyed "Saving…" row with a temporary id until the server answers.
    onMutate: (input) => {
      const saved = save();
      const tempId = crypto.randomUUID();
      const placeholder: DocumentRow = {
        id: tempId,
        title: input.title,
        description: input.description ?? null,
        file_url: input.file_url,
        file_type: input.file_type,
        scope_type: input.scope_type,
        role_id: input.role_id ?? null,
        team_id: input.team_id ?? null,
        uploaded_by_user_id: "",
        status: "processing",
        chunk_count: null,
        error_message: null,
        deletable: false,
        created_at: new Date().toISOString(),
        pending: true,
      };
      updateDocuments((list) => [placeholder, ...list]); // newest first, like the server
      return { ...saved, tempId };
    },
    onError: undo,
    onSuccess: (created, _input, sent) => {
      // Swap the temporary row for the real one (it shows "Indexing…" until it's ready).
      updateDocuments((list) => list.map((d) => (d.id === sent?.tempId ? created : d)));
      toast.success("Document uploaded! Processing and indexing chunks...");
    },
  });

  return { remove, edit, create };
}
