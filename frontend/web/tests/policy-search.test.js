import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPolicyRepository,
  filterPolicies,
} from '../src/features/policies/policyRepository.js';
import { matchesPolicySearch } from '../src/features/policies/policySearch.js';
import { searchPolicies } from './fixtures/policy-search.js';

const ids = (filters) => filterPolicies(searchPolicies, filters).map((item) => item.id);

test('search distinguishes a notice publisher from related title and body content', () => {
  assert.equal(ids({ query: '광운대' }).length, 11);
  assert.deepEqual(
    ids({ query: '광운대', searchScope: 'organization' }).sort(),
    searchPolicies
      .slice(0, 7)
      .map((item) => item.id)
      .sort(),
  );
  assert.deepEqual(
    ids({ query: '광운대', searchScope: 'content' }).sort(),
    [searchPolicies[0], ...searchPolicies.slice(7, 11)].map((item) => item.id).sort(),
  );
  assert.equal(ids({ query: '광운대' }).includes('search-metadata'), false);
  assert.equal(
    matchesPolicySearch(
      { region: '광운대', audience: '광운대', gender: '광운대', otherConditions: ['광운대'] },
      '광운대',
      'content',
    ),
    false,
  );
});

test('university formal names and short names match without inventing names for arbitrary words', () => {
  for (const searchScope of ['all', 'organization', 'content'])
    assert.deepEqual(
      ids({ query: '광운대학교', searchScope }),
      ids({ query: '광운대', searchScope }),
    );
  assert.equal(
    matchesPolicySearch({ organization: '지역 복지대학교' }, '복지', 'organization'),
    true,
  );
  assert.equal(matchesPolicySearch({ title: '취업 지원' }, '취대', 'content'), false);
  assert.equal(matchesPolicySearch({ title: 'KW 지원' }, '광운대', 'content'), false);
});

test('each search word is required in its selected scope and all may combine publisher and content', () => {
  assert.equal(ids({ query: '광운대 장학' }).length, 11);
  assert.equal(ids({ query: '광운대 장학', searchScope: 'organization' }).length, 0);
  assert.equal(ids({ query: '광운대 장학', searchScope: 'content' }).length, 5);
  assert.equal(ids({ query: '광운대 없는단어' }).length, 0);
  assert.equal(ids({ query: '   ', searchScope: 'content' }).length, searchPolicies.length);
});

test('matching ignores spaces and case within a field while preserving field boundaries and literals', () => {
  assert.equal(matchesPolicySearch({ title: '광운 대학교 ABC' }, '광운대 abc', 'content'), true);
  assert.equal(matchesPolicySearch({ title: '광', summary: '운대' }, '광운대', 'content'), false);
  assert.equal(matchesPolicySearch({ title: '일반 지원' }, '%', 'content'), false);
  assert.equal(matchesPolicySearch({ title: 'A_B 지원' }, 'a_b', 'content'), true);
  assert.equal(
    matchesPolicySearch({ sourceFields: { eligibility: '광운대 재학생' } }, '광운대', 'content'),
    true,
  );
});

test('list and calendar forward nondefault search scope and omit the default', async () => {
  const calls = [];
  const repository = createPolicyRepository({
    mode: 'api',
    request: async (path) => {
      calls.push(new URL(path, 'https://example.com').searchParams);
      return path.includes('/calendar?')
        ? {
            month: '2026-10',
            items: [],
            undatedItems: [],
            total: 0,
            undatedTotal: 0,
            truncated: false,
          }
        : { items: [], total: 0, nextCursor: null };
    },
  });
  for (const searchScope of ['organization', 'content', 'all']) {
    await repository.list({ query: '광운대', searchScope }, { cursor: 'next' });
    await repository.calendar('2026-10', { query: '광운대', searchScope });
  }
  for (let index = 0; index < calls.length; index += 1) {
    assert.equal(calls[index].get('q'), '광운대');
    assert.equal(
      calls[index].get('search_scope'),
      ['organization', 'content', null][Math.floor(index / 2)],
    );
    if (index % 2 === 0) assert.equal(calls[index].get('cursor'), 'next');
  }
});
