/**
 * app/(dashboard)/teams/page.tsx
 *
 * Server Component — /teams
 * Fetches all teams visible to the caller (D13: on team or oversees it).
 * The heading, "Create team" button and dialog live inside TeamList (client component).
 */
import React from 'react';
import { getTeams } from '@/lib/api/queries/teams';
import { TeamList } from './_components/team-list';

export default async function TeamsPage() {
  const { can_create_team, teams } = await getTeams();

  return <TeamList teams={teams} canCreateTeam={can_create_team} />;
}