'use client';

import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
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
import { zCreateTeamForm } from '@/lib/api/schemas/teams';
import { useTeamListChanges } from './use-team-list-changes';

type CreateTeamFormValues = z.input<typeof zCreateTeamForm>;

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTeamDialog({ open, onOpenChange }: CreateTeamDialogProps) {
  const form = useForm<CreateTeamFormValues>({
    resolver: zodResolver(zCreateTeamForm),
    defaultValues: { name: '' },
  });

  const isSubmitting = form.formState.isSubmitting;
  const { create } = useTeamListChanges();

  // Instant: the dialog closes and a greyed "Creating…" card appears until the server
  // answers; a refusal (e.g. the name is taken) removes it with a toast.
  const onSubmit = form.handleSubmit((values) => {
    create.mutate(values);
    form.reset();
    onOpenChange(false);
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Team
            </DialogTitle>
            <DialogDescription>
              Give your team a name. You can add members after it is created.
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="team-name">Team Name</FieldLabel>
                  <Input
                    {...field}
                    id="team-name"
                    placeholder="e.g. Platform Engineering"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                  />
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
              {isSubmitting ? 'Creating...' : 'Create Team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
