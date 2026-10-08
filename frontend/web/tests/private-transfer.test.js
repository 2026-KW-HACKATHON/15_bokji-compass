import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFinancialProfile,
  emptyPrivateTransferHistory,
  moneyInput,
  toFinancialProfile,
  currentTransferMonth,
  transferMonthLabels,
  preparePrivateTransferEdit,
  repeatPrivateTransferMonths,
} from '../src/features/finance/financeModel.js';
import {
  financeQuestions,
  visibleFields,
  validateQuestion,
} from '../src/features/finance/financeFlow.js';

test('support history keeps explicit unknown months, amounts in won, and receipt counts', () => {
  const draft = emptyFinancialProfile();
  draft.private_transfer_history.status = 'received';
  draft.private_transfer_history.months[0] = { amount: moneyInput('65'), count: '2' };
  const raw = toFinancialProfile(draft);
  assert.deepEqual(raw.private_transfer_history.months[0], { amount: 650000, count: 2 });
  assert.equal(raw.private_transfer_history.months[1].amount, null);
  assert.equal(raw.private_transfer_history.unentered_months_zero, false);
  assert.deepEqual(toFinancialProfile(raw), raw);
  raw.private_transfer_history.months[0].count = true;
  assert.throws(() => toFinancialProfile(raw));
});

test('additional questions appear only when support is received and counts follow positive amounts', () => {
  const draft = emptyFinancialProfile();
  assert.equal(
    financeQuestions(draft).some((q) => q.id === 'private-transfer-months'),
    false,
  );
  draft.private_transfer_history.status = 'received';
  const question = financeQuestions(draft).find((q) => q.id === 'private-transfer-months');
  assert.equal(visibleFields(question, draft).length, 13);
  draft.private_transfer_history.months[0].amount = moneyInput('50');
  assert.equal(visibleFields(question, draft).length, 14);
  draft.private_transfer_history.months[0].count = '1.5';
  assert.equal(validateQuestion(question, draft).field, 'finance-transfer-count-0');
});

test('repeat shortcut requires both facts and never treats a partial year as twelve months automatically', () => {
  const history = emptyPrivateTransferHistory();
  history.months[0].amount = moneyInput('20');
  assert.equal(repeatPrivateTransferMonths(history), null);
  history.months[0].count = '2';
  const repeated = repeatPrivateTransferMonths(history);
  assert.equal(repeated.months.length, 12);
  assert.ok(repeated.months.every((month) => month.amount === 200000 && month.count === 2));
  assert.equal(history.months[1].amount, null);
  repeated.months[0].amount = 1;
  assert.equal(repeated.months[1].amount, 200000);
});

test('older drafts can edit history and changing household invalidates the prior confirmation', () => {
  const draft = emptyFinancialProfile();
  delete draft.private_transfer_history;
  preparePrivateTransferEdit(draft, 'private_transfer_history.status', 'received');
  assert.equal(draft.private_transfer_history.months.length, 12);
  draft.private_transfer_history.status = 'received';
  preparePrivateTransferEdit(draft, 'household_size', 2);
  assert.equal(draft.private_transfer_history.status, 'unknown');
  preparePrivateTransferEdit(draft, 'private_transfer_history.status', 'none');
  assert.equal(draft.private_transfer_history.status, 'none');
  assert.ok(draft.private_transfer_history.months.every((month) => month.amount === null));
});

test('month labels cross the year boundary and reference month uses Seoul time', () => {
  assert.equal(currentTransferMonth(new Date('2026-09-30T15:00:00Z')), '2026-10');
  assert.deepEqual(transferMonthLabels('2026-01').slice(0, 2), ['2026년 1월', '2025년 12월']);
  assert.deepEqual(transferMonthLabels('2026-13'), []);
});
