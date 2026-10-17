'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Users, AlertTriangle, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Team } from '@/lib/api/queries/teams';
import { CreateTeamDialog } from './create-team-dialog';

interface TeamListProps {
  teams: Team[];
  canCreateTeam: boolean;
}

export function TeamList({ teams, canCreateTeam }: TeamListProps) {
  const [createOpen, setCreateOpen] = useState(false);

  if (teams.length === 0) {
    return (
      <>
        <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center bg-card/40">
          <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="text-sm font-semibold text-foreground">You are not on any team yet</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            Teams organise members around projects or functions. Ask your admin to add you.
          </p>
          {canCreateTeam && (
            <Button onClick={() => setCreateOpen(true)} className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              Create your first team
            </Button>
          )}
        </div>
        <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <Link key={team.id} href={`/teams/${team.id}`} className="group focus:outline-none">
            <Card className="h-full p-5 hover:border-primary/50 hover:shadow-sm transition-all duration-150 group-focus-visible:ring-2 group-focus-visible:ring-ring cursor-pointer">
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
                  {team.name}
                </h3>
                {team.my_role_name ? (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {team.my_role_name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                    Overseeing
                  </Badge>
                )}
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                {/* Member count */}
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {team.member_count === 0
                      ? 'No members yet'
                      : team.member_count === 1
                        ? '1 member'
                        : `${team.member_count} members`}
                  </span>
                </div>

                {/* Task counts */}
                <div className="flex items-center gap-1.5">
                  {team.open_tasks === 0 ? (
                    <span>No tasks yet</span>
                  ) : (
                    <>
                      <span>{team.open_tasks} open {team.open_tasks === 1 ? 'task' : 'tasks'}</span>
                      {team.overdue_tasks > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-destructive font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            {team.overdue_tasks} overdue
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
