import { categories, parsePolicy } from '../policies/policyModel.js';
import { occupations, households } from '../profile/profileModel.js';
import { ApiError } from '../../shared/api/httpClient.js';
import { userReviewQuestions } from '../assistant/reviewQuestions.js';

export const housingTenures = [
  ['owner', '본인 소유 주택'],
  ['renter', '전세·월세'],
  ['other', '그 외 (가족 소유 등)'],
];
export const housingTypes = [
  ['detached', '단독주택'],
  ['multi_family', '다세대·다가구'],
  ['apartment', '아파트'],
  ['other', '그 외'],
];
export const disasterTypes = [
  ['flood', '수해·침수'],
  ['fire', '화재'],
  ['earthquake', '지진'],
  ['other', '그 외'],
];
export const candidateStates = [
  ['watching', '살펴보는 중'],
  ['preparing', '신청 준비 중'],
  ['applied', '신청 완료'],
  ['dismissed', '내게 해당 없음'],
  ['completed', '지원 확인 완료'],
];
export const monitoringOccupations = [...occupations.slice(1), '은퇴 후'];
export const emptyMonitoringProfile = {
  occupation: null,
  household: null,
  interests: [],
  housing_tenure: null,
  housing_type: null,
  building_year: null,
  repair_needed: null,
  job_seeking: null,
  disaster_type: null,
  disaster_damage: null,
  disaster_occurred_on: null,
};
const optionValues = (values) => values.map(([value]) => value);
const invalid = () =>
  new ApiError('지속 안내 정보의 형식을 확인하지 못했어요.', 'invalid_response');
const record = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const stringList = (value) => Array.isArray(value) && value.every(nonempty);
const optionalDateTime = (value) =>
  value === null || (nonempty(value) && Number.isFinite(Date.parse(value)));
const nullableOption = (value, options) => value === null || options.includes(value);

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function todayInSeoul() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function initialMonitoringProfile(recommendationProfile) {
  return {
    ...emptyMonitoringProfile,
    occupation: monitoringOccupations.includes(recommendationProfile?.occupation)
      ? recommendationProfile.occupation
      : null,
    household: households.slice(1).includes(recommendationProfile?.household)
      ? recommendationProfile.household
      : null,
    interests: categories
      .slice(1)
      .filter((category) => recommendationProfile?.interests?.includes(category)),
  };
}
export function parseMonitoringProfile(value) {
  if (!record(value)) throw invalid();
  const profile = { ...emptyMonitoringProfile, ...value };
  if (
    !nullableOption(profile.occupation, monitoringOccupations) ||
    !nullableOption(profile.household, households.slice(1)) ||
    !Array.isArray(profile.interests) ||
    !profile.interests.every((item) => categories.slice(1).includes(item)) ||
    !nullableOption(profile.housing_tenure, optionValues(housingTenures)) ||
    !nullableOption(profile.housing_type, optionValues(housingTypes)) ||
    !(
      profile.building_year === null ||
      (Number.isInteger(profile.building_year) &&
        profile.building_year >= 1800 &&
        profile.building_year <= Number(todayInSeoul().slice(0, 4)))
    ) ||
    ![null, true, false].includes(profile.repair_needed) ||
    ![null, true, false].includes(profile.job_seeking) ||
    !nullableOption(profile.disaster_type, optionValues(disasterTypes)) ||
    ![null, true, false].includes(profile.disaster_damage) ||
    !(
      profile.disaster_occurred_on === null ||
      (isCalendarDate(profile.disaster_occurred_on) &&
        profile.disaster_occurred_on <= todayInSeoul())
    )
  )
    throw invalid();
  return Object.fromEntries(
    Object.keys(emptyMonitoringProfile).map((key) => [
      key,
      key === 'interests' ? [...new Set(profile.interests)] : profile[key],
    ]),
  );
}
export function parseMonitoringSnapshot(value) {
  if (
    !record(value) ||
    !(value.profile === null || record(value.profile)) ||
    typeof value.enabled !== 'boolean' ||
    !optionalDateTime(value.updated_at) ||
    !optionalDateTime(value.last_checked_at) ||
    !Array.isArray(value.needs) ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.alerts) ||
    !Number.isInteger(value.unread_count) ||
    value.unread_count < 0
  )
    throw invalid();
  const needs = value.needs.map((need) => {
    if (
      !record(need) ||
      !nonempty(need.id) ||
      !nonempty(need.title) ||
      !nonempty(need.reason) ||
      !stringList(need.keywords) ||
      !stringList(need.questions)
    )
      throw invalid();
    return {
      id: need.id,
      title: need.title,
      reason: need.reason,
      keywords: [...need.keywords],
      questions: [...need.questions],
    };
  });
  const candidates = value.candidates.map((candidate) => {
    if (
      !record(candidate) ||
      !nonempty(candidate.need_id) ||
      !nonempty(candidate.policy_id) ||
      !['potential_match', 'needs_review'].includes(candidate.status) ||
      !nonempty(candidate.reason) ||
      !stringList(candidate.questions) ||
      !(candidate.active === undefined || typeof candidate.active === 'boolean') ||
      !optionValues(candidateStates).includes(candidate.state)
    )
      throw invalid();
    const policy = parsePolicy(candidate.policy);
    if (policy.id !== candidate.policy_id) throw invalid();
    return {
      need_id: candidate.need_id,
      policy_id: candidate.policy_id,
      policy,
      status: candidate.status,
      reason: candidate.reason,
      questions: userReviewQuestions(
        candidate.questions,
        needs.find((need) => need.id === candidate.need_id)?.questions,
      ),
      state: candidate.state,
      active: candidate.active ?? true,
      schedule_status: ['open', 'upcoming', 'unknown'].includes(candidate.schedule_status)
        ? candidate.schedule_status
        : 'unknown',
    };
  });
  const alerts = value.alerts.map((alert) => {
    if (
      !record(alert) ||
      !nonempty(alert.id) ||
      !nonempty(alert.policy_id) ||
      !nonempty(alert.need_id) ||
      !nonempty(alert.title) ||
      !nonempty(alert.body) ||
      !nonempty(alert.created_at) ||
      !optionalDateTime(alert.created_at) ||
      typeof alert.read !== 'boolean'
    )
      throw invalid();
    return {
      id: alert.id,
      policy_id: alert.policy_id,
      need_id: alert.need_id,
      title: alert.title,
      body: alert.body,
      created_at: alert.created_at,
      read: alert.read,
    };
  });
  if (
    new Set(needs.map((item) => item.id)).size !== needs.length ||
    new Set(candidates.map((item) => `${item.need_id}:${item.policy_id}`)).size !==
      candidates.length ||
    new Set(alerts.map((item) => item.id)).size !== alerts.length
  )
    throw invalid();
  return {
    profile: value.profile === null ? null : parseMonitoringProfile(value.profile),
    enabled: value.enabled,
    updated_at: value.updated_at,
    last_checked_at: value.last_checked_at,
    needs,
    candidates,
    alerts,
    unread_count: value.unread_count,
    scan_status: value.scan_status === 'unavailable' ? 'unavailable' : null,
  };
}
export function monitoringDate(value) {
  if (!value) return '아직 확인하지 않았어요';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
