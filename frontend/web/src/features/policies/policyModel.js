import { ApiError } from '../../shared/api/httpClient.js';
export const categories = ['전체', '생활·금융', '주거', '일자리', '교육', '건강·돌봄', '문화'];
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
    sourceUrl: safeSourceUrl(item.sourceUrl),
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
