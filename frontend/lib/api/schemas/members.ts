// Member forms (admin console: Invite member, Change role).
// Generated from the backend's rules (zod.gen.ts, `pnpm api:generate`); never retype them here.
// Frontend-only adjustments go here as `.extend()` on these schemas (trellis/12 D49).
import { z } from 'zod';
import { emptyAsNull } from './shared';
import { zAddMemberRequest, zUpdateMemberRequest } from './zod.gen';

export { firstError } from './shared';
export { zAddMemberRequest, zUpdateMemberRequest };

/** Invite member: the email is trimmed and lower-cased first; the role picker's "No role" ("") becomes null. */
export const zInviteMemberForm = zAddMemberRequest.extend({
  email: z.string().trim().toLowerCase().pipe(zAddMemberRequest.shape.email),
  role_id: emptyAsNull(zAddMemberRequest.shape.role_id),
});

/** Change role: the picker's "No role" ("") becomes null. */
export const zChangeMemberRoleForm = zUpdateMemberRequest.extend({
  role_id: emptyAsNull(zUpdateMemberRequest.shape.role_id),
});
