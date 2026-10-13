// Team forms (Create team, Add member to a team).
// Generated from the backend's rules (zod.gen.ts, `pnpm api:generate`); never retype them here.
// Frontend-only adjustments go here as `.extend()` on these schemas (trellis/12 D49).
import { z } from 'zod';
import './shared';
import { zAddTeamMemberRequest, zCreateTeamRequest } from './zod.gen';

export { firstError } from './shared';
export { zAddTeamMemberRequest, zCreateTeamRequest };

/** Create team: the name is trimmed first, so "  Alpha " is saved as "Alpha". */
export const zCreateTeamForm = zCreateTeamRequest.extend({
  name: z.string().trim().pipe(zCreateTeamRequest.shape.name),
});

// Add member: use zAddTeamMemberRequest as it is (two required pickers; an empty one
// shows "Please choose an option.").
