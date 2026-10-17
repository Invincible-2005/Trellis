'use client';

import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
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
import { addTeamMember } from '@/lib/api/actions/teams';
import { zAddTeamMemberRequest } from '@/lib/api/schemas/teams';
import type { TeamCandidates } from '@/lib/api/queries/teams';

type AddMemberFormValues = z.input<typeof zAddTeamMemberRequest>;

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  candidates: TeamCandidates;
}

const SELECT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50';

export function AddMemberDialog({
  open,
  onOpenChange,
  teamId,
  candidates,
}: AddMemberDialogProps) {
  const form = useForm<AddMemberFormValues>({
    resolver: zodResolver(zAddTeamMemberRequest),
    defaultValues: { user_id: '', role_id: '' },
  });

  const isSubmitting = form.formState.isSubmitting;
  const hasNoCandidates = candidates.members.length === 0;

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const selectedMember = candidates.members.find((m) => m.user_id === values.user_id);
    const result = await addTeamMember(teamId, values);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${selectedMember?.name ?? 'Member'} added to the team.`);
    form.reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Add Member
          </DialogTitle>
          <DialogDescription>
            Add an existing organisation member to this team with a role.
          </DialogDescription>
        </DialogHeader>

        {hasNoCandidates ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Everyone in the organisation is already on this team.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              To add someone new to the org, invite them from{' '}
              <span className="font-medium text-foreground">Admin → Members</span> first.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4 py-1">
            {/* Person picker */}
            <Controller
              name="user_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="member-person">Person</FieldLabel>
                  <select
                    {...field}
                    id="member-person"
                    aria-invalid={fieldState.invalid}
                    className={SELECT_CLASS}
                  >
                    <option value="">Choose a person</option>
                    {candidates.members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name} — {m.email}
                      </option>
                    ))}
                  </select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            {/* Role picker */}
            <Controller
              name="role_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="member-role">Role</FieldLabel>
                  <select
                    {...field}
                    id="member-role"
                    aria-invalid={fieldState.invalid}
                    className={SELECT_CLASS}
                  >
                    <option value="">Choose a role</option>
                    {candidates.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

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
                {isSubmitting ? 'Adding...' : 'Add Member'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Footer when no candidates (just a close button) */}
        {hasNoCandidates && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
