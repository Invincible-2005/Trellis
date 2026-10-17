/**
 * app/(dashboard)/teams/page.tsx
 *
 * Server Component — /teams
 * Fetches all teams visible to the caller (D13: on team or oversees it).
 * The "Create team" button + dialog are managed inside TeamList (client component).
 */
import React from 'react';
import { getTeams } from '@/lib/api/queries/teams';
import { TeamList } from './_components/team-list';

export default async function TeamsPage() {
  const { can_create_team, teams } = await getTeams();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Teams</h1>
        <p className="text-sm text-muted-foreground">
          Teams you are a member of or oversee in your organisation.
        </p>
      </div>

      {/* Card grid — Create button + dialog are inside TeamList */}
      <TeamList teams={teams} canCreateTeam={can_create_team} />
    </div>
  );
}