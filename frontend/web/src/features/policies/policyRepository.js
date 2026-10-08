import { parsePolicy, parsePolicyPage, parsePopularity } from './policyModel.js';
import { isCalendarDate } from '../calendar/calendarModel.js';
import { ApiError } from '../../shared/api/httpClient.js';
import { matchesPolicySearch } from './policySearch.js';
import { parseSearchMetadata } from './searchMetadata.js';
export function filterPolicies(
  items,
  {
    query = '',
    searchScope = 'all',
    tag = '',
    category = '전체',
    region = '전국',
    audience = '전체',
    sort = 'popular',
    savedIds = null,
  } = {},
) {
  return items
    .filter((item) => {
      return (
        matchesPolicySearch(item, query, searchScope) &&
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
    async options({ signal } = {}) {
      const result = await request(path + '/options', { signal });
      if (!Array.isArray(result?.providers))
        throw new ApiError('검색 범위를 불러오지 못했어요.', 'invalid_response');
      return result.providers.filter(
        (item) =>
          typeof item.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,50}$/.test(item.id) &&
          Array.isArray(item.organizations) &&
          item.organizations.every(
            (name) => typeof name === 'string' && name.length > 0 && name.length <= 100,
          ),
      );
    },
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
        search_scope: filters.searchScope,
        search_mode: filters.searchMode === 'literal' ? 'literal' : null,
        search_relation: filters.searchRelation,
        category: filters.category,
        region: filters.region,
        audience: filters.audience,
      })) {
        if (
          value &&
          !(key === 'search_scope' && value === 'all') &&
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
      const items = result.items.map((policy) => ({
          ...parsePolicy(policy),
          calendarMonth: month,
        })),
        undatedItems = result.undatedItems.map(parsePolicy);
      for (const policy of [...result.items, ...result.undatedItems]) {
        const recurringOngoing =
          policy.scheduleStatus === 'ongoing' &&
          policy.applicationRecurrence === 'yearly' &&
          policy.applicationYear === null &&
          isCalendarDate(policy.applicationStart) &&
          policy.applicationEnd === null;
        if (
          (policy.applicationPrecision === 'month_end' &&
            (policy.scheduleStatus !== 'dated' ||
              policy.applicationStart !== null ||
              !isCalendarDate(policy.applicationEnd))) ||
          (policy.applicationRecurrence &&
            (!['yearly', 'monthly'].includes(policy.applicationRecurrence) ||
              (policy.scheduleStatus !== 'dated' && !recurringOngoing) ||
              ![policy.applicationStart, policy.applicationEnd].some(isCalendarDate)))
        )
          throw new ApiError('공고 일정을 다시 확인해야 해요.', 'invalid_response');
        if (
          policy.applicationPrecision === 'month' &&
          (policy.scheduleStatus !== 'dated' ||
            !policy.applicationStart ||
            !policy.applicationEnd ||
            !Array.isArray(policy.applicationMonths) ||
            !policy.applicationMonths.length ||
            !policy.applicationMonths.every(
              (value) => Number.isInteger(value) && value >= 1 && value <= 12,
            ) ||
            (policy.applicationYear !== null &&
              (!Number.isInteger(policy.applicationYear) ||
                policy.applicationYear < 2000 ||
                policy.applicationYear > 2099)))
        )
          throw new ApiError('공고 일정을 다시 확인해야 해요.', 'invalid_response');
      }
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
      const search = parseSearchMetadata(result.search);
      return { ...result, search: search || undefined, items, undatedItems };
    },
    async list(filters = {}, { cursor = null, limit = 6, signal } = {}) {
      if (mode !== 'api' || !request)
        throw new ApiError('공고 연결 설정을 확인해 주세요.', 'configuration');
      const params = new URLSearchParams({ limit: String(limit) });
      if (filters.sort && filters.sort !== 'auto') params.set('sort', filters.sort);
      else if (!filters.query?.trim()) params.set('sort', 'popular');
      for (const band of filters.ageBands || []) params.append('age_bands', band);
      if (filters.ageMin !== '' && filters.ageMin != null) params.set('age_min', filters.ageMin);
      if (filters.ageMax !== '' && filters.ageMax != null) params.set('age_max', filters.ageMax);
      if (filters.eligibleOnly) params.set('eligible_only', 'true');
      for (const [key, value] of Object.entries({
        q: filters.query,
        search_scope: filters.searchScope,
        search_mode: filters.searchMode === 'literal' ? 'literal' : null,
        search_relation: filters.searchRelation,
        tag: filters.tag,
        category: filters.category,
        region: filters.region,
        audience: filters.audience,
        cursor,
        provider: filters.provider,
        organization: filters.organization,
        status: filters.status,
      })) {
        const unfiltered =
          ((key === 'category' || key === 'audience') && value === '전체') ||
          (key === 'search_scope' && value === 'all') ||
          (key === 'region' && value === '전국');
        if (value && !unfiltered) params.set(key, value);
      }
      return { ...parsePolicyPage(await request(path + '?' + params, { signal })), source: 'api' };
    },
  };
}
