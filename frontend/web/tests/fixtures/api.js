import { demoPolicies } from './policies.js';
import { filterPolicies } from '../../src/features/policies/policyRepository.js';

// Browser test transport only. Never imported by the application.
export async function mockPolicyApi(page) {
  await page.route('**/api/v1/policies?**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const filters = Object.fromEntries(query);
    filters.query = query.get('q') || '';
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
          (profile.interests.includes(policy.category) ? 2 : 0) +
          (policy.region === profile.region ? 1 : 0),
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
