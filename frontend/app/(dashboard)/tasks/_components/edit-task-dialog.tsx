'use client';

import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CalendarIcon, Pencil } from 'lucide-react';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { UpdateTaskInput } from '@/lib/api/actions/tasks';
import { zEditTaskForm } from '@/lib/api/schemas/tasks';
import type { Task } from '@/lib/api/queries/tasks';

type EditTaskFormInput = z.input<typeof zEditTaskForm>;
type EditTaskFormOutput = z.output<typeof zEditTaskForm>;

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface EditTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  /** People on the task's team ranked below the caller (same list as Create task). */
  assignableMembers: { user_id: string; name: string }[];
  /** Saves the changed fields instantly (use-task-changes.ts); the dialog closes at once. */
  onSave: (patch: UpdateTaskInput, assigneeName?: string) => void;
}

const SELECT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

export function EditTaskDialog({ open, onOpenChange, task, assignableMembers, onSave }: EditTaskDialogProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Keep the current assignee selectable even if they're no longer on the team,
  // so an unchanged form doesn't silently pick someone else.
  const currentAssigneeMissing =
    !!task.assigned_to_user_id &&
    !assignableMembers.some((m) => m.user_id === task.assigned_to_user_id);

  const initialValues: EditTaskFormInput = {
    title: task.title,
    description: task.description ?? '',
    assigned_to_user_id: task.assigned_to_user_id ?? '',
    deadline: task.deadline ? new Date(task.deadline) : undefined,
  };

  const form = useForm<EditTaskFormInput, unknown, EditTaskFormOutput>({
    resolver: zodResolver(zEditTaskForm),
    defaultValues: initialValues,
  });

  const isSubmitting = form.formState.isSubmitting;

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(initialValues);
    onOpenChange(next);
  };

  const onSubmit = form.handleSubmit((values: EditTaskFormOutput) => {
    // Send only changed fields (D33)
    const patch: UpdateTaskInput = {};

    if (values.title !== task.title) patch.title = values.title;
    if ((values.description ?? '') !== (task.description ?? '')) {
      patch.description = values.description || null;
    }
    if (values.assigned_to_user_id !== task.assigned_to_user_id) {
      patch.assigned_to_user_id = values.assigned_to_user_id;
    }

    // Deadline: values.deadline is already an ISO string or null (zEditTaskForm). The picker
    // works in days, so compare the day, not the exact time the backend stored.
    const dayOf = (iso: string | null | undefined) => (iso ? new Date(iso).toDateString() : null);
    if (dayOf(values.deadline) !== dayOf(task.deadline)) {
      patch.deadline = values.deadline;
    }

    if (Object.keys(patch).length === 0) {
      toast('No changes to save.');
      handleOpenChange(false);
      return;
    }

    // Instant: the row changes now; a refusal puts it back with a toast.
    const assigneeName = assignableMembers.find((m) => m.user_id === patch.assigned_to_user_id)?.name;
    onSave(patch, assigneeName);
    handleOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Task
            </DialogTitle>
            <DialogDescription>
              Update task details. Only changed fields are saved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Team (read-only display) */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Team</label>
              <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {task.team_name}
              </div>
            </div>

            {/* Title */}
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-task-title">Title</FieldLabel>
                  <Input
                    {...field}
                    id="edit-task-title"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Description */}
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-task-desc">Description (optional)</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    id="edit-task-desc"
                    rows={2}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Assign to (reassign, D33) */}
            <Controller
              name="assigned_to_user_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="edit-task-assignee">Assign to</FieldLabel>
                  <select
                    {...field}
                    id="edit-task-assignee"
                    aria-invalid={fieldState.invalid}
                    className={SELECT_CLASS}
                  >
                    <option value="">Choose a person</option>
                    {currentAssigneeMissing && (
                      <option value={task.assigned_to_user_id ?? ''}>
                        {task.assigned_to_name} (no longer on this team)
                      </option>
                    )}
                    {assignableMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Deadline */}
            <Controller
              name="deadline"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Deadline (optional)</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-w-0 flex-1 justify-start text-left font-normal text-sm gap-2"
                        >
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          {field.value
                            ? formatDate(field.value as Date)
                            : <span className="text-muted-foreground">Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-3">
                          <input
                            type="date"
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            value={field.value ? formatDateForInput(field.value as Date) : ''}
                            onChange={(e) => {
                              if (e.target.value) {
                                field.onChange(new Date(e.target.value + 'T00:00:00'));
                              } else {
                                field.onChange(undefined);
                              }
                              setCalendarOpen(false);
                            }}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => field.onChange(undefined)}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
