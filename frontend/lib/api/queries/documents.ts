// Documents the user may see, for the Documents page (trellis/11, D23).
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';
import type { components } from '../v1';

/**
 * Every document the user may see, newest first, with its indexing `status`
 * ('processing' | 'ready' | 'failed'). `deletable` marks the ones they may delete.
 */
export const getDocuments = cache(async () => (await unwrap(api.GET('/api/v1/documents'))).documents);

/**
 * Where the user may tag a new document (trellis/12 D23): `org` (whole
 * organization allowed?), `roles` and `teams` as { id, name }. The upload
 * dialog's picker shows exactly these; hide an option when it's false/empty.
 */
export const getDocumentTagOptions = cache(() => unwrap(api.GET('/api/v1/documents/tag-options')));

export type Document = components['schemas']['DocumentResponse'];
export type DocumentTagOptions = components['schemas']['DocumentTagOptions'];
