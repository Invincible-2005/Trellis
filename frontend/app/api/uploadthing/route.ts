// UploadThing's endpoint. Reads UPLOADTHING_TOKEN from the environment.
// Public in proxy.ts: UploadThing's servers call it back after an upload (signed
// with the token); user uploads are still gated by requireUploader in core.ts.
import { createRouteHandler } from 'uploadthing/next';
import { uploadRouter } from './core';

export const { GET, POST } = createRouteHandler({ router: uploadRouter });
