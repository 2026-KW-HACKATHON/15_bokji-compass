import test from 'node:test';
import assert from 'node:assert/strict';
import { categories, parsePolicy } from '../src/features/policies/policyModel.js';
import {
  createPolicyRepository,
  filterPolicies,
} from '../src/features/policies/policyRepository.js';
import { demoPolicies } from './fixtures/policies.js';

const signal = (views) => ({
  views,
  source: 'gov24',
  basis: 'provider_cumulative_views',
});
const policy = (id, date, popularity = null) => ({
  ...demoPolicies[0],
  id,
  date,
  popularity,
});

test('popular sorting uses verified views, keeps zero before missing, and resolves ties', () => {
  const items = [
    policy('unknown', '2026-10-07'),
    policy('zero', '2026-01-01', signal(0)),
    policy('lower', '2026-10-06', signal(10)),
    policy('top-b', '2026-09-01', signal(100)),
    policy('top-a', '2026-09-01', signal(100)),
    policy('top-new', '2026-09-02', signal(100)),
    policy('invalid', '2026-10-05', signal(-1)),
    policy('unverified', '2026-10-04', { ...signal(10000), source: 'unknown' }),
  ];
  const originalIds = items.map((item) => item.id);
  assert.deepEqual(
    filterPolicies(items).map((item) => item.id),
    ['top-new', 'top-a', 'top-b', 'lower', 'zero', 'unknown', 'invalid', 'unverified'],
  );
  assert.deepEqual(
    items.map((item) => item.id),
    originalIds,
  );
  assert.equal(filterPolicies(items, { sort: 'recent' })[0].id, 'unknown');
});

test('new fields are preserved on cards and can be filtered with popularity sorting', () => {
  const items = ['농림축산·어업', '사업·창업', '기타'].map((category, index) =>
    parsePolicy({
      ...policy(String(index), '2026-10-07', signal(index)),
      category,
      tags: [category],
    }),
  );
  for (const item of items) {
    assert.ok(categories.includes(item.category));
    assert.equal(filterPolicies(items, { category: item.category })[0].id, item.id);
  }
  assert.equal(items[0].icon, 'sprout');
  assert.equal(items[1].icon, 'store');
});

test('repository defaults to popular and sends category, explicit sort and cursor together', async () => {
  const calls = [];
  const repository = createPolicyRepository({
    mode: 'api',
    request: async (url) => {
      calls.push(new URL(url, 'https://example.com').searchParams);
      return { items: [], total: 0, nextCursor: null };
    },
  });
  await repository.list();
  assert.equal(calls[0].get('sort'), 'popular');
  await repository.list({ category: '농림축산·어업', sort: 'recent' }, { cursor: '6' });
  assert.equal(calls[1].get('category'), '농림축산·어업');
  assert.equal(calls[1].get('sort'), 'recent');
  assert.equal(calls[1].get('cursor'), '6');
});
