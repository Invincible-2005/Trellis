"use client";

// Comments on one task, with instant post / edit / delete (trellis/12 D50, D60).
// The panel loads the comments when it opens (and again each time it reopens, so
// others' new comments show). Each change saves the list, changes it at once, then
// calls the Server Action; if the server refuses, the saved list comes back with a toast.

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { addComment, deleteComment, editComment, loadComments } from "@/lib/api/actions/tasks";
import type { Comment } from "@/lib/api/queries/tasks";
import { fromAction } from "@/lib/query/action";

export const commentsKey = (taskId: string): QueryKey => ["task-comments", taskId];

/** A comment. `pending` = only in the browser so far (temporary id, buttons hidden). */
export type CommentRow = Comment & { pending?: boolean };

export function useTaskComments(taskId: string) {
  return useQuery({
    queryKey: commentsKey(taskId),
    queryFn: () => fromAction(loadComments(taskId)) as Promise<CommentRow[]>,
    refetchOnMount: "always", // the panel mounts per opening: show what others posted since
  });
}

export function useCommentChanges(taskId: string, myName: string) {
  const queryClient = useQueryClient();
  const key = commentsKey(taskId);

  const save = () => queryClient.getQueryData<CommentRow[]>(key);
  const update = (change: (list: CommentRow[]) => CommentRow[]) =>
    queryClient.setQueryData<CommentRow[]>(key, (list) => change(list ?? []));

  // Same for every change: put the old list back and say why.
  const undo = (error: Error, _variables: unknown, context: { saved?: CommentRow[] } | undefined) => {
    if (context?.saved) queryClient.setQueryData(key, context.saved);
    toast.error(error.message);
  };

  const add = useMutation({
    mutationFn: (content: string) => fromAction(addComment(taskId, { content })),
    // Show a greyed "Sending…" comment with a temporary id until the server answers.
    onMutate: (content) => {
      const saved = save();
      const tempId = crypto.randomUUID();
      const placeholder: CommentRow = {
        id: tempId,
        task_id: taskId,
        author_user_id: "",
        author_name: myName,
        content,
        created_at: new Date().toISOString(),
        edited_at: null,
        can_edit: false,
        can_delete: false,
        pending: true,
      };
      update((list) => [...list, placeholder]);
      return { saved, tempId };
    },
    onError: undo,
    onSuccess: (comment, _content, sent) => {
      update((list) => list.map((c) => (c.id === sent?.tempId ? comment : c)));
    },
  });

  const edit = useMutation({
    mutationFn: ({ comment, content }: { comment: CommentRow; content: string }) =>
      fromAction(editComment(taskId, comment.id, { content })),
    onMutate: ({ comment, content }) => {
      const saved = save();
      update((list) =>
        list.map((c) =>
          c.id === comment.id ? { ...c, content, edited_at: new Date().toISOString() } : c,
        ),
      );
      return { saved };
    },
    onError: undo,
    onSuccess: (updated) => {
      update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
    },
  });

  const remove = useMutation({
    mutationFn: (comment: CommentRow) => fromAction(deleteComment(taskId, comment.id)),
    onMutate: (comment) => {
      const saved = save();
      update((list) => list.filter((c) => c.id !== comment.id));
      return { saved };
    },
    onError: undo,
    onSuccess: () => {
      toast.success("Comment deleted.");
    },
  });

  return { add, edit, remove };
}
