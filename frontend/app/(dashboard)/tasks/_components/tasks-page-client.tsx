'use client';

import React, { useState } from 'react';
import { Plus, ClipboardList } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Task } from '@/lib/api/queries/tasks';
import { TaskDataTable } from './task-data-table';
import { TaskFilterToolbar, teamsFromTasks } from './task-filter-toolbar';
import { CreateTaskDialog, type AssignableTeam } from './create-task-dialog';

interface TasksPageClientProps {
  tasks: Task[];
  createTaskTeams: AssignableTeam[];
  canCreateTask: boolean;
  currentMine: boolean;
  currentTeam: string;
  currentStatus: string;
  currentOverdue: boolean;
}

export function TasksPageClient({
  tasks,
  createTaskTeams,
  canCreateTask,
}: TasksPageClientProps) {
  const [createOpen, setCreateOpen] = useState(false);

  // Derive team filter options from tasks already loaded
  const filterTeams = teamsFromTasks(tasks);

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
        <TaskDataTable tasks={tasks} hideTeam={false} />
      )}

      {/* Create task dialog */}
      {canCreateTask && (
        <CreateTaskDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          teams={createTaskTeams}
        />
      )}
    </div>
  );
}
