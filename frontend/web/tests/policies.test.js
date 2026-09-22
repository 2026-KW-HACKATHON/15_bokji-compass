import test from 'node:test';
import assert from 'node:assert/strict';
import { listPolicies, filterPolicies } from '../src/features/policies/policyRepository.js';
import { isProfile } from '../src/features/profile/profileModel.js';
import { readStoredValue, writeStoredValue } from '../src/shared/storage.js';

test('repository identifies fixtures as demo and filtering does not mutate source order', async () => {
  const result = await listPolicies();
  assert.equal(result.source, 'demo');
  const before = result.items.map((item) => item.id);
  filterPolicies(result.items, { sort: 'name' });
  assert.deepEqual(
    result.items.map((item) => item.id),
    before,
  );
});

test('region includes nationwide policies and all filters combine', async () => {
  const { items } = await listPolicies();
  const seoul = filterPolicies(items, { region: '서울' });
  assert.equal(seoul.length, 4);
  assert.ok(seoul.every((item) => ['서울', '전국'].includes(item.region)));
  assert.deepEqual(
    filterPolicies(items, {
      query: '  청년   독립 ',
      category: '주거',
      region: '서울',
      audience: '청년',
    }).map((item) => item.id),
    ['demo-housing'],
  );
  assert.equal(filterPolicies(items, { category: '주거', region: '부산' }).length, 0);
  assert.equal(filterPolicies(items, { savedIds: [] }).length, 0);
  assert.equal(
    filterPolicies(items, { savedIds: ['demo-learning'], audience: '어르신' }).length,
    1,
  );
});

test('profile rejects corrupt persisted shapes', () => {
  assert.equal(isProfile(null), false);
  assert.equal(isProfile({ region: '서울', interests: '주거' }), false);
  assert.equal(isProfile({ region: '없는 지역', interests: [] }), false);
  assert.equal(isProfile({ region: '서울', interests: ['주거'] }), true);
});

test('storage handles malformed JSON, unexpected values, and blocked writes', () => {
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = {
      getItem: () => '{broken',
      setItem: () => {
        throw new Error('blocked');
      },
    };
    assert.deepEqual(readStoredValue('test', [], Array.isArray), []);
    globalThis.localStorage.getItem = () => '123';
    assert.deepEqual(readStoredValue('test', [], Array.isArray), []);
    assert.equal(writeStoredValue('test', []), false);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
