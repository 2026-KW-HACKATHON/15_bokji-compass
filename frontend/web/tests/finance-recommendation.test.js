import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationRepository } from '../src/features/assistant/recommendationRepository.js';
import { defaultProfile } from '../src/features/profile/profileModel.js';
import { emptyFinancialProfile } from '../src/features/finance/financeModel.js';

test('financial facts are only sent when explicitly supplied and contract fields are whitelisted', async () => {
  const calls = [];
  const repository = createRecommendationRepository({
    mode: 'api',
    request: async (path, options) => {
      calls.push(options.body);
      return { items: [], summary: '조건 확인 필요' };
    },
  });
  await repository.recommend(defaultProfile);
  assert.equal('financialProfile' in calls[0], false);
  const finance = emptyFinancialProfile();
  finance.members[0].earned_income = '2,000,000';
  finance.account_id = 'must-not-send';
  await repository.recommend(defaultProfile, { financialProfile: finance });
  assert.equal(calls[1].financialProfile.members[0].earned_income, 2_000_000);
  assert.equal(calls[1].financialProfile.assets.housing, null);
  assert.equal('account_id' in calls[1].financialProfile, false);
  assert.equal(finance.members[0].earned_income, '2,000,000');
});

test('demo recommendations do not claim or simulate financial eligibility', async () => {
  const repository = createRecommendationRepository({
    mode: 'demo',
    request: () => assert.fail('No API call in demo'),
  });
  const result = await repository.recommend(defaultProfile, {
    financialProfile: emptyFinancialProfile(),
  });
  assert.equal(result.source, 'demo');
  assert.match(result.summary, /예시/);
  assert.equal('eligibility' in result, false);
});
