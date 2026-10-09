import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { getAuthContext } from '@/lib/api/queries/auth';

export default async function DashboardPage() {
  // proxy.ts guarantees a signed-in user with an active org.
  const context = await getAuthContext();

  // The active org exists in Clerk but isn't set up in Trellis yet (e.g. picked from
  // the org list before its creator finished setup): send them through setup.
  if (!context.active_org) redirect('/onboarding');

  const org = context.organizations.find((o) => o.id === context.active_org?.org_id);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">Welcome to Trellis</h1>
        <UserButton />
      </div>
      <p className="text-muted-foreground text-sm">
        Organization: <span className="font-medium text-foreground">{org?.name}</span>
        {context.active_org.org_role_name && <> · Your role: {context.active_org.org_role_name}</>}
      </p>
      <p className="text-muted-foreground text-xs">
        Full role-scoped metrics dashboard will be implemented in ticket 08.
      </p>
    </main>
  );
}
