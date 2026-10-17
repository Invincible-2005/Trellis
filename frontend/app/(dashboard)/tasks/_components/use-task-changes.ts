"use client";

// Every task change, shown instantly (trellis/12 D50), on /tasks and the team page.
// Each one saves the current list, changes it at once, then calls the Server Action.
// If the server refuses, the saved list comes back with a toast. On success the
// server's fresh copy (the action's revalidatePath) replaces ours by itself.

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createTask,
  deleteTask,
  updateTask,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/lib/api/actions/tasks";
import type { Task, TaskStatus } from "@/lib/api/queries/tasks";
import { fromAction } from "@/lib/query/action";

/** Cache key for a task list: the /tasks view with its filters, or one team's tasks. */
export const tasksKey = {
  page: (filters: string) => ["tasks", "page", filters] as QueryKey,
  team: (teamId: string) => ["tasks", "team", teamId] as QueryKey,
};

/** A task row. `pending` = only in the browser so far (temporary id, buttons disabled). */
export type TaskRow = Task & { pending?: boolean };

/** Overdue the way the backend counts it: a deadline in the past and not done. */
function isOverdue(deadline: string | null | undefined, status: TaskStatus): boolean {
  return !!deadline && status !== "done" && new Date(deadline) < new Date();
}

/**
 * @param key   the list this page shows (tasksKey.page / tasksKey.team)
 * @param accepts whether a newly created task belongs in that list (e.g. not under "My tasks")
 */
export function useTaskChanges(key: QueryKey, accepts: (task: TaskRow) => boolean = () => true) {
  const queryClient = useQueryClient();

  const save = () => queryClient.getQueryData<TaskRow[]>(key);
  const update = (change: (list: TaskRow[]) => TaskRow[]) =>
    queryClient.setQueryData<TaskRow[]>(key, (list) => change(list ?? []));
  const replace = (task: Task) => update((list) => list.map((t) => (t.id === task.id ? task : t)));

  // Same for every change: put the old list back and say why.
  const undo = (error: Error, _variables: unknown, context: { saved?: TaskRow[] } | undefined) => {
    if (context?.saved) queryClient.setQueryData(key, context.saved);
    toast.error(error.message);
  };

  const changeStatus = useMutation({
    mutationFn: ({ task, status }: { task: TaskRow; status: TaskStatus }) =>
      fromAction(updateTask(task.id, { status })),
    onMutate: ({ task, status }) => {
      const saved = save();
      update((list) =>
        list.map((t) =>
          t.id === task.id ? { ...t, status, overdue: isOverdue(t.deadline, status) } : t,
        ),
      );
      return { saved };
    },
    onError: undo,
    onSuccess: replace,
  });

  const edit = useMutation({
    mutationFn: ({ task, patch }: { task: TaskRow; patch: UpdateTaskInput; assigneeName?: string }) =>
      fromAction(updateTask(task.id, patch)),
    onMutate: ({ task, patch, assigneeName }) => {
      const saved = save();
      update((list) =>
        list.map((t) => {
          if (t.id !== task.id) return t;
          const next: TaskRow = { ...t };
          if (patch.title !== undefined && patch.title !== null) next.title = patch.title;
          if (patch.description !== undefined) next.description = patch.description;
          if (patch.deadline !== undefined) next.deadline = patch.deadline;
          if (patch.assigned_to_user_id) {
            next.assigned_to_user_id = patch.assigned_to_user_id;
            next.assigned_to_name = assigneeName ?? next.assigned_to_name;
          }
          next.overdue = isOverdue(next.deadline, next.status);
          return next;
        }),
      );
      return { saved };
    },
    onError: undo,
    onSuccess: (updated) => {
      replace(updated);
      toast.success("Task updated.");
    },
  });

  const remove = useMutation({
    mutationFn: (task: TaskRow) => fromAction(deleteTask(task.id, task.team_id)),
    onMutate: (task) => {
      const saved = save();
      update((list) => list.filter((t) => t.id !== task.id));
      return { saved };
    },
    onError: undo,
    onSuccess: (_result, task) => {
      toast.success(`"${task.title}" deleted.`);
    },
  });

  const create = useMutation({
    mutationFn: ({ input }: { input: CreateTaskInput; teamName: string; assigneeName: string }) =>
      fromAction(createTask(input)),
    // Show a greyed "Saving…" row with a temporary id until the server answers.
    onMutate: ({ input, teamName, assigneeName }) => {
      const saved = save();
      const tempId = crypto.randomUUID();
      const placeholder: TaskRow = {
        id: tempId,
        team_id: input.team_id,
        team_name: teamName,
        title: input.title,
        description: input.description ?? null,
        assigned_to_user_id: input.assigned_to_user_id,
        assigned_to_name: assigneeName,
        created_by_name: "You",
        deadline: input.deadline ?? null,
        status: "todo",
        overdue: isOverdue(input.deadline, "todo"),
        can_edit: false,
        can_change_status: false,
        can_submit: false,
        can_view_submissions: false,
        submission_count: null,
        comment_count: 0,
        pending: true,
      };
      if (accepts(placeholder)) update((list) => [...list, placeholder]);
      return { saved, tempId };
    },
    onError: undo,
    onSuccess: (task, _variables, sent) => {
      update((list) => list.map((t) => (t.id === sent?.tempId ? task : t)));
      toast.success("Task created.");
    },
  });

  return { changeStatus, edit, remove, create };
}
