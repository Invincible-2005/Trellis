// Removing uploaded files from UploadThing, after the record pointing at them is
// gone from Trellis (documents, trellis/12 D40; task hand-ins, D59).
import 'server-only';
import { UTApi } from 'uploadthing/server';

/**
 * Delete one stored file. UploadThing links end in /f/<file key>
 * (<app>.ufs.sh/f/<key> or utfs.io/f/<key>). The record is already deleted by
 * now, so a failure here is only logged: the leftover file costs storage but
 * nobody can reach it through the app.
 *
 *   await deleteStoredFile(document.file_url);
 */
export async function deleteStoredFile(fileUrl: string) {
  try {
    const key = new URL(fileUrl).pathname.match(/^\/f\/([^/]+)$/)?.[1];
    if (!key) throw new Error('no file key in the link');
    const { success } = await new UTApi().deleteFiles(decodeURIComponent(key));
    if (!success) throw new Error('UploadThing refused the delete');
  } catch (err) {
    console.error(`[storage] Could not delete ${fileUrl} from UploadThing:`, err);
  }
}
