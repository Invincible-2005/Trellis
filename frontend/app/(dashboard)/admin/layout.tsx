/**
 * app/(dashboard)/admin/layout.tsx
 *
 * Gate: calls getAuthContext(), redirects to /dashboard unless
 * active_org.can_open_admin is true (trellis/12 D4).
 *
 * Tab bar: renders exactly the tabs listed in active_org.admin_tabs —
 * the backend decides which tabs the user can see based on their permissions.
 * The UI hides; FastAPI enforces.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/api/queries/auth';

// Map tab keys (from the backend) → human labels + hrefs
const TAB_META: Record<string, { label: string; href: string }> = {
  roles:     { label: 'Roles',     href: '/admin/roles' },
  members:   { label: 'Members',   href: '/admin/members' },
  teams:     { label: 'Teams',     href: '/admin/teams' },
  documents: { label: 'Documents', href: '/admin/documents' },
  strikes:   { label: 'Strikes',   href: '/admin/strikes' },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();

  // Hard gate — no org or no permission → back to dashboard
  if (!ctx.active_org?.can_open_admin) {
    redirect('/dashboard');
  }

  const tabs = ctx.active_org.admin_tabs ?? [];

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Admin header ───────────────────────────────────────── */}
      <header className="border-b bg-background px-6 py-4">
        <h1 className="text-xl font-semibold">Admin Console</h1>
      </header>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <nav className="border-b bg-background px-6">
        <ul className="flex gap-1" role="tablist">
          {tabs.map((key) => {
            const meta = TAB_META[key];
            if (!meta) return null;
            return (
              <li key={key}>
                <Link
                  href={meta.href}
                  className="inline-flex items-center px-4 py-3 text-sm font-medium
                             text-muted-foreground hover:text-foreground
                             border-b-2 border-transparent
                             hover:border-muted-foreground
                             aria-[current=page]:border-primary
                             aria-[current=page]:text-foreground
                             transition-colors"
                >
                  {meta.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Page content ───────────────────────────────────────── */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
