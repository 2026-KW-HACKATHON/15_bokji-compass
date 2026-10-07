import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationRepository } from '../src/features/assistant/recommendationRepository.js';
import { parseRecommendationContext } from '../src/features/assistant/recommendationModel.js';
import { formatSignalDate, parsePolicy } from '../src/features/policies/policyModel.js';
import { demoPolicies } from './fixtures/policies.js';

test('visitors without profile request the server fallback and preserve its context', async () => {
  let body;
  const repository = createRecommendationRepository({
    mode: 'api',
    request: async (_, options) => {
      body = options.body;
      return {
        items: [{ policy: demoPolicies[2], reason: '일반 신청 대상으로 안내된 공고예요.' }],
        summary: '먼저 살펴볼 일반 공고',
        mode: 'general',
        profile_sufficient: false,
        guidance: '내 정보를 더 입력해 주세요.',
        missing_fields: ['age', 'residence_region', 'age'],
      };
    },
  });
  const result = await repository.recommend(null);
  assert.deepEqual(body, { profile: {}, limit: 3 });
  assert.equal(result.mode, 'general');
  assert.equal(result.profileSufficient, false);
  assert.equal(result.guidance, '내 정보를 더 입력해 주세요.');
  assert.deepEqual(result.missingFields, ['age', 'residence_region']);
});

test('only an explicit sufficient personalized response enables personal matching claims', () => {
  assert.equal(parseRecommendationContext({}).profileSufficient, false);
  assert.equal(parseRecommendationContext({}).mode, 'general');
  assert.equal(
    parseRecommendationContext({ mode: 'personalized', profile_sufficient: true })
      .profileSufficient,
    true,
  );
  for (const value of [
    { mode: 'personalized' },
    { mode: 'personalized', profile_sufficient: false },
    { mode: 'unknown' },
    { mode: 'general', profile_sufficient: 'true' },
    { mode: 'popular', missing_fields: ['age', 12] },
  ])
    assert.throws(
      () => parseRecommendationContext(value),
      (error) => error.code === 'invalid_response',
    );
});

test('popularity preserves a named source cumulative count and omits unsupported metrics', () => {
  const base = demoPolicies[2];
  const popularity = {
    views: 15231,
    source: 'gov24',
    basis: 'provider_cumulative_views',
    asOf: '2026-10-07T10:00:00+09:00',
  };
  assert.deepEqual(parsePolicy({ ...base, popularity }).popularity, popularity);
  assert.equal(parsePolicy(base).popularity, null);
  assert.equal(formatSignalDate('2026-10-07T23:00:00Z'), '2026-10-08');
  assert.equal(formatSignalDate('2026-10-07'), '2026-10-07');
  for (const invalid of [
    { ...popularity, views: -1 },
    { ...popularity, views: '123' },
    { ...popularity, views: 12.5 },
    { ...popularity, source: 'estimated' },
    { ...popularity, basis: 'recent_unique_users' },
  ])
    assert.equal(parsePolicy({ ...base, popularity: invalid }).popularity, null);
});

test('budget percent needs both explicit evidence and a safe official-source link', () => {
  const base = demoPolicies[2];
  const budget = {
    usedPercent: 67.5,
    sourceUrl: 'https://www.gov.kr/notice',
    asOf: '2026-10-07',
    evidence: '공식 공고에 예산 소진률 67.5%로 명시됨',
  };
  assert.deepEqual(parsePolicy({ ...base, budget }).budget, budget);
  assert.equal(parsePolicy(base).budget, null);
  for (const invalid of [
    { ...budget, usedPercent: 101 },
    { ...budget, usedPercent: -1 },
    { ...budget, usedPercent: '67.5' },
    { ...budget, sourceUrl: 'javascript:alert(1)' },
    { ...budget, sourceUrl: 'http://www.gov.kr/notice' },
    { ...budget, evidence: '' },
  ])
    assert.equal(parsePolicy({ ...base, budget: invalid }).budget, null);
  assert.equal(
    parsePolicy({ ...base, budgetNotice: '예산 소진 시 조기 마감' }).budgetNotice,
    '예산 소진 시 조기 마감',
  );
  assert.equal(parsePolicy({ ...base, budgetNotice: 77 }).budgetNotice, null);
  assert.equal(parsePolicy({ ...base, budgetNotice: ' ' }).budgetNotice, null);
  assert.equal(parsePolicy({ ...base, budgetNotice: 'a'.repeat(501) }).budgetNotice, null);
});
