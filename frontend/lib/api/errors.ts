// Turns a backend response into data, a redirect, or an ApiError.
// Every backend error has the shape { detail: { code, message } }.
import 'server-only';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { components } from './v1';

type ErrorBody = components['schemas']['ErrorResponse'];

/** A failure to show the user, e.g. `toast.error(err.message)`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// These codes mean "go somewhere else", not "show an error".
const REDIRECTS: Record<string, string> = {
  invalid_token: '/sign-in',
  no_active_org: '/org-selection',
  org_not_provisioned: '/onboarding',
  not_a_member: '/org-selection', // just removed from this org (D38)
};

function isErrorBody(value: unknown): value is ErrorBody {
  const detail = (value as ErrorBody | undefined)?.detail;
  return typeof detail?.code === 'string' && typeof detail?.message === 'string';
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Await a call made with `api` and return its data.
 * Redirects for sign-in / org-selection / setup errors; throws ApiError otherwise.
 *
 *   const me = await unwrap(api.GET('/api/v1/auth/me'));
 */
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await call;
  } catch (err) {
    unstable_rethrow(err); // Next's own signals (e.g. "render per request") are not network errors
    throw new ApiError(503, 'backend_unavailable', 'The server is unreachable. Please try again.');
  }

  const { data, error, response } = result;
  if (response.ok) return data as T;

  if (!isErrorBody(error)) {
    // e.g. a 422 validation error or a proxy error page
    throw new ApiError(response.status, 'unexpected', 'Something went wrong. Please try again.');
  }

  const target = REDIRECTS[error.detail.code];
  if (target) redirect(target); // throws; must stay outside the try/catch above
  throw new ApiError(response.status, error.detail.code, error.detail.message);
}
