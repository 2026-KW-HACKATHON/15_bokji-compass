import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFinancialProfile,
  emptyMember,
  moneyInput,
} from '../src/features/finance/financeModel.js';
import {
  financeRegionFor,
  quickDefaultsFromFinance,
  applyQuickDefaults,
  financialDraftDefaults,
  financialIncomeSignature,
} from '../src/features/finance/financePrefill.js';

test('member defaults use actual age and confirmed region without guessing family size or other members', () => {
  const draft = financialDraftDefaults({
    user: { age: 42, region: '경기' },
    recommendation: { household: '가족과 살아요' },
    quick: { householdSize: '4' },
    useQuickHousehold: true,
  });
  assert.equal(draft.region, 'gyeonggi');
  assert.equal(draft.members[0].age, 42);
  assert.equal(draft.household_size, 4);
  assert.equal(draft.members[1].age, null);
  assert.equal(draft.members[0].earned_income, null);
  const unknown = financialDraftDefaults({
    recommendation: { ageBand: '65세 이상', household: '가족과 살아요' },
  });
  assert.equal(unknown.members[0].age, null);
  assert.equal(unknown.household_size, 1);
  assert.equal(financeRegionFor('경남'), 'unknown');
  assert.equal(financeRegionFor('전국'), 'unknown');
  assert.equal(financeRegionFor('인천'), 'metropolitan');
});

test('saved household and exact unknown/zero values remain intact; only explicit quick count changes resize', () => {
  const saved = emptyFinancialProfile();
  saved.household_size = 4;
  saved.members = Array.from({ length: 4 }, emptyMember);
  saved.members[0].age = 70;
  saved.assets.rental_deposit = 0;
  saved.minor_children = 3;
  saved.household_scope_confirmed = true;
  const draft = financialDraftDefaults({ user: { age: 42 }, saved });
  assert.deepEqual(draft, saved);
  assert.notEqual(draft, saved);
  const resized = financialDraftDefaults({
    saved,
    quick: { householdSize: '2' },
    useQuickHousehold: true,
  });
  assert.equal(resized.members.length, 2);
  assert.equal(resized.minor_children, null);
  assert.equal(resized.household_scope_confirmed, false);
  assert.equal(saved.members.length, 4);
});

test('quick defaults only sum known correctly based income and retain precise won amounts', () => {
  const profile = emptyFinancialProfile();
  assert.deepEqual(quickDefaultsFromFinance(profile), {
    householdSize: '1',
    largeHousehold: false,
  });
  Object.assign(profile.members[0], {
    earned_income: 1234567,
    earned_income_basis: 'gross',
    business_income: 0,
    other_income: 0,
    private_transfer_income: 0,
  });
  assert.equal(quickDefaultsFromFinance(profile).monthlyIncome, '123.4567');
  profile.members[0].earned_income_basis = 'net';
  assert.equal(quickDefaultsFromFinance(profile).monthlyIncome, undefined);
  Object.assign(profile.members[0], {
    earned_income: 0,
    business_income: moneyInput('0'),
    business_income_basis: 'unknown',
  });
  assert.equal(quickDefaultsFromFinance(profile).monthlyIncome, '0');
  profile.members[0].other_income = null;
  assert.equal(quickDefaultsFromFinance(profile).monthlyIncome, undefined);
});

test('late account defaults cannot overwrite explicitly edited quick values', () => {
  const draft = { householdSize: '3', monthlyIncome: '123', largeHousehold: false };
  const incoming = { householdSize: '8', monthlyIncome: '400' };
  assert.deepEqual(
    applyQuickDefaults(draft, incoming, new Set(['householdSize', 'monthlyIncome'])),
    draft,
  );
  assert.deepEqual(applyQuickDefaults(draft, incoming, new Set(['monthlyIncome'])), {
    householdSize: '8',
    monthlyIncome: '123',
    largeHousehold: true,
  });
});

test('unconfirmed incoming income clears an old automatic total but preserves a manual total', () => {
  const draft = { householdSize: '4', monthlyIncome: '300', largeHousehold: false };
  const incoming = { householdSize: '4', largeHousehold: false };
  assert.equal(applyQuickDefaults(draft, incoming).monthlyIncome, '');
  assert.equal(
    applyQuickDefaults(draft, incoming, new Set(['monthlyIncome'])).monthlyIncome,
    '300',
  );
});

test('age and deduction edits do not change the income signature used for quick synchronization', () => {
  const draft = emptyFinancialProfile();
  const before = financialIncomeSignature(draft);
  draft.members[0].age = 42;
  draft.members[0].deduction = 'student';
  assert.equal(financialIncomeSignature(draft), before);
  draft.members[0].earned_income = 0;
  assert.notEqual(financialIncomeSignature(draft), before);
});
