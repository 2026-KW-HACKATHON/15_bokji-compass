import { ApiError } from '../../shared/api/httpClient.js';
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
  return {
    id: item.id,
    revisionId: typeof item.revisionId === 'string' ? item.revisionId : null,
    title: item.title,
    summary: item.summary,
    tags: [...new Set(item.tags)],
    category,
    icon,
    tone,
    region: text('region', '지역 확인 필요'),
    audience: text('audience', '전체'),
    organization: text('organization', '기관 확인 필요'),
    benefit: text('benefit', '상세 안내 확인'),
    date: text('date', ''),
    applicationPeriod: text('applicationPeriod', '공식 공고에서 확인'),
    paymentSchedule: text('paymentSchedule', null),
    applicationStart: text('applicationStart', null),
    applicationEnd: text('applicationEnd', null),
    scheduleStatus: ['dated', 'ongoing', 'unknown'].includes(item.scheduleStatus)
      ? item.scheduleStatus
      : 'unknown',
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
  return { items, total: result.total, nextCursor: result.nextCursor };
}
