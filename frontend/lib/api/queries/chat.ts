// The user's own chats and who they can mention, for /chat (trellis/12 D41–D43).
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import type { components } from '../v1';

export type ChatSummary = components['schemas']['ChatSummary'];
export type ChatDetail = components['schemas']['ChatDetail'];
export type ChatMessage = components['schemas']['ChatMessage'];
export type Citation = components['schemas']['Citation'];
export type ConfirmCard = components['schemas']['ConfirmCard'];
export type Mentions = components['schemas']['MentionsResponse'];

/**
 * Your chats in the active org, most recently used first (up to 50).
 * `title` is null until the first message has been sent.
 */
export const getChats = cache(
  async () => (await unwrap(api.GET('/api/v1/chat/sessions'))).chats,
);

/**
 * One of your chats with its messages (your questions and the assistant's final
 * answers, each answer with its `citations`). Returns null when the chat doesn't
 * exist or isn't yours (404 `chat_not_found`): show notFound().
 *
 *   const chat = await getChat(sessionId);
 *   if (!chat) notFound();
 */
export const getChat = cache(async (sessionId: string): Promise<ChatDetail | null> => {
  try {
    return await unwrap(
      api.GET('/api/v1/chat/sessions/{session_id}', { params: { path: { session_id: sessionId } } }),
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    // A bad id in the URL comes back as a 422 validation error: same as missing.
    if (err instanceof ApiError && err.status === 422) return null;
    throw err;
  }
});

/**
 * Who you can pick in the chat box (D43): `people` for `@` (id, name, email) and
 * `teams` for `/` (id, name). Only teams you can see and the people on them.
 */
export const getMentions = cache(() => unwrap(api.GET('/api/v1/chat/mentions')));
