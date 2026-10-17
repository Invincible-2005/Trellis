'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';

// The Team filter's options: every team the caller can see (from getTeams on the page).
export interface FilterableTeam {
  id: string;
  name: string;
}

interface TaskFilterToolbarProps {
  teams: FilterableTeam[];
}

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
] as const;

const SELECT_CLASS =
  'rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

export function TaskFilterToolbar({ teams }: TaskFilterToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mine = searchParams.get('mine') !== '0'; // default: mine=1
  const team = searchParams.get('team') ?? '';
  const status = searchParams.get('status') ?? '';
  const overdue = searchParams.get('overdue') === '1';

  const push = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Mine / All toggle */}
      <div className="flex items-center rounded-lg border bg-card p-0.5 gap-0.5">
        <Button
          size="sm"
          variant={mine ? 'default' : 'ghost'}
          onClick={() => push({ mine: '1' })}
          className="h-7 text-xs px-3"
        >
          My tasks
        </Button>
        <Button
          size="sm"
          variant={!mine ? 'default' : 'ghost'}
          onClick={() => push({ mine: '0' })}
          className="h-7 text-xs px-3"
        >
          All tasks
        </Button>
      </div>

      {/* Team filter */}
      {teams.length > 0 && (
        <select
          value={team}
          onChange={(e) => push({ team: e.target.value })}
          className={SELECT_CLASS}
          aria-label="Filter by team"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {/* Status filter */}
      <select
        value={status}
        onChange={(e) => push({ status: e.target.value })}
        className={SELECT_CLASS}
        aria-label="Filter by status"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Overdue toggle */}
      <Button
        size="sm"
        variant={overdue ? 'destructive' : 'outline'}
        onClick={() => push({ overdue: overdue ? null : '1' })}
        className="h-8 text-xs gap-1.5"
      >
        {overdue ? '⚠ Overdue only' : 'Overdue only'}
      </Button>
    </div>
  );
}
