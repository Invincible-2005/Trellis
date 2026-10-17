'use client';

import React, { useState } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon, ClipboardList } from 'lucide-react';
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
import { zCreateTaskForm } from '@/lib/api/schemas/tasks';
import { useTaskChanges, type TaskRow } from './use-task-changes';

type CreateTaskFormInput = z.input<typeof zCreateTaskForm>;
type CreateTaskFormOutput = z.output<typeof zCreateTaskForm>;

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

export interface AssignableTeam {
  id: string;
  name: string;
  members: { user_id: string; name: string }[];
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Teams the caller can assign tasks on. */
  teams: AssignableTeam[];
  /** When on the team page, this locks the team selector. */
  fixedTeamId?: string;
  /** The task list on this page (tasksKey.page / tasksKey.team): the new task shows there at once. */
  tasksKey: QueryKey;
  /** Whether a new task belongs in that list (e.g. never under "My tasks": you can't assign yourself). */
  accepts?: (task: TaskRow) => boolean;
}

const SELECT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

export function CreateTaskDialog({
  open,
  onOpenChange,
  teams,
  fixedTeamId,
  tasksKey,
  accepts,
}: CreateTaskDialogProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { create } = useTaskChanges(tasksKey, accepts);

  const defaultTeamId = fixedTeamId ?? teams[0]?.id ?? '';

  const form = useForm<CreateTaskFormInput, unknown, CreateTaskFormOutput>({
    resolver: zodResolver(zCreateTaskForm),
    defaultValues: {
      team_id: defaultTeamId,
      title: '',
      description: '',
      assigned_to_user_id: '',
      deadline: undefined,
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  // Watch team_id to update the person picker
  const selectedTeamId = useWatch({ control: form.control, name: 'team_id' });
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const assignableMembers = selectedTeam?.members ?? [];
  const noAssignableMembers = assignableMembers.length === 0 && !!selectedTeamId;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset({
        team_id: defaultTeamId,
        title: '',
        description: '',
        assigned_to_user_id: '',
        deadline: undefined,
      });
    }
    onOpenChange(next);
  };

  // Instant: the dialog closes and a greyed "Saving…" row appears until the server
  // answers; a refusal removes it with a toast (use-task-changes.ts).
  const onSubmit = form.handleSubmit((values: CreateTaskFormOutput) => {
    const team = teams.find((t) => t.id === values.team_id);
    create.mutate({
      input: values,
      teamName: team?.name ?? '',
      assigneeName: team?.members.find((m) => m.user_id === values.assigned_to_user_id)?.name ?? '',
    });
    handleOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Create Task
            </DialogTitle>
            <DialogDescription>
              Assign a task to a team member ranked below you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Team picker — hidden when fixedTeamId is set */}
            {!fixedTeamId && (
              <Controller
                name="team_id"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="task-team">Team</FieldLabel>
                    <select
                      {...field}
                      id="task-team"
                      aria-invalid={fieldState.invalid}
                      className={SELECT_CLASS}
                      onChange={(e) => {
                        field.onChange(e);
                        // Clear assignee when team changes
                        form.setValue('assigned_to_user_id', '');
                      }}
                    >
                      <option value="">Choose a team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            )}

            {/* Title */}
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="task-title">Title</FieldLabel>
                  <Input
                    {...field}
                    id="task-title"
                    placeholder="e.g. Prepare Q3 report"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Description (optional) */}
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="task-desc">Description (optional)</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    id="task-desc"
                    rows={2}
                    placeholder="Add more context…"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Assign to */}
            <Controller
              name="assigned_to_user_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="task-assignee">Assign to</FieldLabel>
                  {noAssignableMembers ? (
                    <p className="text-xs text-muted-foreground italic py-1">
                      No one on this team ranks below you.
                    </p>
                  ) : (
                    <select
                      {...field}
                      id="task-assignee"
                      aria-invalid={fieldState.invalid}
                      className={SELECT_CLASS}
                      disabled={!selectedTeamId}
                    >
                      <option value="">Choose a person</option>
                      {assignableMembers.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Deadline (optional date picker) */}
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
            <Button type="submit" disabled={isSubmitting || noAssignableMembers}>
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
