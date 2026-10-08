import { ApiError } from '../../shared/api/httpClient.js';
import { parsePolicy, safeSourceUrl } from '../policies/policyModel.js';
import { userConditionLabel, userReviewQuestions } from './reviewQuestions.js';
import {
  emptyMonitoringProfile,
  parseMonitoringProfile,
  parseMonitoringSnapshot,
} from '../monitoring/monitoringModel.js';

const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && !!value.trim();
const texts = (value) => Array.isArray(value) && value.every(text);
const scalar = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const invalid = () =>
  new ApiError('상담 안내를 확인하지 못했어요. 다시 시도해 주세요.', 'invalid_response');

export function parseDialogue(value) {
  if (
    !record(value) ||
    !text(value.answer) ||
    value.eligibility_decided !== false ||
    !['housing_repair', 'employment', 'disaster_recovery', 'housing_leak', 'general'].includes(
      value.topic,
    ) ||
    !text(value.continuation) ||
    !Array.isArray(value.missing_fields) ||
    !value.missing_fields.every((field) => text(field?.slot) && text(field.label)) ||
    !texts(value.confirmed_fields) ||
    new Set(value.confirmed_fields).size !== value.confirmed_fields.length ||
    !value.confirmed_fields.every((field) => Object.hasOwn(emptyMonitoringProfile, field)) ||
    typeof value.can_save_profile !== 'boolean' ||
    !texts(value.practical_steps) ||
    !Array.isArray(value.source_links) ||
    !value.source_links.every((link) => text(link?.label) && safeSourceUrl(link.url)) ||
    !Array.isArray(value.candidates) ||
    !['ready', 'unavailable', 'not_requested'].includes(value.catalog_status)
  )
    throw invalid();
  if (value.answer_accepted !== undefined && ![null, true, false].includes(value.answer_accepted))
    throw invalid();
  const follow = value.follow_up;
  if (
    follow !== null &&
    (!record(follow) ||
      !text(follow.slot) ||
      !text(follow.question) ||
      !['select', 'number', 'date', 'text'].includes(follow.input_type) ||
      follow.allow_unknown !== true ||
      !Array.isArray(follow.options) ||
      !follow.options.every((item) => scalar(item?.value) && text(item.label)) ||
      (follow.input_type === 'select' && !follow.options.length))
  )
    throw invalid();
  const candidates = value.candidates.map((candidate) => {
    if (
      !record(candidate) ||
      !text(candidate.policy_id) ||
      !text(candidate.reason) ||
      !['potential_match', 'needs_review'].includes(candidate.status) ||
      !texts(candidate.questions)
    )
      throw invalid();
    const policy = parsePolicy(candidate.policy);
    if (policy.id !== candidate.policy_id) throw invalid();
    return { ...candidate, policy, questions: userReviewQuestions(candidate.questions) };
  });
  const profile = parseMonitoringProfile(value.profile_draft);
  if (value.can_save_profile && !value.confirmed_fields.length) throw invalid();
  let selected = null;
  if (value.selected_policy) {
    const comparison = value.selected_policy.comparison;
    if (
      !record(comparison) ||
      comparison.eligibility_decided !== false ||
      !['potential_match', 'needs_review', 'not_matched'].includes(comparison.status) ||
      !texts(comparison.notes) ||
      !Array.isArray(comparison.checks) ||
      !comparison.checks.every(
        (check) =>
          text(check?.label) &&
          text(check.note) &&
          ['match', 'mismatch', 'unknown'].includes(check.state) &&
          typeof check.quote === 'string',
      )
    )
      throw invalid();
    selected = {
      ...value.selected_policy,
      policy: parsePolicy(value.selected_policy.policy),
      comparison: {
        ...comparison,
        checks: comparison.checks.map((check) => ({
          ...check,
          label: userConditionLabel(check.label, check.role),
        })),
      },
    };
  }
  const missing = value.missing_fields.filter(
    (field) =>
      Object.hasOwn(emptyMonitoringProfile, field.slot) ||
      ['subject', 'region', 'support_interest', 'search_query'].includes(field.slot),
  );
  return {
    ...value,
    candidates,
    selected_policy: selected,
    profile_draft: profile,
    missing_fields: missing.map((field) => ({
      ...field,
      label: userConditionLabel(field.label),
    })),
  };
}

export function createDialogueApi(request, { guest = false } = {}) {
  const call = (path, body, { signal } = {}) =>
    request('/v1/assistant/' + (guest && !path ? 'chat/dialogue' : 'dialogue' + path), {
      method: 'POST',
      body,
      signal,
      authenticated: true,
      timeoutMs: 30000,
    });
  return {
    start: async (question, { revisionId, ...options } = {}) =>
      parseDialogue(
        await call(
          '',
          { question: question.trim(), ...(revisionId ? { revision_id: revisionId } : {}) },
          options,
        ),
      ),
    answer: async (continuation, slot, value, options) =>
      parseDialogue(await call('', { continuation, answer: { slot, value } }, options)),
    save: async (continuation, { consent, confirmed, ...options } = {}) => {
      if (consent !== true || confirmed !== true)
        throw new ApiError('확인한 정보를 저장하는 데 동의해 주세요.', 'consent_required');
      return parseMonitoringSnapshot(
        await call('/profile', { continuation, consent: true, confirmed: true }, options),
      );
    },
  };
}
