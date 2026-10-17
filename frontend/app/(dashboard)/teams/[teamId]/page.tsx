/**
 * app/(dashboard)/teams/[teamId]/page.tsx
 *
 * Server Component — /teams/[teamId]
 * - 404 if the team doesn't exist or the caller can't see it (D13).
 * - Fetches candidates (add member) and tasks in parallel where permitted.
 * - Passes tasks + assignable members for the Tasks section (D28).
 */
import React from 'react';
import { notFound } from 'next/navigation';

import { ApiError } from '@/lib/api/errors';
import { getTeam, getTeamCandidates } from '@/lib/api/queries/teams';
import { getTasks } from '@/lib/api/queries/tasks';
import { TeamDetailClient } from './_components/team-detail-client';

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { teamId } = await params;

  // 404 if team not found or caller has no visibility (D13)
  let team;
  try {
    team = await getTeam(teamId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Fetch candidates (add member) and team tasks in parallel
  const [candidates, tasks] = await Promise.all([
    team.can_add_member ? getTeamCandidates(teamId) : Promise.resolve(null),
    getTasks({ team_id: teamId }),
  ]);

  // Assignable members for Create task dialog (only when can_assign_task)
  const assignableMembers = team.can_assign_task
    ? team.members
        .filter((m) => m.assignable)
        .map((m) => ({ user_id: m.user_id, name: m.name }))
    : [];

  return (
    <TeamDetailClient
      team={team}
      candidates={candidates}
      tasks={tasks}
      assignableMembers={assignableMembers}
    />
  );
}
