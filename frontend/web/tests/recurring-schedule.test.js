import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePolicyDetail, parsePolicy } from '../src/features/policies/policyModel.js';
import { createPolicyRepository } from '../src/features/policies/policyRepository.js';
import { calendarEvents, policiesOnDay } from '../src/features/calendar/calendarModel.js';
import { policyDeadline } from '../src/features/policies/deadlineModel.js';
import {
  applyPolicyTranslation,
  createPolicyTranslationClient,
} from '../../packages/core/src/i18n/policyTranslation.js';

const annual = {
  id: 'fixture-recurring-end',
  revisionId: 'same-revision',
  title: '경관보전직불금 테스트',
  summary: '격리된 일정 테스트',
  tags: [],
  applicationPeriod: '매년 4월 말까지',
  applicationStart: null,
  applicationEnd: '2027-04-30',
  scheduleStatus: 'dated',
  applicationPrecision: 'month_end',
  applicationRecurrence: 'yearly',
  applicationYear: null,
};
const calendarPayload = (policy = annual) => ({
  month: '2027-04',
  items: [policy],
  total: 1,
  undatedItems: [],
  undatedTotal: 0,
  truncated: false,
});

test('recurring end-only metadata stays canonical and calendar creates only a closing marker', async () => {
  const result = await createPolicyRepository({
    mode: 'api',
    request: async () => calendarPayload(),
  }).calendar('2027-04');
  const policy = result.items[0];
  assert.equal(policy.applicationPrecision, 'month_end');
  assert.equal(policy.applicationRecurrence, 'yearly');
  assert.equal(policy.calendarMonth, '2027-04');
  assert.deepEqual(
    calendarEvents(result.items, '2027-04').map(({ date, type }) => ({ date, type })),
    [{ date: '2027-04-30', type: 'end' }],
  );
  assert.equal(policiesOnDay(result.items, '2027-04-15').length, 0);
  assert.deepEqual(policiesOnDay(result.items, '2027-04-30'), result.items);
  assert.deepEqual(policyDeadline(policy, '2027-04-02'), { state: 'upcoming', days: 28 });
  for (const patch of [
    { applicationEnd: '2027-04-31' },
    { applicationEnd: null },
    { applicationStart: '2027-04-01' },
    { scheduleStatus: 'unknown' },
    { applicationRecurrence: 'weekly' },
  ]) {
    await assert.rejects(
      createPolicyRepository({
        mode: 'api',
        request: async () => calendarPayload({ ...annual, ...patch }),
      }).calendar('2027-04'),
    );
  }
});

test('detail refresh preserves the selected calendar year while updating full content', () => {
  const selected = parsePolicy({ ...annual, calendarMonth: '2027-04' });
  const detail = parsePolicy({
    ...annual,
    applicationEnd: '2026-04-30',
    content: '새로 불러온 전체 원문',
  });
  const merged = mergePolicyDetail(selected, detail);
  assert.equal(merged.applicationEnd, '2027-04-30');
  assert.equal(merged.calendarMonth, '2027-04');
  assert.equal(merged.content, detail.content);
  assert.deepEqual(policyDeadline(merged, '2027-04-02'), { state: 'upcoming', days: 28 });
  for (const patch of [
    { revisionId: 'new-revision' },
    { applicationPeriod: '2026년 5월 31일까지' },
    { applicationYear: 2026, applicationRecurrence: null },
    { id: 'another-policy' },
  ]) {
    const changed = parsePolicy({ ...annual, applicationEnd: '2026-04-30', ...patch });
    assert.equal(mergePolicyDetail(selected, changed), changed);
  }
  assert.equal(mergePolicyDetail(parsePolicy(annual), detail), detail);
});

test('monthly month-end and yearless exact-day schedules preserve their selected dates', () => {
  const monthly = parsePolicy({
    ...annual,
    applicationPeriod: '매월 말일까지',
    applicationRecurrence: 'monthly',
    applicationMonths: [2],
    calendarMonth: '2028-02',
    applicationEnd: '2028-02-29',
  });
  const detail = parsePolicy({
    ...annual,
    applicationPeriod: monthly.applicationPeriod,
    applicationRecurrence: 'monthly',
    applicationMonths: [10],
    applicationEnd: '2026-10-31',
  });
  const merged = mergePolicyDetail(monthly, detail);
  assert.equal(merged.applicationEnd, '2028-02-29');
  assert.deepEqual(merged.applicationMonths, [2]);
  const exact = parsePolicy({
    ...annual,
    applicationPrecision: null,
    applicationPeriod: '4월 15일까지',
    applicationEnd: '2027-04-15',
    calendarMonth: '2027-04',
  });
  assert.equal(
    mergePolicyDetail(exact, { ...exact, applicationEnd: '2026-04-15', calendarMonth: null })
      .applicationEnd,
    '2027-04-15',
  );
});

test('detail refresh preserves separate calendar rounds and the selected round deadline', () => {
  const windows = [
    { applicationStart: '2027-04-01', applicationEnd: '2027-04-10' },
    { applicationStart: '2027-04-20', applicationEnd: '2027-04-30' },
  ];
  const selected = parsePolicy({
    ...annual,
    applicationPeriod: '매년 4월 1일~10일, 4월 20일~30일',
    applicationPrecision: null,
    ...windows[1],
    applicationWindows: windows,
    calendarMonth: '2027-04',
  });
  const detail = parsePolicy({
    ...selected,
    ...windows[0],
    calendarMonth: null,
    applicationWindows: windows.map((window) => ({
      applicationStart: window.applicationStart.replace('2027', '2026'),
      applicationEnd: window.applicationEnd.replace('2027', '2026'),
    })),
    content: '두 차례 접수하는 공식 본문',
  });
  const merged = mergePolicyDetail(selected, detail);
  assert.equal(merged.applicationStart, '2027-04-20');
  assert.equal(merged.applicationEnd, '2027-04-30');
  assert.deepEqual(merged.applicationWindows, windows);
  assert.equal(merged.content, detail.content);
  assert.equal(policiesOnDay([merged], '2027-04-15').length, 0);
  assert.deepEqual(policyDeadline(merged, '2027-04-02'), { state: 'upcoming', days: 28 });
  const explicit = parsePolicy({ ...selected, applicationRecurrence: null, applicationYear: 2027 });
  assert.equal(
    mergePolicyDetail(explicit, { ...explicit, ...windows[0], calendarMonth: null }).applicationEnd,
    windows[1].applicationEnd,
  );
  const mixed = {
    ...detail,
    applicationPrecision: 'month',
    applicationYear: 2026,
    applicationRecurrence: null,
  };
  const mixedMerged = mergePolicyDetail(selected, mixed);
  assert.deepEqual(mixedMerged.applicationWindows, windows);
  assert.equal(mixedMerged.applicationPrecision, selected.applicationPrecision);
  assert.equal(mixedMerged.applicationRecurrence, selected.applicationRecurrence);
  assert.equal(mixedMerged.applicationYear, selected.applicationYear);
  const revised = { ...detail, revisionId: 'new-rounds-revision' };
  assert.equal(mergePolicyDetail(selected, revised), revised);
});

test('translations and shared translation requests cannot replace recurring metadata or calendar dates', async () => {
  const first = parsePolicy({ ...annual, calendarMonth: '2027-04' });
  const second = parsePolicy({ ...annual, applicationEnd: '2026-04-30' });
  const response = {
    policy_id: first.id,
    revision_id: first.revisionId,
    language: 'en',
    source_language: 'ko',
    source_hash: 'a'.repeat(64),
    translation: { title: 'Landscape payment test', summary: 'Isolated schedule test' },
  };
  for (const patch of [
    { applicationEnd: '2030-04-30' },
    { applicationPrecision: 'day' },
    { applicationRecurrence: 'monthly' },
    { calendarMonth: '2030-04' },
    { applicationWindows: [{ applicationStart: null, applicationEnd: '2030-04-30' }] },
  ]) {
    assert.throws(
      () =>
        applyPolicyTranslation(first, 'en', {
          ...response,
          translation: { ...response.translation, ...patch },
        }),
      { code: 'invalid_translation' },
    );
  }
  let requests = 0;
  const client = createPolicyTranslationClient({
    request: async () => {
      requests += 1;
      return response;
    },
  });
  const [translatedFirst, translatedSecond] = await Promise.all([
    client.translate(first, 'en'),
    client.translate(second, 'en'),
  ]);
  assert.equal(requests, 1);
  assert.equal(translatedFirst.applicationEnd, '2027-04-30');
  assert.equal(translatedFirst.calendarMonth, '2027-04');
  assert.equal(translatedFirst.applicationRecurrence, 'yearly');
  assert.equal(translatedSecond.applicationEnd, '2026-04-30');
});
