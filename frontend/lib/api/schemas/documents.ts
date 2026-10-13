// Document forms (Upload & share, Edit document).
// Generated from the backend's rules (zod.gen.ts, `pnpm api:generate`); never retype them here.
// Frontend-only adjustments go here as `.extend()` on these schemas (trellis/12 D49).
import { z } from 'zod';
import './shared';
import { zCreateDocumentRequest, zUpdateDocumentRequest } from './zod.gen';

export { firstError } from './shared';
export { zCreateDocumentRequest, zUpdateDocumentRequest };

// The backend also needs the role or team that matches the chosen audience. It checks
// that in code, so OpenAPI can't describe it; the forms add the same check here.
function requireTarget(
  value: { scope_type?: string | null; role_id?: string | null; team_id?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.scope_type === 'role' && !value.role_id) {
    ctx.addIssue({ code: 'custom', path: ['role_id'], message: 'Please choose a role.' });
  }
  if (value.scope_type === 'team' && !value.team_id) {
    ctx.addIssue({ code: 'custom', path: ['team_id'], message: 'Please choose a team.' });
  }
}

/** Upload & share, step 2: title trimmed first, plus the audience check above. */
export const zUploadDocumentForm = zCreateDocumentRequest
  .extend({ title: z.string().trim().pipe(zCreateDocumentRequest.shape.title) })
  .superRefine(requireTarget);

/**
 * Edit document: title trimmed first, plus the audience check above. The form always
 * has a title, so it uses the title rule without the "may be left out" part (unwrap).
 */
export const zEditDocumentForm = zUpdateDocumentRequest
  .extend({ title: z.string().trim().pipe(zUpdateDocumentRequest.shape.title.unwrap().unwrap()) })
  .superRefine(requireTarget);
