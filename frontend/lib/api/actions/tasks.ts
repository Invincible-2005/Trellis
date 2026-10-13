'use server';
// Task changes from the team page and /tasks (trellis/12 D18, D32, D33).
// Expected failures come back as { ok: false, message } for a toast: Next.js hides
// the message of a thrown error in production. Redirect codes still redirect.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import { firstError, zCreateTaskRequest, zUpdateTaskRequest } from '../schemas/tasks';
import type { components } from '../v1';

type Task = components['schemas']['TaskResult'];
export type CreateTaskInput = components['schemas']['CreateTaskRequest'];
export type UpdateTaskInput = components['schemas']['UpdateTaskRequest'];

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Create a task for a team member ranked below you (pick from team members with
 * `assignable: true`). `deadline` is an ISO string; it's stored in UTC.
 *
 *   const result = await createTask({ team_id, title, assigned_to_user_id, deadline });
 *   if (!result.ok) toast.error(result.message);
 */
export async function createTask(input: CreateTaskInput): Promise<ActionResult<Task>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zCreateTaskRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const task = await unwrap(api.POST('/api/v1/tasks', { body: parsed.data }));
    revalidateTaskPages(task.team_id);
    return { ok: true, data: task };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Change a task; send only the fields that change.
 * - Status only (`{ status }`) when the task has `can_change_status`.
 * - Anything else (title, description, deadline, assignee) only with `can_edit`.
 * `deadline: null` clears the deadline.
 */
export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<ActionResult<Task>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zUpdateTaskRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const task = await unwrap(
      api.PATCH('/api/v1/tasks/{task_id}', { params: { path: { task_id: taskId } }, body: parsed.data }),
    );
    revalidateTaskPages(task.team_id);
    return { ok: true, data: task };
  } catch (err) {
    return toFailure(err);
  }
}

/** Delete a task (only when it has `can_edit`). Pass its `team_id` so the team page refreshes. */
export async function deleteTask(taskId: string, teamId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(api.DELETE('/api/v1/tasks/{task_id}', { params: { path: { task_id: taskId } } }));
    revalidateTaskPages(teamId);
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

/** Task numbers show on /teams cards, the team page and /tasks. */
function revalidateTaskPages(teamId: string) {
  revalidatePath('/tasks');
  revalidatePath('/teams');
  revalidatePath(`/teams/${teamId}`);
}

function toFailure(err: unknown): { ok: false; message: string } {
  if (err instanceof ApiError) return { ok: false, message: err.message };
  throw err; // redirect() from unwrap, or a real bug
}
