import { ApiError } from '../../shared/api/httpClient.js';
import { isCalendarDate } from '../calendar/calendarModel.js';
import { parseLocalArea } from './localModel.js';

const categories = new Set(['transport', 'health', 'care', 'culture']);
const scopes = new Set(['national', 'province', 'district', 'neighborhood']);
const validText = (value, max = 2000) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
const fail = () => {
  throw new ApiError('생활서비스 응답을 확인하지 못했어요.', 'invalid_response');
};

function sourceUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseLocalServicePage(value) {
  if (
    !Array.isArray(value?.items) ||
    !validCount(value.total) ||
    value.total !== value.items.length ||
    !Array.isArray(value.coverage?.regions) ||
    !validCount(value.coverage.totalServices) ||
    !validCount(value.coverage.totalDistricts) ||
    !isCalendarDate(value.checkedAt) ||
    !validText(value.focus?.region, 30) ||
    !validText(value.focus?.district, 80) ||
    !validText(value.focus?.neighborhood, 80)
  )
    fail();
  const ids = new Set();
  const items = value.items.map((item) => {
    if (
      !validText(item?.id, 120) ||
      ids.has(item.id) ||
      !categories.has(item.category) ||
      !['title', 'summary', 'area', 'audience', 'cost', 'usage', 'sourceName', 'evidence'].every(
        (key) => validText(item[key]),
      ) ||
      !sourceUrl(item.sourceUrl) ||
      !isCalendarDate(item.checkedAt) ||
      (item.sourcePublishedAt !== null && !isCalendarDate(item.sourcePublishedAt)) ||
      !Array.isArray(item.coverage) ||
      !item.coverage.length ||
      !Array.isArray(item.focusAreas)
    )
      fail();
    for (const place of item.coverage) {
      if (
        !scopes.has(place.scope) ||
        typeof place.region !== 'string' ||
        typeof place.district !== 'string' ||
        !Array.isArray(place.neighborhoods) ||
        !place.neighborhoods.every((name) => validText(name, 80)) ||
        ![null, 'administrative', 'legal'].includes(place.neighborhoodType)
      )
        fail();
    }
    for (const place of item.focusAreas) {
      if (
        !validText(place.region, 30) ||
        !validText(place.district, 80) ||
        !validText(place.neighborhood, 80) ||
        !['administrative', 'legal'].includes(place.neighborhoodType)
      )
        fail();
    }
    ids.add(item.id);
    return { ...item, sourceUrl: sourceUrl(item.sourceUrl) };
  });
  const areas = value.coverage.regions.map((place) => {
    if (
      typeof place?.region !== 'string' ||
      typeof place.district !== 'string' ||
      !validCount(place.count)
    )
      fail();
    return { region: place.region, district: place.district, count: place.count };
  });
  return { ...value, items, coverage: { ...value.coverage, regions: areas } };
}

export function createLocalServiceRepository({ request }) {
  return {
    async list(filters = {}, { signal } = {}) {
      // Reparse locality words; never forward an address, postcode, or arbitrary fields.
      const area = parseLocalArea(
        [filters.region, filters.district, filters.neighborhood].filter(Boolean).join(' '),
      );
      if (!area) throw new ApiError('생활지역을 확인해 주세요.', 'invalid_region');
      const params = new URLSearchParams({
        region: area.region,
        district: area.district,
        neighborhood: area.neighborhood,
        neighborhood_type: 'unknown',
        category: categories.has(filters.category) ? filters.category : 'all',
        scope: filters.scope === 'neighborhood' && area.neighborhood ? 'neighborhood' : 'all',
      });
      return parseLocalServicePage(await request('/v1/local-services?' + params, { signal }));
    },
  };
}
