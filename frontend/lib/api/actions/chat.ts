'use server';
// Chat list changes for /chat (trellis/12 D18, D41, D42). Sending a message is
// not here: it streams, so it goes through the Route Handler
// app/api/chat/sessions/[sessionId]/message/route.ts.
// Expected failures come back as { ok: false, message } for a toast.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import { firstError, zRenameChatRequest } from '../schemas/chat';
import type { components } from '../v1';

type ChatSummary = components['schemas']['ChatSummary'];

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Create an empty chat. Call it when the first message is sent, not when
 * "New chat" is clicked (D42); then send the message to the returned `id`.
 */
export async function createChat(): Promise<ActionResult<ChatSummary>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const chat = await unwrap(api.POST('/api/v1/chat/sessions'));
    revalidateChatList();
    return { ok: true, data: chat };
  } catch (err) {
    return toFailure(err);
  }
}

/** Rename one of your chats (1–100 characters). Doesn't move it in the list. */
export async function renameChat(sessionId: string, title: string): Promise<ActionResult<ChatSummary>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  const parsed = zRenameChatRequest.safeParse({ title });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const chat = await unwrap(
      api.PATCH('/api/v1/chat/sessions/{session_id}', {
        params: { path: { session_id: sessionId } },
        body: parsed.data,
      }),
    );
    revalidateChatList();
    return { ok: true, data: chat };
  } catch (err) {
    return toFailure(err);
  }
}

/** Delete one of your chats for good, including the assistant's memory of it. */
export async function deleteChat(sessionId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(
      api.DELETE('/api/v1/chat/sessions/{session_id}', { params: { path: { session_id: sessionId } } }),
    );
    revalidateChatList();
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

/** The chat list lives in app/(dashboard)/chat/layout.tsx. */
function revalidateChatList() {
  revalidatePath('/chat', 'layout');
}

function toFailure(err: unknown): { ok: false; message: string } {
  if (err instanceof ApiError) return { ok: false, message: err.message };
  throw err; // redirect() from unwrap, or a real bug
}
