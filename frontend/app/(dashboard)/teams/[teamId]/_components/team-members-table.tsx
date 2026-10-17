'use client';

import React, { useState } from 'react';
import { Shield, Trash2, Users } from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import { useTeamMemberChanges, type MemberRow } from './use-team-member-changes';

interface TeamMembersTableProps {
  teamId: string;
  teamName: string;
  members: MemberRow[];
  canAddMember: boolean;
  onAddMember?: () => void;
}

export function TeamMembersTable({
  teamId,
  teamName,
  members,
  canAddMember,
  onAddMember,
}: TeamMembersTableProps) {
  const { remove } = useTeamMemberChanges(teamId, teamName);
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null);

  // Instant: the row disappears now and comes back with a toast if refused.
  const handleRemove = () => {
    if (memberToRemove) remove.mutate(memberToRemove);
    setMemberToRemove(null);
  };

  if (members.length === 0) {
    return (
      <div className="flex min-h-[200px] w-full flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center bg-card/40">
        <Users className="h-8 w-8 text-muted-foreground/50 mb-2.5" />
        <p className="text-sm font-medium text-foreground">No members yet</p>
        {canAddMember && (
          <p className="mt-1 text-xs text-muted-foreground">
            Use{' '}
            <button
              onClick={onAddMember}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Add member
            </button>{' '}
            to get started.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Email</th>
                <th className="px-5 py-3.5">Team Role</th>
                <th className="px-5 py-3.5">Joined</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((member) => (
                <tr
                  key={member.user_id}
                  className={`hover:bg-muted/30 transition-colors ${member.pending ? 'opacity-60' : ''}`}
                >
                  {/* Name */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-xs shrink-0">
                        {member.name?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <span className="font-medium text-foreground">{member.name}</span>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">{member.email}</td>

                  {/* Team Role */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                      <Shield className="h-3 w-3" />
                      {member.role_name}
                    </span>
                  </td>

                  {/* Joined date */}
                  <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(member.joined_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>

                  {/* Remove button — only when removable; "Adding…" until the server confirms */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {member.pending && <span className="text-xs text-muted-foreground">Adding…</span>}
                    {member.removable && !member.pending && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMemberToRemove(member)}
                        className="text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remove confirmation */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong className="text-foreground">{memberToRemove?.name}</strong> from{' '}
              <strong className="text-foreground">{teamName}</strong>? They will lose access to
              team tasks and documents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
