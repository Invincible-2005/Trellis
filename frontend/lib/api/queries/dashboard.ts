// Everything /dashboard shows, in one call (trellis/12 D24/D47/D48).
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';
import type { components } from '../v1';

/**
 * The signed-in user's dashboard. Read-only; loaded by the page on open (no polling, D48).
 * - `my_tasks`: own task counts (todo, in_progress, blocked, done, overdue)
 * - `upcoming_tasks`: next 5 unfinished tasks, soonest deadline first
 * - `my_strikes`: own strikes, not dismissed, newest first
 * - `recent_commendations`: latest 5 commendations received
 * - `teams`: a card per team the user can see; `active_strikes` is null where they don't handle strikes
 * - `org_overview`: org totals, null unless the user has org-level `view_aggregate`
 *
 *   const dashboard = await getDashboard();
 */
export const getDashboard = cache(async () => unwrap(api.GET('/api/v1/dashboard')));

export type Dashboard = components['schemas']['DashboardResponse'];
export type TaskSummary = components['schemas']['TaskSummary'];
export type TeamOverview = components['schemas']['TeamOverview'];
export type OrgOverview = components['schemas']['OrgOverview'];
export type Strike = components['schemas']['StrikeResponse'];
export type Commendation = components['schemas']['CommendationResponse'];
