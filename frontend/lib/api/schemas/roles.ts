// Role forms (admin console: New role, Edit role).
// Generated from the backend's rules (zod.gen.ts, `pnpm api:generate`); never retype them here.
// Frontend-only adjustments go here as `.extend()` on these schemas (trellis/12 D49).
import './shared';

export { firstError } from './shared';
export { zCreateRoleRequest, zUpdateRoleRequest } from './zod.gen';
