'use client';

import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, ClipboardList } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Task } from '@/lib/api/queries/tasks';
import { useServerData } from '@/lib/query/use-server-data';
import { TaskDataTable } from './task-data-table';
import { TaskFilterToolbar, type FilterableTeam } from './task-filter-toolbar';
import { CreateTaskDialog, type AssignableTeam } from './create-task-dialog';
import { tasksKey, type TaskRow } from './use-task-changes';

interface TasksPageClientProps {
  tasks: Task[];
  filterTeams: FilterableTeam[];
  createTaskTeams: AssignableTeam[];
  canCreateTask: boolean;
}

export function TasksPageClient({
  tasks: serverTasks,
  filterTeams,
  createTaskTeams,
  canCreateTask,
}: TasksPageClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const searchParams = useSearchParams();

  // One cached list per filter combination; changes show in it at once (D50).
  const filters = searchParams.toString();
  const key = useMemo(() => tasksKey.page(filters), [filters]);
  const tasks = useServerData<TaskRow[]>(key, serverTasks);

  // A new task shows straight away only if it matches the filters on screen.
  // Never under "My tasks": you can't give a task to yourself (D32).
  const accepts = (task: TaskRow) => {
    const team = searchParams.get('team');
    const status = searchParams.get('status');
    return (
      searchParams.get('mine') === '0' &&
      (!team || task.team_id === team) &&
      (!status || task.status === status) &&
      (searchParams.get('overdue') !== '1' || task.overdue)
    );
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Tasks assigned to you or your teams.
          </p>
        </div>
        {canCreateTask && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5 shrink-0" size="sm">
            <Plus className="h-4 w-4" />
            Create task
          </Button>
        )}
      </div>

      {/* Filters */}
      <TaskFilterToolbar teams={filterTeams} />

      {/* Table */}
      {tasks.length === 0 ? (
        <div className="flex min-h-[280px] w-full flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center bg-card/40">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="text-sm font-semibold text-foreground">No tasks here yet</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            Tasks you are assigned to or can manage will appear here.
          </p>
        </div>
      ) : (
        <TaskDataTable tasks={tasks} tasksKey={key} hideTeam={false} assignableTeams={createTaskTeams} />
      )}

      {/* Create task dialog */}
      {canCreateTask && (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          teams={createTaskTeams}
          tasksKey={key}
          accepts={accepts}
        />
      )}
    </div>
  );
}
