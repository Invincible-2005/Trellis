import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { ApiError, unwrap } from '@/lib/api/errors';

// Opt out of build-time static prerendering
export const dynamic = 'force-dynamic';

// New-org setup (trellis ticket 12 D10). proxy.ts guarantees a signed-in user with an
// active org. Setting up is safe to repeat: an org that's already set up just passes through.
export default async function OnboardingPage() {
  let failure: ApiError | null = null;
  try {
    await unwrap(api.POST('/api/v1/orgs/provision'));
  } catch (err) {
    // unwrap's own redirects (sign-in, org-selection) are not ApiErrors: let them through.
    if (!(err instanceof ApiError)) throw err;
    failure = err;
  }

  if (!failure) redirect('/dashboard');

  // 403: someone other than the org's creator opened a brand-new org.
  const notCreator = failure.status === 403;

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">
        {notCreator ? 'Workspace not set up yet' : "Couldn't set up your workspace"}
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">{failure.message}</p>
      <div className="flex gap-2">
        {!notCreator && (
          <Button asChild>
            <Link href="/onboarding">Try again</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/org-selection">Choose another organization</Link>
        </Button>
      </div>
    </div>
  );
}
