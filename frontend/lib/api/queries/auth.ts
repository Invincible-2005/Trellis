// Who is signed in, and what can they do in the active org.
// cache() dedupes calls within one server render (e.g. layout + page both ask).
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';

/** The signed-in user. Works before an org is selected or set up. */
export const getMe = cache(() => unwrap(api.GET('/api/v1/auth/me')));

/**
 * The user's orgs, pending invitations, and — once the active org is set up —
 * their permissions there (`active_org`, null otherwise). Use it to show or hide
 * navigation and the admin console; the backend still enforces every action.
 */
export const getAuthContext = cache(() => unwrap(api.GET('/api/v1/auth/context')));

export type Me = Awaited<ReturnType<typeof getMe>>;
export type AuthContext = Awaited<ReturnType<typeof getAuthContext>>;
