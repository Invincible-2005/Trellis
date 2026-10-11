// The active org's profile, for the /organization page (trellis/12 D34, D35).
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';
import type { components } from '../v1';

/**
 * The active org's `name` and `description` (null = none written yet).
 * `can_edit_description` says whether to show "Edit" (root Admin role only, D35).
 */
export const getOrganization = cache(() => unwrap(api.GET('/api/v1/orgs/current')));

export type OrgProfile = components['schemas']['OrgProfileResponse'];
