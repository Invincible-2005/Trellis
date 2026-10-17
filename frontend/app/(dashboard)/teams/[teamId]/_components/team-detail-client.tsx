'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ClipboardList, Plus, UserPlus, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TeamCandidates, TeamDetail } from '@/lib/api/queries/teams';
import type { Task } from '@/lib/api/queries/tasks';
import { useServerData } from '@/lib/query/use-server-data';
import { TaskDataTable } from '@/app/(dashboard)/tasks/_components/task-data-table';
import { CreateTaskDialog, type AssignableTeam } from '@/app/(dashboard)/tasks/_components/create-task-dialog';
import { tasksKey, type TaskRow } from '@/app/(dashboard)/tasks/_components/use-task-changes';
import { AddMemberDialog } from './add-member-dialog';
import { DeleteTeamButton } from './delete-team-button';
import { TeamMembersTable } from './team-members-table';
import { teamMembersKey, type MemberRow } from './use-team-member-changes';

interface TeamDetailClientProps {
  team: TeamDetail;
  candidates: TeamCandidates | null;
  tasks: Task[];
  assignableMembers: AssignableTeam['members'];
}

export function TeamDetailClient({
  team,
  candidates,
  tasks: serverTasks,
  assignableMembers,
}: TeamDetailClientProps) {
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  // Cached copies of this page's two lists, so changes show at once (D50)
  const membersKey = useMemo(() => teamMembersKey(team.id), [team.id]);
  const taskListKey = useMemo(() => tasksKey.team(team.id), [team.id]);
  const members = useServerData<MemberRow[]>(membersKey, team.members);
  const tasks = useServerData<TaskRow[]>(taskListKey, serverTasks);

  // The create-task dialog expects an AssignableTeam[] — wrap this team
  const createTaskTeams: AssignableTeam[] = team.can_assign_task
    ? [{ id: team.id, name: team.name, members: assignableMembers }]
    : [];

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/teams"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All teams
      </Link>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{team.name}</h1>
            {team.my_role_name ? (
              <Badge variant="secondary">You: {team.my_role_name}</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Overseeing
              </Badge>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {team.member_count === 0
                ? 'No members yet'
                : team.member_count === 1
                  ? '1 member'
                  : `${team.member_count} members`}
            </span>
            {team.open_tasks > 0 && (
              <span className="flex items-center gap-1.5">
                {team.open_tasks} open {team.open_tasks === 1 ? 'task' : 'tasks'}
                {team.overdue_tasks > 0 && (
                  <span className="flex items-center gap-1 text-destructive font-medium">
                    · <AlertTriangle className="h-3.5 w-3.5" />
                    {team.overdue_tasks} overdue
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons — flag-gated (D28) */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {team.can_add_member && candidates && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddMemberOpen(true)}
              className="gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              Add member
            </Button>
          )}
          {team.can_assign_task && (
            <Button
              size="sm"
              onClick={() => setCreateTaskOpen(true)}
              className="gap-1.5"
              disabled={assignableMembers.length === 0}
              title={assignableMembers.length === 0 ? 'No one on this team ranks below you' : undefined}
            >
              <Plus className="h-4 w-4" />
              Create task
            </Button>
          )}
          {team.deletable && (
            <DeleteTeamButton teamId={team.id} teamName={team.name} />
          )}
        </div>
      </div>

      {/* ── Members ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Members
        </h2>
        <TeamMembersTable
          teamId={team.id}
          teamName={team.name}
          members={members}
          canAddMember={team.can_add_member}
          onAddMember={() => setAddMemberOpen(true)}
        />
      </section>

      {/* ── Tasks ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Tasks
        </h2>
        <TaskDataTable tasks={tasks} tasksKey={taskListKey} hideTeam assignableTeams={createTaskTeams} />
      </section>

      {/* ── Dialogs ────────────────────────────────────────────────── */}
      {team.can_add_member && candidates && (
        <AddMemberDialog
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          teamId={team.id}
          teamName={team.name}
          candidates={candidates}
        />
      )}

      {team.can_assign_task && assignableMembers.length > 0 && (
        <CreateTaskDialog
          open={createTaskOpen}
          onOpenChange={setCreateTaskOpen}
          teams={createTaskTeams}
          fixedTeamId={team.id}
          tasksKey={taskListKey}
        />
      )}
    </div>
  );
}
