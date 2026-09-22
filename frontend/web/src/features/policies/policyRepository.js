import { demoPolicies } from './demoPolicies.js';

/** UI-only adapter. Replace with a documented public HTTP API when available. */
export async function listPolicies() {
  return { items: demoPolicies, source: 'demo' };
}

export function filterPolicies(
  items,
  {
    query = '',
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
