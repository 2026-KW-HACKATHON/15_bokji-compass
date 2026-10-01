import { parsePolicyPage } from './policyModel.js';
import { ApiError } from '../../shared/api/httpClient.js';
export function filterPolicies(
  items,
  {
    query = '',
    tag = '',
    category = '전체',
    region = '전국',
    audience = '전체',
    sort = 'recent',
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
    .sort((a, b) =>
      sort === 'name' ? a.title.localeCompare(b.title, 'ko') : b.date.localeCompare(a.date),
    );
}
export function createPolicyRepository({ mode, request, path = '/v1/policies' }) {
  return {
    async list(filters = {}, { cursor = null, limit = 6, signal } = {}) {
      if (mode !== 'api' || !request)
        throw new ApiError('공고 연결 설정을 확인해 주세요.', 'configuration');
      const params = new URLSearchParams({ limit: String(limit), sort: filters.sort || 'recent' });
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
