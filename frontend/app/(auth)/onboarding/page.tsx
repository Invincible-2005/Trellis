import { api } from '@/lib/api/client';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

// Opt out of build-time static prerendering
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const { userId, orgId } = await auth();

  if (!userId) redirect('/sign-in');
  if (!orgId) redirect('/org-selection');

  let data = null;
  let error = null;
  let response = null;

  try {
    const res = await api.POST('/api/v1/orgs/provision', {});
    data = res.data;
    error = res.error;
    response = res.response;
  } catch (err) {
    // Gracefully handle backend offline during development
    console.warn('Backend provisioning call failed (FastAPI may not be running):', err);
  }

  // Success -> navigate to dashboard
  if (data) {
    redirect('/dashboard');
  }

  const detail = (error as { detail?: { code: string; message: string } })?.detail;

  // 403: User is not an admin capable of provisioning
  if (response?.status === 403) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">Workspace not set up yet</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          {detail?.message ??
            'Only the organization creator can provision the workspace. Please ask your administrator to complete setup.'}
        </p>
      </div>
    );
  }

  // Fallback for development when backend endpoint is not yet connected
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Setting up your workspace</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        {detail?.message ?? 'Provisioning backend workspace...'}
      </p>
      <a
        href="/dashboard"
        className="mt-2 text-sm text-primary underline underline-offset-4"
      >
        Continue to Dashboard (Development Bypass)
      </a>
    </div>
  );
}