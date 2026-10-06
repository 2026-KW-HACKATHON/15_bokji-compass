import test from 'node:test';
import assert from 'node:assert/strict';
import { medianForHousehold, monthlyIncomeRatio } from '../src/features/finance/medianIncome.js';
import {
  defaultProfile,
  occupations,
  isProfile,
  normalizeProfile,
  recommendationProfile,
} from '../src/features/profile/profileModel.js';

test('2026 official household amounts and large-household increment are preserved', () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, i) => medianForHousehold(i + 1)),
    [2564238, 4199292, 5359036, 6494738, 7556719, 8555952, 9515150],
  );
  assert.equal(medianForHousehold(8), 10474348);
  assert.equal(medianForHousehold(13), 15270338);
  assert.equal(medianForHousehold(100), 98720564);
  for (const size of ['', 0, -1, '1.5', 101])
    assert.throws(() => medianForHousehold(size), /가구원/);
});

test('quick income distinguishes missing and zero, preserves won precision and validates input', () => {
  assert.equal(monthlyIncomeRatio('', 2564238), null);
  assert.deepEqual(monthlyIncomeRatio('0', 2564238), { income: 0, percent: 0 });
  assert.deepEqual(monthlyIncomeRatio('300', 6494738), { income: 3000000, percent: 46.2 });
  assert.equal(monthlyIncomeRatio('123.4567', 2564238).income, 1234567);
  assert.equal(monthlyIncomeRatio('1,200', 6494738).income, 12000000);
  for (const text of ['-1', '0.00001', '1,23', 'abc', '100000001'])
    assert.throws(() => monthlyIncomeRatio(text, 2564238));
});

test('retirement is no longer offered and legacy browser profiles retain other preferences', () => {
  const old = {
    ...defaultProfile,
    region: '서울',
    ageBand: '65세 이상',
    occupation: '은퇴 후',
    interests: ['주거'],
  };
  assert.equal(occupations.includes('은퇴 후'), false);
  assert.equal(isProfile(old), true);
  assert.deepEqual(normalizeProfile(old), { ...old, occupation: '선택하지 않음' });
  assert.equal(recommendationProfile(old).occupation, null);
  assert.equal(old.occupation, '은퇴 후');
});
