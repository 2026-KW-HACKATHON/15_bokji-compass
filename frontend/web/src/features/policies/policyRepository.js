import { parsePolicy, parsePolicyPage, parsePopularity } from './policyModel.js';
import { isCalendarDate } from '../calendar/calendarModel.js';
import { ApiError } from '../../shared/api/httpClient.js';
export function filterPolicies(
  items,
  {
    query = '',
    tag = '',
    category = '전체',
    region = '전국',
    audience = '전체',
    sort = 'popular',
    savedIds = null,
  } = {},
) {
  const terms = query.trim().toLocaleLowerCase('ko').split(/\s+/).filter(Boolean);
  return items
    .filter((item) => {
      const text = [item.title, item.summary, item.category, item.region, ...item.tags]
        .join(' ')
        .toLocaleLowerCase('ko');
      return (
        terms.every((term) => text.includes(term)) &&
        (!tag || item.tags.includes(tag)) &&
        (category === '전체' || item.category === category) &&
        (region === '전국' || item.region === '전국' || item.region === region) &&
        (audience === '전체' || item.audience === '전체' || item.audience === audience) &&
        (savedIds === null || savedIds.includes(item.id))
      );
    })
    .sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title, 'ko');
      if (sort === 'popular') {
        const aViews = parsePopularity(a.popularity)?.views ?? null;
        const bViews = parsePopularity(b.popularity)?.views ?? null;
        const popularityOrder =
          Number(bViews !== null) - Number(aViews !== null) || (bViews ?? 0) - (aViews ?? 0);
        if (popularityOrder) return popularityOrder;
      }
      return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
    });
}
export function createPolicyRepository({ mode, request, path = '/v1/policies' }) {
  return {
    async get(id, { signal } = {}) {
      if (mode !== 'api' || !request)
        throw new ApiError('공고 연결 설정을 확인해 주세요.', 'configuration');
      return parsePolicy(await request(path + '/' + encodeURIComponent(id), { signal }));
    },
    async calendar(month, filters = {}, { signal } = {}) {
      if (mode !== 'api' || !request)
        throw new ApiError('공고 연결 설정을 확인해 주세요.', 'configuration');
      const params = new URLSearchParams({ month });
      for (const [key, value] of Object.entries({
        q: filters.query,
        category: filters.category,
        region: filters.region,
        audience: filters.audience,
      })) {
        if (
          value &&
          !((key === 'category' || key === 'audience') && value === '전체') &&
          !(key === 'region' && value === '전국')
        )
          params.set(key, value);
      }
      const result = await request(path + '/calendar?' + params, { signal });
      if (
        result?.month !== month ||
        !Array.isArray(result.items) ||
        !Array.isArray(result.undatedItems) ||
        !Number.isInteger(result.total) ||
        result.total < result.items.length ||
        !Number.isInteger(result.undatedTotal) ||
        result.undatedTotal < result.undatedItems.length ||
        typeof result.truncated !== 'boolean'
      )
        throw new ApiError('캘린더 정보의 형식이 올바르지 않아요.', 'invalid_response');
      const items = result.items.map(parsePolicy),
        undatedItems = result.undatedItems.map(parsePolicy);
      for (const policy of [...items, ...undatedItems]) {
        if (
          [policy.applicationStart, policy.applicationEnd].some(
            (date) => date !== null && !isCalendarDate(date),
          ) ||
          (policy.applicationStart &&
            policy.applicationEnd &&
            policy.applicationStart > policy.applicationEnd)
        )
          throw new ApiError('공고 일정을 다시 확인해야 해요.', 'invalid_response');
      }
      return { ...result, items, undatedItems };
    },
    async list(filters = {}, { cursor = null, limit = 6, signal } = {}) {
      if (mode !== 'api' || !request)
        throw new ApiError('공고 연결 설정을 확인해 주세요.', 'configuration');
      const params = new URLSearchParams({ limit: String(limit), sort: filters.sort || 'popular' });
      for (const [key, value] of Object.entries({
        q: filters.query,
        tag: filters.tag,
        category: filters.category,
        region: filters.region,
        audience: filters.audience,
        cursor,
      })) {
        const unfiltered =
          ((key === 'category' || key === 'audience') && value === '전체') ||
          (key === 'region' && value === '전국');
        if (value && !unfiltered) params.set(key, value);
      }
      return { ...parsePolicyPage(await request(path + '?' + params, { signal })), source: 'api' };
    },
  };
}
