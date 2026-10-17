'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';

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
import { deleteTask, updateTask } from '@/lib/api/actions/tasks';
import type { Task, TaskStatus } from '@/lib/api/queries/tasks';
import { EditTaskDialog } from './edit-task-dialog';

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

  const label = new Date(deadline).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
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
function StatusCell({ task }: { task: Task }) {
  const [pending, setPending] = useState(false);

  if (!task.can_change_status) {
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[task.status]}`}>
        {STATUS_LABELS[task.status]}
      </span>
    );
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const status = e.target.value as TaskStatus;
    setPending(true);
    try {
      const res = await updateTask(task.id, { status });
      if (!res.ok) toast.error(res.message);
    } catch {
      toast.error('Failed to update status.');
    } finally {
      setPending(false);
    }
  };

  return (
    <select
      defaultValue={task.status}
      onChange={handleChange}
      disabled={pending}
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
  tasks: Task[];
  hideTeam?: boolean;
}

export function TaskDataTable({ tasks, hideTeam = false }: TaskDataTableProps) {
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  const handleDelete = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteTask(taskToDelete.id, taskToDelete.team_id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`"${taskToDelete.title}" deleted.`);
      setTaskToDelete(null);
    } catch {
      toast.error('Failed to delete task.');
    } finally {
      setIsDeleting(false);
    }
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
                <tr key={task.id} className="hover:bg-muted/30 transition-colors align-top">
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
                    <StatusCell task={task} />
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
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
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      {taskToEdit && (
        <EditTaskDialog
          open={!!taskToEdit}
          onOpenChange={(open) => !open && setTaskToEdit(null)}
          task={taskToEdit}
        />
      )}
    </>
  );
}
