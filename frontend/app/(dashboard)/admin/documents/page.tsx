/**
 * app/(dashboard)/admin/documents/page.tsx
 *
 * Server Component:
 * - Checks tab permission ('documents' in active_org.admin_tabs).
 * - Fetches documents list and tag options in parallel.
 * - Passes data down to DocumentsView.
 */
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/api/queries/auth";
import { getDocuments, getDocumentTagOptions } from "@/lib/api/queries/documents";
import { DocumentsView } from "./_components/documents-view";

export default async function AdminDocumentsPage() {
  const ctx = await getAuthContext();

  const adminTabs = ctx.active_org?.admin_tabs ?? [];
  if (!adminTabs.includes("documents")) {
    const firstOtherTab = adminTabs[0];
    redirect(firstOtherTab ? `/admin/${firstOtherTab}` : "/dashboard");
  }

  const [documents, tagOptions] = await Promise.all([
    getDocuments(),
    getDocumentTagOptions(),
  ]);

  return <DocumentsView documents={documents} tagOptions={tagOptions} />;
}
