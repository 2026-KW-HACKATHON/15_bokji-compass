import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationRepository } from '../src/features/assistant/recommendationRepository.js';
import { defaultProfile } from '../src/features/profile/profileModel.js';
import { emptyFinancialProfile } from '../src/features/finance/financeModel.js';
import { createHttpClient } from '../src/shared/api/httpClient.js';

test('financial facts are only sent when explicitly supplied and contract fields are whitelisted', async () => {
  const calls = [];
  const options = [];
  const repository = createRecommendationRepository({
    mode: 'api',
    request: async (path, config) => {
      calls.push(config.body);
      options.push(config);
      return { items: [], summary: '조건 확인 필요' };
    },
  });
  await repository.recommend(defaultProfile);
  assert.equal('financialProfile' in calls[0], false);
  assert.equal(options[0].authenticated, true);
  const finance = emptyFinancialProfile();
  finance.members[0].earned_income = '2,000,000';
  finance.account_id = 'must-not-send';
  await repository.recommend(defaultProfile, { financialProfile: finance });
  assert.equal(calls[1].financialProfile.members[0].earned_income, 2_000_000);
  assert.equal(calls[1].financialProfile.assets.housing, null);
  assert.equal('account_id' in calls[1].financialProfile, false);
  assert.equal(finance.members[0].earned_income, '2,000,000');
});

test('recommendations send member cookies and the request guard without attaching stored finance', async () => {
  let captured;
  const request = createHttpClient({
    fetchImpl: async (url, options) => {
      captured = options;
      return { ok: true, json: async () => ({ items: [], summary: '추가 확인 필요' }) };
    },
  });
  await createRecommendationRepository({ mode: 'api', request }).recommend(defaultProfile);
  assert.equal(captured.credentials, 'include');
  assert.equal(captured.headers['X-Auth-Request'], '1');
  assert.equal(captured.cache, 'no-store');
  assert.equal(captured.redirect, 'error');
  assert.equal('financialProfile' in JSON.parse(captured.body), false);
  assert.equal('use_saved_financial_profile' in JSON.parse(captured.body), false);
});

test('removed demo mode cannot simulate financial eligibility', async () => {
  const repository = createRecommendationRepository({ mode: 'demo' });
  await assert.rejects(
    repository.recommend(defaultProfile, { financialProfile: emptyFinancialProfile() }),
    (e) => e.code === 'configuration',
  );
});
