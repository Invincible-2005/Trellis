import 'server-only';
import { redirect } from 'next/navigation';

interface ApiErrorDetail {
  code: string;
  message: string;
}

/**
 * Handles BFF error responses and triggers redirects for locked flow codes (D16).
 */
export function handleBffError(error: unknown): never {
  const detail = (error as { detail?: ApiErrorDetail })?.detail;

  if (detail?.code === 'org_not_provisioned') redirect('/onboarding');
  if (detail?.code === 'no_active_org') redirect('/org-selection');
  if (detail?.code === 'invalid_token') redirect('/sign-in');

  throw new Error(detail?.message ?? 'An unexpected error occurred.');
}