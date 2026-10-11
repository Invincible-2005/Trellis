/**
 * app/(dashboard)/admin/page.tsx
 *
 * /admin has no page of its own: open the first section this user may use.
 * (The layout already sent users with no admin sections to /dashboard.)
 */
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/api/queries/auth';

export default async function AdminPage() {
  const ctx = await getAuthContext();
  const firstTab = ctx.active_org?.admin_tabs?.[0];
  redirect(firstTab ? `/admin/${firstTab}` : '/dashboard');
}
