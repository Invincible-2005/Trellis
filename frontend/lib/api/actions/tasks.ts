'use server';
// Task changes from the team page and /tasks (trellis/12 D18, D32, D33),
// hand-ins (D59) and comments (D60) on a task.
// Expected failures come back as { ok: false, message } for a toast: Next.js hides
// the message of a thrown error in production. Redirect codes still redirect.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import { getComments, getSubmissions } from '../queries/tasks';
import {
  firstError,
  zCommentRequest,
  zCreateSubmissionRequest,
  zCreateTaskRequest,
  zUpdateTaskRequest,
} from '../schemas/tasks';
import { deleteStoredFile } from '../storage';
import type { components } from '../v1';

type Task = components['schemas']['TaskResult'];
type Submission = components['schemas']['SubmissionResult'];
type Comment = components['schemas']['CommentResult'];
export type CommentInput = components['schemas']['CommentRequest'];
export type CreateTaskInput = components['schemas']['CreateTaskRequest'];
export type UpdateTaskInput = components['schemas']['UpdateTaskRequest'];
export type CreateSubmissionInput = components['schemas']['CreateSubmissionRequest'];

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

/**
 * Delete a task (only when it has `can_edit`). Pass its `team_id` so the team page refreshes.
 * Its hand-ins go with it, and their files are removed from UploadThing (D59).
 */
export async function deleteTask(taskId: string, teamId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    // Managers see every hand-in, so this lists all the files to remove afterwards
    const submissions = await getSubmissions(taskId);
    await unwrap(api.DELETE('/api/v1/tasks/{task_id}', { params: { path: { task_id: taskId } } }));
    await Promise.all(submissions.map((s) => deleteStoredFile(s.file_url)));
    revalidateTaskPages(teamId);
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

// ── hand-ins (D59) ────────────────────────────────────────────────────────────

/**
 * Hand-ins on a task you may see, for the Hand-ins dialog (a client component
 * calls it when the dialog opens). Only for tasks with `can_view_submissions`.
 *
 *   const result = await loadSubmissions(task.id);
 *   if (result.ok) setSubmissions(result.data);
 */
export async function loadSubmissions(taskId: string): Promise<ActionResult<Submission[]>> {
  try {
    return { ok: true, data: await getSubmissions(taskId) };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Hand in work on a task (only when it has `can_submit`). The file is already
 * uploaded through the `taskSubmission` route: pass its `url`, `name` and `size`.
 * The task's status doesn't change.
 *
 *   const result = await createSubmission(task.id, { file_url: url, file_name: name, file_size: size, notes });
 *   if (!result.ok) toast.error(result.message);
 */
export async function createSubmission(
  taskId: string,
  input: CreateSubmissionInput,
): Promise<ActionResult<Submission>> {
  const blocked = await limit('heavyWrite');
  if (blocked) return blocked;
  const parsed = zCreateSubmissionRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const submission = await unwrap(
      api.POST('/api/v1/tasks/{task_id}/submissions', {
        params: { path: { task_id: taskId } },
        body: parsed.data,
      }),
    );
    revalidateTaskTables();
    return { ok: true, data: submission };
  } catch (err) {
    return toFailure(err);
  }
}

/** Delete one of your own hand-ins (`can_delete`) and its file in UploadThing. */
export async function deleteSubmission(taskId: string, submissionId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const submission = (await getSubmissions(taskId)).find((s) => s.id === submissionId);
    await unwrap(
      api.DELETE('/api/v1/tasks/{task_id}/submissions/{submission_id}', {
        params: { path: { task_id: taskId, submission_id: submissionId } },
      }),
    );
    if (submission) await deleteStoredFile(submission.file_url);
    revalidateTaskTables();
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

// ── comments (D60) ────────────────────────────────────────────────────────────

/**
 * A task's comments, oldest first, for the Comments panel (a client component
 * calls it when the panel opens). Anyone who can see the task.
 */
export async function loadComments(taskId: string): Promise<ActionResult<Comment[]>> {
  try {
    return { ok: true, data: await getComments(taskId) };
  } catch (err) {
    return toFailure(err);
  }
}

/** Post a plain-text comment on a task you can see. */
export async function addComment(taskId: string, input: CommentInput): Promise<ActionResult<Comment>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zCommentRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const comment = await unwrap(
      api.POST('/api/v1/tasks/{task_id}/comments', {
        params: { path: { task_id: taskId } },
        body: parsed.data,
      }),
    );
    revalidateTaskTables();
    return { ok: true, data: comment };
  } catch (err) {
    return toFailure(err);
  }
}

/** Change the text of your own comment (`can_edit`); it then shows "(edited)". */
export async function editComment(
  taskId: string,
  commentId: string,
  input: CommentInput,
): Promise<ActionResult<Comment>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zCommentRequest.safeParse(input);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const comment = await unwrap(
      api.PATCH('/api/v1/tasks/{task_id}/comments/{comment_id}', {
        params: { path: { task_id: taskId, comment_id: commentId } },
        body: parsed.data,
      }),
    );
    return { ok: true, data: comment };
  } catch (err) {
    return toFailure(err);
  }
}

/** Delete your own comment (`can_delete`). */
export async function deleteComment(taskId: string, commentId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(
      api.DELETE('/api/v1/tasks/{task_id}/comments/{comment_id}', {
        params: { path: { task_id: taskId, comment_id: commentId } },
      }),
    );
    revalidateTaskTables();
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

/** Hand-in and comment counts show in the task tables on /tasks and every team page. */
function revalidateTaskTables() {
  revalidatePath('/tasks');
  revalidatePath('/teams/[teamId]', 'page');
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
