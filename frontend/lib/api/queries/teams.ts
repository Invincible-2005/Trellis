// Teams the user can see, for /teams and /teams/[teamId] (trellis/12 D28–D31).
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';
import type { components } from '../v1';

/**
 * Every team the user is on or oversees, sorted by name, as card data:
 * `my_role_name` (null = "Overseeing"), `member_count`, `open_tasks`, `overdue_tasks`,
 * plus button flags `can_add_member`, `can_assign_task`, `deletable`.
 * `can_create_team` says whether to show "Create team".
 */
export const getTeams = cache(() => unwrap(api.GET('/api/v1/teams')));

/**
 * One team: the card data plus `members` (each with `removable`).
 * A team the user can't see → 404 `team_not_found` (an ApiError; show notFound()).
 */
export const getTeam = cache((teamId: string) =>
  unwrap(api.GET('/api/v1/teams/{team_id}', { params: { path: { team_id: teamId } } })),
);

/**
 * Choices for the Add member dialog: `members` (org members not on the team yet)
 * and `roles` (only the team roles this user may give here). Call it only when
 * the team's `can_add_member` is true; otherwise it's a 403.
 */
export const getTeamCandidates = cache((teamId: string) =>
  unwrap(api.GET('/api/v1/teams/{team_id}/candidates', { params: { path: { team_id: teamId } } })),
);

export type Team = components['schemas']['TeamResponse'];
export type TeamDetail = components['schemas']['TeamDetailResponse'];
export type TeamMember = components['schemas']['TeamMemberResponse'];
export type TeamCandidates = components['schemas']['TeamCandidatesResponse'];
