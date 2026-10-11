/**
 * app/(dashboard)/admin/layout.tsx
 *
 * Gate only: redirects to /dashboard unless active_org.can_open_admin is true
 * (trellis/12 D4). No heading or tab bar of its own: the sidebar's Admin list
 * is the admin navigation (D36). Each page re-checks its own tab.
 * The UI hides; FastAPI enforces.
 */
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/api/queries/auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();

  if (!ctx.active_org?.can_open_admin) {
    redirect('/dashboard');
  }

  return children;
}
