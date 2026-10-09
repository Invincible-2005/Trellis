import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

export default async function DashboardPage() {
  const { userId, orgId } = await auth();

  if (!userId) redirect('/sign-in');
  if (!orgId) redirect('/org-selection');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">Welcome to Trellis</h1>
        <UserButton />
      </div>
      <p className="text-muted-foreground text-sm">
        Active Organization ID: <code className="font-mono bg-muted px-2 py-1 rounded">{orgId}</code>
      </p>
      <p className="text-muted-foreground text-xs">
        Full role-scoped metrics dashboard will be implemented in ticket 08.
      </p>
    </main>
  );
}