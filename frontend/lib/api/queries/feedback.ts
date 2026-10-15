// Everything the /feedback page reads (trellis/12 D54, D55): give strikes and
// commendations, see what you gave, review appeals.
import 'server-only';
import { cache } from 'react';
import { api } from '../client';
import { unwrap } from '../errors';
import type { components } from '../v1';

/**
 * What the page offers this user (the same tabs as `auth/context`'s `feedback_tabs`):
 * - `tabs`: any of 'give_strike' | 'give_commendation' | 'review_appeals'; show only these
 * - `teams`: per team, `strike_people` (you may strike) and `commend_people` (you may commend).
 *   These fill the Give form's pickers; a team appears only if it has someone in either list.
 */
export const getFeedbackOptions = cache(() => unwrap(api.GET('/api/v1/feedback/options')));

/**
 * Strikes (every status: confirmed, appealed, dismissed) and commendations you gave, newest first.
 * An `appealed` strike you gave waits for someone else to review it (D6).
 */
export const getGivenFeedback = cache(() => unwrap(api.GET('/api/v1/feedback/given')));

/**
 * Appeals waiting for your decision, oldest first: you have review permission for that team
 * and you neither gave nor received the strike (D6, D55). Each has the employee's
 * `appeal_notes`, the `policy_evaluation` saved with the strike and its `policy_sources`
 * (only passages from documents you can see).
 */
export const getAppeals = cache(() => unwrap(api.GET('/api/v1/feedback/appeals')));

export type FeedbackOptions = components['schemas']['FeedbackOptionsResponse'];
export type FeedbackTab = FeedbackOptions['tabs'][number];
export type FeedbackTeamOption = components['schemas']['FeedbackTeamOption'];
export type FeedbackPerson = components['schemas']['FeedbackPerson'];
export type GivenFeedback = components['schemas']['GivenFeedbackResponse'];
export type Appeal = components['schemas']['AppealResponse'];
export type StrikePreview = components['schemas']['StrikePreviewResponse'];
export type PolicyCheck = components['schemas']['PolicyCheck'];
