/**
 * app/(dashboard)/tasks/page.tsx
 *
 * Server Component — /tasks
 * Default view: My tasks (assigned_to_me: true).
 * Filters (mine, team, status, overdue) come from URL search params.
 * "Create task" button shown only when the caller can assign on ≥1 team.
 */
import React from 'react';

import { getTasks } from '@/lib/api/queries/tasks';
import { getTeams, getTeam } from '@/lib/api/queries/teams';
import { TasksPageClient } from './_components/tasks-page-client';

interface TasksPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function param(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const sp = await searchParams;

  // Default is "My tasks" (mine not explicitly set → default true)
  const assignedToMe = param(sp['mine']) !== '0';
  const teamId = param(sp['team']);
  const status = param(sp['status']) as 'todo' | 'in_progress' | 'done' | 'blocked' | undefined;
  const overdueOnly = param(sp['overdue']) === '1';

  // Fetch tasks and teams in parallel
  const [tasks, teamsData] = await Promise.all([
    getTasks({
      assigned_to_me: assignedToMe || undefined,
      team_id: teamId,
      status,
      overdue_only: overdueOnly || undefined,
    }),
    getTeams(),
  ]);

  // Build the assignable teams list for the Create task dialog
  // Only teams with can_assign_task; fetch each team's members in parallel for the person picker
  const assignableTeams = teamsData.teams.filter((t) => t.can_assign_task);
  const teamDetails = assignableTeams.length > 0
    ? await Promise.all(assignableTeams.map((t) => getTeam(t.id)))
    : [];

  const createTaskTeams = teamDetails.map((td) => ({
    id: td.id,
    name: td.name,
    members: td.members
      .filter((m) => m.assignable)
      .map((m) => ({ user_id: m.user_id, name: m.name })),
  }));

  const canCreateTask = createTaskTeams.length > 0;

  // Team filter lists every team the caller can see, not just teams in the current results
  const filterTeams = teamsData.teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <TasksPageClient
      tasks={tasks}
      filterTeams={filterTeams}
      createTaskTeams={createTaskTeams}
      canCreateTask={canCreateTask}
    />
  );
}
