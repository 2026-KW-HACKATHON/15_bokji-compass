import { demoPolicies } from './policies.js';
import { filterPolicies } from '../../src/features/policies/policyRepository.js';

// Browser test transport only. Never imported by the application.
export async function mockPolicyApi(page) {
  const details = new Map(demoPolicies.map((policy) => [policy.id, policy]));
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (!response.ok() || !['/api/v1/policies', '/api/v1/recommendations'].includes(url.pathname))
      return;
    try {
      for (const item of (await response.json()).items || []) {
        const policy = item.policy || item;
        if (policy.id) details.set(policy.id, policy);
      }
    } catch {
      /* Responses can be aborted during navigation. */
    }
  });
  await page.route(/\/api\/v1\/policies\/[^/?]+$/, (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1));
    const policy = details.get(id);
    return route.fulfill(policy ? { json: policy } : { status: 404, json: {} });
  });
  await page.route('**/api/v1/policies?**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const filters = Object.fromEntries(query);
    filters.query = query.get('q') || '';
    filters.searchScope = query.get('search_scope') || 'all';
    const all = filterPolicies(demoPolicies, filters);
    const offset = Number(query.get('cursor') || 0);
    const limit = Number(query.get('limit') || 6);
    return route.fulfill({
      json: {
        items: all.slice(offset, offset + limit),
        total: all.length,
        nextCursor: offset + limit < all.length ? String(offset + limit) : null,
      },
    });
  });
  await page.route('**/api/v1/recommendations', (route) => {
    const { profile } = route.request().postDataJSON();
    const scored = demoPolicies
      .map((policy) => ({
        policy,
        score:
          (profile?.interests?.includes(policy.category) ? 2 : 0) +
          (policy.region === profile?.region ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    return route.fulfill({
      json: {
        summary: '테스트 서버 응답',
        items: scored.slice(0, 3).map(({ policy }) => ({ policy, reason: '테스트 추천 이유' })),
      },
    });
  });
}
