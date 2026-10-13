// Task forms (Create task, Edit task, status change).
// Generated from the backend's rules (zod.gen.ts, `pnpm api:generate`); never retype them here.
// Frontend-only adjustments go here as `.extend()` on these schemas (trellis/12 D49).
import { z } from 'zod';
import './shared';
import { zCreateTaskRequest, zUpdateTaskRequest } from './zod.gen';

export { firstError } from './shared';
export { zCreateTaskRequest, zUpdateTaskRequest };

// The date picker gives a day (a Date, or undefined when empty). The task is due at
// the end of that day in the user's time zone; the backend gets an ISO string or null.
const deadlineFromPicker = z
  .date()
  .nullish()
  .transform((day) => {
    if (!day) return null;
    const end = new Date(day);
    end.setHours(23, 59, 59, 0);
    return end.toISOString();
  })
  .pipe(zCreateTaskRequest.shape.deadline.unwrap()); // the backend rule, minus "may be left out"

/** Create task: title trimmed first; the deadline comes from a date picker. */
export const zCreateTaskForm = zCreateTaskRequest.extend({
  title: z.string().trim().pipe(zCreateTaskRequest.shape.title),
  deadline: deadlineFromPicker,
});

/**
 * Edit task: the same fields minus the team (a task can't move teams). The form
 * always holds every field, so it uses the create rules; updateTask re-checks with
 * zUpdateTaskRequest on the server. Send only the fields that changed.
 */
export const zEditTaskForm = zCreateTaskForm.omit({ team_id: true });

// Status dropdown in the table: no form; call updateTask(id, { status }) directly
// (the Server Action checks it with zUpdateTaskRequest).
