import { ApiError } from '../../shared/api/httpClient.js';
import { parseSearchMatch, parseSearchMetadata } from './searchMetadata.js';
import { emptyTranslationFields } from './policyTranslationModel.js';
import { isCalendarDate } from '../calendar/calendarModel.js';
export const categories = [
  '전체',
  '생활·금융',
  '주거',
  '일자리',
  '교육',
  '건강·돌봄',
  '문화',
  '농림축산·어업',
  '사업·창업',
  '기타',
];
export const regions = [
  '전국',
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '광주',
  '대전',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
];
const presentation = {
  주거: ['house', 'sage'],
  일자리: ['briefcase', 'blue'],
  교육: ['book', 'sand'],
  '생활·금융': ['wallet', 'peach'],
  '건강·돌봄': ['heart', 'rose'],
  문화: ['ticket', 'lavender'],
  '농림축산·어업': ['sprout', 'sage'],
  '사업·창업': ['store', 'blue'],
};
export function safeSourceUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
const verifiedDate = (value) =>
  value === null || value === undefined
    ? null
    : typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}/.test(value) &&
        Number.isFinite(Date.parse(value))
      ? value
      : null;
export function formatSignalDate(value) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(value));
}
export function parsePopularity(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.views) ||
    value.views < 0 ||
    !['gov24', 'bokjiro'].includes(value.source) ||
    value.basis !== 'provider_cumulative_views'
  )
    return null;
  return {
    views: value.views,
    source: value.source,
    basis: value.basis,
    asOf: verifiedDate(value.asOf),
  };
}
export function parseBudget(value) {
  const sourceUrl = safeSourceUrl(value?.sourceUrl);
  if (
    !value ||
    typeof value.usedPercent !== 'number' ||
    !Number.isFinite(value.usedPercent) ||
    value.usedPercent < 0 ||
    value.usedPercent > 100 ||
    !sourceUrl?.startsWith('https://') ||
    typeof value.evidence !== 'string' ||
    !value.evidence.trim()
  )
    return null;
  return {
    usedPercent: value.usedPercent,
    sourceUrl,
    asOf: verifiedDate(value.asOf),
    evidence: value.evidence,
  };
}
function parseApplicationWindows(value) {
  if (value === null || value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (window) =>
        !window ||
        typeof window !== 'object' ||
        Array.isArray(window) ||
        ![window.applicationStart, window.applicationEnd].some(isCalendarDate) ||
        ![window.applicationStart, window.applicationEnd].every(
          (date) => date === null || isCalendarDate(date),
        ) ||
        (window.applicationStart &&
          window.applicationEnd &&
          window.applicationStart > window.applicationEnd),
    )
  )
    throw new ApiError('공고 일정을 다시 확인해야 해요.', 'invalid_response');
  return value.map(({ applicationStart, applicationEnd }) => ({
    applicationStart,
    applicationEnd,
  }));
}
export function parsePolicy(item) {
  if (
    !item ||
    typeof item.id !== 'string' ||
    !item.id.trim() ||
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    typeof item.summary !== 'string' ||
    !Array.isArray(item.tags) ||
    !item.tags.every((tag) => typeof tag === 'string')
  )
    throw new ApiError('공고 정보의 형식이 올바르지 않아요.', 'invalid_response');
  const category = categories.includes(item.category) ? item.category : '기타';
  const [icon, tone] = presentation[category] || ['compass', 'sage'];
  const text = (key, fallback) => (typeof item[key] === 'string' ? item[key] : fallback);
  const translationSourceEmptyFields = emptyTranslationFields(item);
  return {
    id: item.id,
    revisionId: typeof item.revisionId === 'string' ? item.revisionId : null,
    title: item.title,
    summary: item.summary,
    ...(translationSourceEmptyFields.length ? { translationSourceEmptyFields } : {}),
    searchMatch: parseSearchMatch(item.searchMatch),
    tags: [...new Set(item.tags)],
    category,
    icon,
    tone,
    region: text('region', '지역 확인 필요'),
    audience: text('audience', '지원 대상 확인 필요'),
    organization: text('organization', '기관 확인 필요'),
    benefit: text('benefit', '상세 안내 확인'),
    date: text('date', ''),
    applicationPeriod: text('applicationPeriod', '공식 공고에서 확인'),
    paymentSchedule: text('paymentSchedule', null),
    applicationStart: text('applicationStart', null),
    applicationEnd: text('applicationEnd', null),
    applicationWindows: parseApplicationWindows(item.applicationWindows),
    scheduleStatus: ['dated', 'ongoing', 'unknown'].includes(item.scheduleStatus)
      ? item.scheduleStatus
      : 'unknown',
    applicationPrecision: ['month', 'month_end'].includes(item.applicationPrecision)
      ? item.applicationPrecision
      : null,
    applicationRecurrence: ['yearly', 'monthly'].includes(item.applicationRecurrence)
      ? item.applicationRecurrence
      : null,
    calendarMonth:
      typeof item.calendarMonth === 'string' &&
      /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(item.calendarMonth)
        ? item.calendarMonth
        : null,
    applicationMonths: Array.isArray(item.applicationMonths)
      ? [
          ...new Set(
            item.applicationMonths.filter(
              (month) => Number.isInteger(month) && month >= 1 && month <= 12,
            ),
          ),
        ]
      : [],
    applicationYear:
      Number.isInteger(item.applicationYear) &&
      item.applicationYear >= 2000 &&
      item.applicationYear <= 2099
        ? item.applicationYear
        : null,
    sourceUrl: safeSourceUrl(item.sourceUrl),
    content: text('content', ''),
    gender: text('gender', ''),
    contact: text('contact', ''),
    applicationMethod: text('applicationMethod', ''),
    applicationUrl: safeSourceUrl(item.applicationUrl),
    publishedDate: text('publishedDate', ''),
    modifiedDate: text('modifiedDate', ''),
    sourceFields:
      item.sourceFields && typeof item.sourceFields === 'object'
        ? Object.fromEntries(
            Object.entries(item.sourceFields).filter(([, value]) => typeof value === 'string'),
          )
        : {},
    otherConditions: Array.isArray(item.otherConditions)
      ? item.otherConditions.filter((value) => typeof value === 'string')
      : [],
    popularity: parsePopularity(item.popularity),
    budget: parseBudget(item.budget),
    budgetNotice:
      typeof item.budgetNotice === 'string' &&
      item.budgetNotice.trim() &&
      item.budgetNotice.length <= 500
        ? item.budgetNotice.trim()
        : null,
  };
}
export function parsePolicyPage(result) {
  if (
    !result ||
    !Array.isArray(result.items) ||
    !Number.isInteger(result.total) ||
    result.total < 0 ||
    !(
      result.nextCursor === null ||
      (typeof result.nextCursor === 'string' && result.nextCursor.length > 0)
    )
  )
    throw new ApiError('공고 목록의 형식이 올바르지 않아요.', 'invalid_response');
  const items = result.items.map(parsePolicy);
  if (new Set(items.map((item) => item.id)).size !== items.length || result.total < items.length)
    throw new ApiError('공고 목록을 다시 확인해야 해요.', 'invalid_response');
  const search = parseSearchMetadata(result.search);
  return {
    items,
    total: result.total,
    nextCursor: result.nextCursor,
    ...(search ? { search } : {}),
  };
}

export function mergePolicyDetail(current, detail) {
  const recurringCalendarSchedule =
    current?.applicationYear === null &&
    detail.applicationYear === null &&
    (current.applicationPrecision === 'month' || current.applicationRecurrence !== null) &&
    current.applicationPrecision === detail.applicationPrecision &&
    current.applicationRecurrence === detail.applicationRecurrence;
  const multipleCalendarSchedule =
    current?.applicationWindows?.length > 1 &&
    detail.applicationWindows?.length === current.applicationWindows.length &&
    current.applicationWindows.some(
      (window) =>
        window.applicationStart === current.applicationStart &&
        window.applicationEnd === current.applicationEnd,
    );
  const calendarSchedule =
    current?.calendarMonth &&
    (recurringCalendarSchedule || multipleCalendarSchedule) &&
    current.id === detail.id &&
    current.revisionId === detail.revisionId &&
    current.applicationPeriod === detail.applicationPeriod &&
    [current.applicationStart, current.applicationEnd].some(isCalendarDate) &&
    [current.applicationStart, current.applicationEnd].every(
      (value) => value === null || isCalendarDate(value),
    );
  return calendarSchedule
    ? {
        ...detail,
        applicationStart: current.applicationStart,
        applicationEnd: current.applicationEnd,
        applicationMonths: current.applicationMonths,
        applicationWindows: current.applicationWindows,
        applicationPrecision: current.applicationPrecision,
        applicationRecurrence: current.applicationRecurrence,
        applicationYear: current.applicationYear,
        calendarMonth: current.calendarMonth,
      }
    : detail;
}
