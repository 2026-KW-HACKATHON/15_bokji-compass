import test from 'node:test';
import assert from 'node:assert/strict';
import { countChoices, readCount } from '../../packages/core/src/countChoices.js';
import { financeQuestions, validateQuestion } from '../src/features/finance/financeFlow.js';
import {
  emptyFinancialProfile,
  emptyMember,
  toFinancialProfile,
} from '../src/features/finance/financeModel.js';

test('count choices distinguish unknown, zero and exact large saved counts', () => {
  for (const value of [null, undefined, '', ' ', '1e4', '1.5', '2,3', '-1']) {
    assert.equal(readCount(value), null);
  }
  assert.equal(readCount(0), 0);
  assert.equal(readCount('13'), 13);
  assert.equal(readCount('1,000'), 1000);
});

test('common children and household choices expand to exact counts without truncating them', () => {
  assert.deepEqual(countChoices({ groupFrom: 3, manualFrom: 9 }).common, [0, 1, 2]);
  assert.deepEqual(countChoices({ groupFrom: 3, manualFrom: 9 }).exact, [3, 4, 5, 6, 7, 8]);
  const household = countChoices({ min: 1, max: 100, groupFrom: 7, manualFrom: 12 });
  assert.deepEqual(household.common, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(household.exact, [7, 8, 9, 10, 11]);
  assert.equal(household.manual, true);
  assert.equal(household.max, 100);
});

test('child choices respect the household size, including small and large households', () => {
  const small = countChoices({ max: 2 });
  assert.deepEqual(small.common, [0, 1, 2]);
  assert.equal(small.grouped, false);
  assert.deepEqual(small.exact, []);
  const eight = countChoices({ max: 8 });
  assert.deepEqual(eight.exact, [3, 4, 5, 6, 7, 8]);
  assert.equal(eight.manual, false);
  assert.equal(countChoices({ max: 13 }).max, 13);
});

test('unresolved grouped choices stay unknown while an explicit exact count is validated and calculated', () => {
  const draft = emptyFinancialProfile();
  draft.household_size = 13;
  draft.members = Array.from({ length: 13 }, emptyMember);
  const questions = financeQuestions(draft);
  const householdQuestion = questions.find((question) =>
    question.fields.some((field) => field.path === 'household_size'),
  );
  const childrenQuestion = questions.find((question) =>
    question.fields.some((field) => field.path === 'minor_children'),
  );
  assert.equal(
    householdQuestion.fields.find((field) => field.path === 'household_size').countChoices
      .groupFrom,
    7,
  );
  assert.equal(
    childrenQuestion.fields.find((field) => field.path === 'minor_children').countChoices.groupFrom,
    3,
  );
  draft.minor_children = null;
  assert.equal(toFinancialProfile(draft).minor_children, null);
  draft.minor_children = 9;
  assert.equal(toFinancialProfile(draft).minor_children, 9);
  draft.minor_children = 14;
  assert.equal(validateQuestion(childrenQuestion, draft).field, 'finance-children');
  draft.household_size = null;
  assert.equal(validateQuestion(householdQuestion, draft).field, 'finance-household');
});
