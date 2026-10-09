// The org's members and pending invites, for Admin → Members (trellis/12 D25).
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';
import type { components } from '../v1';

/**
 * Everyone in the active org with their org-level role (`org_role_name` is null
 * for no role), plus pending invitations, newest first. Needs org-wide `add_member`.
 */
export const getMembers = cache(async () => unwrap(api.GET('/api/v1/admin/members')));

export type Member = components['schemas']['MemberResponse'];
export type Invitation = components['schemas']['InvitationResponse'];
