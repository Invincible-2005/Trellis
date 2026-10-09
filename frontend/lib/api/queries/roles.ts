// The org's role tree, for the admin console.
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';
import type { components } from '../v1';

/**
 * Every role in the active org as a flat list with `depth` and `parent_role_id`
 * (build the tree from these). `manageable` marks roles the user may edit or
 * delete; `is_system` marks the protected Admin role.
 */
export const getRoles = cache(async () => (await unwrap(api.GET('/api/v1/admin/roles'))).roles);

export type Role = components['schemas']['RoleResponse'];
/** One of the 8 permission names (the "New role" dialog's checkboxes). */
export type Permission = NonNullable<components['schemas']['CreateRoleRequest']['permissions']>[number];
