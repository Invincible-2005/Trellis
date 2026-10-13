// Chat forms (rename a chat; the message box's body, checked in the stream route).
// Generated from the backend's rules (zod.gen.ts, `pnpm api:generate`); never retype them here.
// Frontend-only adjustments go here as `.extend()` on these schemas (trellis/12 D49).
import { z } from 'zod';
import './shared';
import { zRenameChatRequest, zSendMessageRequest } from './zod.gen';

export { firstError } from './shared';
export { zRenameChatRequest, zSendMessageRequest };

/** Rename chat: the title is trimmed first, so "   " counts as empty. */
export const zRenameChatForm = zRenameChatRequest.extend({
  title: z.string().trim().pipe(zRenameChatRequest.shape.title),
});
