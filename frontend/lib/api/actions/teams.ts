'use server';
// Team changes from the /teams pages (trellis/12 D18, D28–D31).
// Expected failures come back as { ok: false, message } for a toast: Next.js hides
// the message of a thrown error in production. Redirect codes still redirect.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import type { components } from '../v1';

type Team = components['schemas']['TeamResponse'];
type TeamMember = components['schemas']['TeamMemberResponse'];
export type CreateTeamInput = components['schemas']['CreateTeamRequest'];
export type AddTeamMemberInput = components['schemas']['AddTeamMemberRequest'];

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Create an empty team (org-wide "create team" only). The creator doesn't join it.
 *
 *   const result = await createTeam({ name });
 *   if (!result.ok) toast.error(result.message);   // e.g. "A team called Alpha already exists."
 */
export async function createTeam(input: CreateTeamInput): Promise<ActionResult<Team>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const team = await unwrap(api.POST('/api/v1/teams', { body: input }));
    revalidatePath('/teams');
    return { ok: true, data: team };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Delete a team (only when its `deletable` flag is true). Refused while it still has
 * tasks, strikes or documents; the message says which. On success, go back to /teams.
 */
export async function deleteTeam(teamId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(api.DELETE('/api/v1/teams/{team_id}', { params: { path: { team_id: teamId } } }));
    revalidatePath('/teams');
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Put an existing org member into the team with a team role. Pick both from
 * getTeamCandidates(teamId); the backend re-checks the role is below yours.
 */
export async function addTeamMember(
  teamId: string,
  input: AddTeamMemberInput,
): Promise<ActionResult<TeamMember>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const member = await unwrap(
      api.POST('/api/v1/teams/{team_id}/members', {
        params: { path: { team_id: teamId } },
        body: input,
      }),
    );
    revalidatePath('/teams');
    revalidatePath(`/teams/${teamId}`);
    return { ok: true, data: member };
  } catch (err) {
    return toFailure(err);
  }
}

/** Take someone off the team (only members whose `removable` flag is true). */
export async function removeTeamMember(teamId: string, userId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(
      api.DELETE('/api/v1/teams/{team_id}/members/{user_id}', {
        params: { path: { team_id: teamId, user_id: userId } },
      }),
    );
    revalidatePath('/teams');
    revalidatePath(`/teams/${teamId}`);
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

function toFailure(err: unknown): { ok: false; message: string } {
  if (err instanceof ApiError) return { ok: false, message: err.message };
  throw err; // redirect() from unwrap, or a real bug
}
