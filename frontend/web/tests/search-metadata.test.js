import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSearchMetadata,
  parseSearchMatch,
  effectivePolicySort,
  searchRelationForScope,
} from '../src/features/policies/searchMetadata.js';
import { parsePolicy, parsePolicyPage } from '../src/features/policies/policyModel.js';
import { createPolicyRepository } from '../src/features/policies/policyRepository.js';

const match = {
  relations: ['student_general'],
  reason: '대학생 대상 등록금 지원을 찾았어요.',
  evidence: [{ field: 'eligibility', quote: '국내 대학 재학생 대상' }],
};
const search = {
  mode: 'smart',
  summary: '대학생 등록금 지원으로 이해했어요.',
  originalQuery: '광운데 재학생 등록금 도와주는거',
  interpretedQuery: '광운대 대학생 등록금 지원',
  corrections: [{ from: '광운데', to: '광운대' }],
  alternatives: [{ scope: 'all', label: '함께 찾은 공고', count: 1 }],
  warnings: ['신청 자격은 공고 조건을 확인해 주세요.'],
};
const policy = {
  id: 'metadata',
  title: '등록금 지원',
  summary: '대학생 지원',
  tags: [],
  searchMatch: match,
};

test('smart metadata and grounded matches preserve only their public contract fields', () => {
  const parsed = parseSearchMetadata({ ...search, internalPlan: { private: 'excluded' } });
  assert.deepEqual(parsed, search);
  assert.deepEqual(parseSearchMatch({ ...match, score: 99 }), match);
  const page = parsePolicyPage({ items: [policy], total: 1, nextCursor: null, search });
  assert.deepEqual(page.search, search);
  assert.deepEqual(page.items[0].searchMatch, match);
  assert.equal(parsePolicy({ ...policy, searchMatch: null }).searchMatch, null);
});

test('malformed optional metadata is omitted without breaking valid catalog results', () => {
  for (const value of [
    { ...search, mode: 'unknown' },
    { ...search, summary: '<script>'.repeat(200) },
    { ...search, alternatives: [{ scope: 'all', label: '전체', count: -1 }] },
    { ...search, corrections: [{ from: '광운데', to: 123 }] },
    { ...search, warnings: [null] },
  ]) {
    assert.equal(parseSearchMetadata(value), null);
    assert.equal(
      parsePolicyPage({ items: [policy], total: 1, nextCursor: null, search: value }).search,
      undefined,
    );
  }
  for (const value of [
    { ...match, relations: ['eligible'] },
    { ...match, evidence: [] },
    { ...match, evidence: [{ field: {}, quote: '학교 지원 대상' }] },
    { ...match, evidence: [{ field: 'contact', quote: '광운대학교 문의' }] },
    { ...match, evidence: [{ field: 'eligibility', quote: 'x'.repeat(251) }] },
  ])
    assert.equal(parseSearchMatch(value), null);
});

test('automatic sorting prioritizes interpreted query relevance while keeping explicit choices', async () => {
  assert.equal(effectivePolicySort(), 'popular');
  assert.equal(effectivePolicySort({ query: '말로 찾는 공고', sort: 'auto' }), 'relevance');
  assert.equal(effectivePolicySort({ query: '광운대', searchScope: 'organization' }), 'popular');
  assert.equal(effectivePolicySort({ query: '광운데', searchMode: 'literal' }), 'popular');
  assert.equal(effectivePolicySort({ query: '장학금', sort: 'recent' }), 'recent');
  const calls = [];
  const repository = createPolicyRepository({
    mode: 'api',
    request: async (path) => {
      calls.push(new URL(path, 'https://example.test').searchParams);
      return { items: [], total: 0, nextCursor: null };
    },
  });
  await repository.list({ query: '광운데 등록금 도와주는거', sort: 'auto' });
  await repository.list({ query: '', sort: 'auto' });
  await repository.list({ query: '장학금', sort: 'popular' });
  await repository.list({ query: '광운데', searchMode: 'literal' });
  await repository.list({ query: '광운대', searchRelation: 'related' });
  assert.equal(calls[0].has('sort'), false);
  assert.equal(calls[0].get('q'), '광운데 등록금 도와주는거');
  assert.equal(calls[1].get('sort'), 'popular');
  assert.equal(calls[2].get('sort'), 'popular');
  assert.equal(calls[3].get('search_mode'), 'literal');
  assert.equal(calls[4].get('search_relation'), 'related');
  assert.equal(calls[4].has('search_scope'), false);
  assert.equal(calls[4].has('search_mode'), false);
  assert.equal(searchRelationForScope('organization'), 'publisher');
  assert.equal(searchRelationForScope('content'), 'related');
  assert.equal(searchRelationForScope('all'), '');
});

test('calendar metadata and search evidence survive parsing while invalid optional metadata is dropped', async () => {
  let path;
  const result = {
    month: '2026-10',
    items: [policy],
    undatedItems: [],
    total: 1,
    undatedTotal: 0,
    truncated: false,
    search,
  };
  const repository = createPolicyRepository({
    mode: 'api',
    request: async (value) => {
      path = value;
      return result;
    },
  });
  const value = await repository.calendar('2026-10', {
    query: search.originalQuery,
    searchMode: 'literal',
    searchRelation: 'publisher',
  });
  assert.deepEqual(value.search, search);
  assert.deepEqual(value.items[0].searchMatch, match);
  assert.equal(new URL(path, 'https://example.test').searchParams.get('search_mode'), 'literal');
  assert.equal(
    new URL(path, 'https://example.test').searchParams.get('search_relation'),
    'publisher',
  );
  result.search = { ...search, corrections: 'broken' };
  assert.equal((await repository.calendar('2026-10')).search, undefined);
});
