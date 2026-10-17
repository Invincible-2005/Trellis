'use client';

import React, { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
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
import { createTask } from '@/lib/api/actions/tasks';
import { zCreateTaskForm } from '@/lib/api/schemas/tasks';

type CreateTaskFormInput = z.input<typeof zCreateTaskForm>;
type CreateTaskFormOutput = z.output<typeof zCreateTaskForm>;

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
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
}

const SELECT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

export function CreateTaskDialog({
  open,
  onOpenChange,
  teams,
  fixedTeamId,
}: CreateTaskDialogProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

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

  const onSubmit = form.handleSubmit(async (values: CreateTaskFormOutput) => {
    const result = await createTask(values);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success('Task created.');
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
                          className="w-full justify-start text-left font-normal text-sm gap-2"
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
