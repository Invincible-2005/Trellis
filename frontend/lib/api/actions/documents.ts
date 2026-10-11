'use server';
// Document changes from Admin → Documents (trellis/12 D18, D23).
// Expected failures come back as { ok: false, message } for a toast.
import { revalidatePath } from 'next/cache';
import { limit } from '@/lib/middleware/limit';
import { api } from '../client';
import { ApiError, unwrap } from '../errors';
import type { components } from '../v1';
import type { ActionResult } from './roles';

type Document = components['schemas']['DocumentResponse'];
export type CreateDocumentInput = components['schemas']['CreateDocumentRequest'];
export type UpdateDocumentInput = components['schemas']['UpdateDocumentRequest'];

/**
 * Register a file already uploaded to UploadThing and start indexing it.
 * `file_url` is `serverData.url` from the dropzone; the document starts as
 * 'processing' — poll getDocumentStatus() until 'ready' or 'failed'.
 *
 *   const result = await createDocument({ title, scope_type: 'role', role_id, file_url, file_type: 'pdf' });
 *   if (!result.ok) toast.error(result.message);
 */
export async function createDocument(input: CreateDocumentInput): Promise<ActionResult<Document>> {
  const blocked = await limit('heavyWrite');
  if (blocked) return blocked;
  try {
    const document = await unwrap(api.POST('/api/v1/documents', { body: input }));
    revalidatePath('/admin/documents');
    return { ok: true, data: document };
  } catch (err) {
    return toFailure(err);
  }
}

/** Current state of one document, for polling while it's 'processing'. */
export async function getDocumentStatus(documentId: string): Promise<ActionResult<Document>> {
  try {
    const document = await unwrap(
      api.GET('/api/v1/documents/{document_id}', { params: { path: { document_id: documentId } } }),
    );
    return { ok: true, data: document };
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Change a document's title, description or who sees it (only when `deletable` is
 * true; trellis/12 D39). Leave a field out to keep it; for a new audience send
 * `scope_type` with its `role_id` / `team_id`, as on upload.
 */
export async function updateDocument(
  documentId: string,
  input: UpdateDocumentInput,
): Promise<ActionResult<Document>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    const document = await unwrap(
      api.PATCH('/api/v1/documents/{document_id}', {
        params: { path: { document_id: documentId } },
        body: input,
      }),
    );
    revalidatePath('/admin/documents');
    return { ok: true, data: document };
  } catch (err) {
    return toFailure(err);
  }
}

/** Delete a document and its indexed pieces (only when `deletable` is true). */
export async function deleteDocument(documentId: string): Promise<ActionResult<null>> {
  const blocked = await limit('write');
  if (blocked) return blocked;
  try {
    await unwrap(api.DELETE('/api/v1/documents/{document_id}', { params: { path: { document_id: documentId } } }));
    revalidatePath('/admin/documents');
    return { ok: true, data: null };
  } catch (err) {
    return toFailure(err);
  }
}

function toFailure(err: unknown): { ok: false; message: string } {
  if (err instanceof ApiError) return { ok: false, message: err.message };
  throw err; // redirect() from unwrap, or a real bug
}
