'use client';

import React, { useState } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { AlertTriangle, Inbox, MessageSquare, Pencil, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TaskStatus } from '@/lib/api/queries/tasks';
import { CommentsPanel } from './comments-panel';
import { EditTaskDialog } from './edit-task-dialog';
import { SubmissionsDialog } from './submissions-dialog';
import type { AssignableTeam } from './create-task-dialog';
import { useTaskChanges, type TaskRow } from './use-task-changes';

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
};

const STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const SELECT_CLASS =
  'rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

// ─── Deadline cell ──────────────────────────────────────────────────────────────
function DeadlineCell({ deadline, overdue }: { deadline?: string | null; overdue: boolean }) {
  if (!deadline) return <span className="text-muted-foreground text-xs">—</span>;

  const label = new Date(deadline).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {label}
        <Badge className="ml-0.5 text-[10px] px-1 py-0 bg-destructive/10 text-destructive border-0">
          Overdue
        </Badge>
      </span>
    );
  }

  return <span className="text-xs text-foreground">{label}</span>;
}

// ─── Status cell ────────────────────────────────────────────────────────────────
// The value comes from the shared list, which changes at once and rolls back if refused.
function StatusCell({ task, onChange }: { task: TaskRow; onChange: (status: TaskStatus) => void }) {
  if (!task.can_change_status || task.pending) {
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[task.status]}`}>
        {STATUS_LABELS[task.status]}
      </span>
    );
  }

  return (
    <select
      value={task.status}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      className={SELECT_CLASS}
      aria-label="Change task status"
    >
      {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

// ─── Main table ─────────────────────────────────────────────────────────────────
interface TaskDataTableProps {
  tasks: TaskRow[];
  /** The cache key of this list (tasksKey.page / tasksKey.team), for instant changes. */
  tasksKey: QueryKey;
  hideTeam?: boolean;
  /** Teams the caller can assign on, with their assignable members (same list as Create task). */
  assignableTeams: AssignableTeam[];
}

export function TaskDataTable({ tasks, tasksKey, hideTeam = false, assignableTeams }: TaskDataTableProps) {
  const { changeStatus, edit, remove } = useTaskChanges(tasksKey);
  const [taskToDelete, setTaskToDelete] = useState<TaskRow | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<TaskRow | null>(null);
  const [taskForHandIns, setTaskForHandIns] = useState<TaskRow | null>(null);
  const [taskForComments, setTaskForComments] = useState<TaskRow | null>(null);

  // Instant: the row disappears now and comes back with a toast if refused.
  const handleDelete = () => {
    if (taskToDelete) remove.mutate(taskToDelete);
    setTaskToDelete(null);
  };

  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No tasks here yet.</p>
    );
  }

  return (
    <>
      <div className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Title</th>
                {!hideTeam && <th className="px-5 py-3.5">Team</th>}
                <th className="px-5 py-3.5">Assigned to</th>
                <th className="px-5 py-3.5">Deadline</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className={`hover:bg-muted/30 transition-colors align-top ${task.pending ? 'opacity-60' : ''}`}
                >
                  {/* Title + description */}
                  <td className="px-5 py-3.5 max-w-[280px]">
                    <p className="font-medium text-foreground leading-snug">{task.title}</p>
                    {task.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {task.description}
                      </p>
                    )}
                  </td>

                  {/* Team (hidden on team page) */}
                  {!hideTeam && (
                    <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {task.team_name}
                    </td>
                  )}

                  {/* Assigned to */}
                  <td className="px-5 py-3.5 text-xs text-foreground whitespace-nowrap">
                    {task.assigned_to_name}
                  </td>

                  {/* Deadline */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <DeadlineCell deadline={task.deadline} overdue={task.overdue} />
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <StatusCell task={task} onChange={(status) => changeStatus.mutate({ task, status })} />
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {task.pending ? (
                      <span className="text-xs text-muted-foreground">Saving…</span>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        {/* Comments (D60): everyone who can see the task */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTaskForComments(task)}
                          className="text-xs text-muted-foreground hover:text-foreground gap-1"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Comments{task.comment_count ? ` (${task.comment_count})` : ''}
                        </Button>
                        {/* Hand-ins (D59): only the person doing the task and their managers */}
                        {task.can_view_submissions && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTaskForHandIns(task)}
                            className="text-xs text-muted-foreground hover:text-foreground gap-1"
                          >
                            <Inbox className="h-3.5 w-3.5" />
                            Hand-ins{task.submission_count ? ` (${task.submission_count})` : ''}
                          </Button>
                        )}
                        {task.can_edit && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTaskToEdit(task)}
                              className="text-xs text-muted-foreground hover:text-foreground gap-1"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTaskToDelete(task)}
                              className="text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive gap-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog
        open={!!taskToDelete}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete{' '}
              <strong className="text-foreground">
                &quot;{taskToDelete?.title}&quot;
              </strong>
              ? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog: saving closes it at once and updates the row (instant) */}
      {taskToEdit && (
        <EditTaskDialog
          open={!!taskToEdit}
          onOpenChange={(open) => !open && setTaskToEdit(null)}
          task={taskToEdit}
          assignableMembers={
            assignableTeams.find((t) => t.id === taskToEdit.team_id)?.members ?? []
          }
          onSave={(patch, assigneeName) => edit.mutate({ task: taskToEdit, patch, assigneeName })}
        />
      )}

      {/* Comments panel (mounted per task, so it loads fresh each time it opens) */}
      {taskForComments && (
        <CommentsPanel
          open={!!taskForComments}
          onOpenChange={(open) => !open && setTaskForComments(null)}
          task={taskForComments}
        />
      )}

      {/* Hand-ins dialog (mounted per task, so it loads fresh each time) */}
      {taskForHandIns && (
        <SubmissionsDialog
          open={!!taskForHandIns}
          onOpenChange={(open) => !open && setTaskForHandIns(null)}
          task={taskForHandIns}
        />
      )}
    </>
  );
}
