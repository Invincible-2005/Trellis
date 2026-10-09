// UploadThing upload rules (trellis/11, documents effort). The browser sends the
// file straight to UploadThing; FastAPI only ever receives the resulting URL
// (POST /api/v1/documents via actions/documents.ts::createDocument).
import { auth } from '@clerk/nextjs/server';
import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
import { api } from '@/lib/api/client';

const f = createUploadthing();

// Below the backend's INGESTION_MAX_FILE_BYTES (25 MB). One file per upload.
const ONE_FILE = { maxFileSize: '16MB', maxFileCount: 1 } as const;

/**
 * Gate to our storage: signed in, an active org, and `upload_document`
 * org-wide or on any team. Where the document may be TAGGED is checked by the
 * backend when it's registered (D23).
 */
async function requireUploader() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new UploadThingError('Sign in and pick an organization first.');

  let canUpload = false;
  try {
    const { data } = await api.GET('/api/v1/auth/context');
    const org = data?.active_org;
    canUpload =
      !!org &&
      ((org.org_permissions ?? []).includes('upload_document') ||
        Object.values(org.permissions_by_team ?? {}).some((p) => p.includes('upload_document')));
  } catch {
    throw new UploadThingError('The server is unreachable. Please try again.');
  }
  if (!canUpload) throw new UploadThingError("You don't have permission to upload documents.");
  return { userId };
}

export const uploadRouter = {
  /** Policy/SOP documents: the file types ingestion can read. */
  policyDocument: f({
    pdf: ONE_FILE,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ONE_FILE, // .docx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ONE_FILE, // .pptx
    'text/plain': ONE_FILE,
    'text/markdown': ONE_FILE,
  })
    .middleware(requireUploader)
    // Returned to the browser's onClientUploadComplete: pass `url` to createDocument().
    .onUploadComplete(({ file }) => ({ url: file.ufsUrl, name: file.name })),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
