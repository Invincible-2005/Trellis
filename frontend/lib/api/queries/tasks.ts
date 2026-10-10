// Tasks the user can see, for /tasks and the team page (trellis/12 D32/D33).
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';
import type { components, operations } from '../v1';

export type TaskFilters = NonNullable<operations['list_tasks_api_v1_tasks_get']['parameters']['query']>;

/**
 * Tasks the user may see (teams they're on or oversee), soonest deadline first.
 * Filters: `team_id`, `assigned_to_me`, `status`, `overdue_only`, `limit` (default 100, max 200).
 * Each task carries `can_edit` (edit, reassign, delete) and `can_change_status`.
 * An unknown or hidden `team_id` → 404 `team_not_found`.
 *
 *   const tasks = await getTasks({ team_id: teamId });
 *   const mine = await getTasks({ assigned_to_me: true });
 */
export const getTasks = cache(
  async (filters: TaskFilters = {}) =>
    (await unwrap(api.GET('/api/v1/tasks', { params: { query: filters } }))).tasks,
);

export type Task = components['schemas']['TaskResult'];
export type TaskStatus = Task['status'];
