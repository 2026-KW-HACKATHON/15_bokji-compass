import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarCells,
  calendarEvents,
  isCalendarDate,
  policiesOnDay,
  reconcileCalendarResult,
  seoulToday,
  shiftMonth,
} from '../src/features/calendar/calendarModel.js';
import { createPolicyRepository } from '../src/features/policies/policyRepository.js';

const policy = {
  id: 'fixture-calendar-only',
  title: '테스트 일정',
  summary: '',
  tags: [],
  category: '주거',
  applicationStart: '2026-10-01',
  applicationEnd: '2026-10-15',
  scheduleStatus: 'dated',
};

test('calendar uses Korea dates independently of browser timezone and handles leap months', () => {
  assert.equal(seoulToday(new Date('2026-09-30T15:00:00Z')), '2026-10-01');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(isCalendarDate('2026-02-29'), false);
  assert.equal(isCalendarDate('2028-02-29'), true);
  const cells = calendarCells('2028-02');
  assert.equal(cells.length, 42);
  assert.equal(cells.filter((cell) => cell.current).length, 29);
  assert.equal(new Date(cells[0].date + 'T00:00:00Z').getUTCDay(), 0);
});

test('start/end markers and inclusive application windows do not invent dates for undated policies', () => {
  const undated = { ...policy, id: 'undated', applicationStart: null, applicationEnd: null };
  const dayOnly = {
    ...policy,
    id: 'one-day',
    applicationStart: '2026-10-15',
    applicationEnd: '2026-10-15',
  };
  assert.equal(calendarEvents([policy, undated, dayOnly], '2026-10').length, 4);
  assert.deepEqual(
    calendarEvents([policy], '2026-10', 'end').map((event) => event.date),
    ['2026-10-15'],
  );
  assert.equal(calendarEvents([policy], '2026-11').length, 0);
  assert.deepEqual(
    policiesOnDay([policy, undated], '2026-10-08').map((item) => item.id),
    [policy.id],
  );
  assert.equal(policiesOnDay([policy], '2026-10-16').length, 0);
  assert.equal(policiesOnDay([policy], '2026-10-08', 'end').length, 0);
  assert.equal(policiesOnDay([policy, dayOnly], '2026-10-15', 'end').length, 2);
});

test('calendar repository preserves exact filters, uses one month query and rejects malformed dates', async () => {
  let requested;
  const valid = {
    month: '2026-10',
    items: [policy],
    total: 1,
    truncated: false,
    undatedItems: [],
    undatedTotal: 0,
  };
  const repo = createPolicyRepository({
    mode: 'api',
    request: async (path) => {
      requested = path;
      return valid;
    },
  });
  const result = await repo.calendar('2026-10', {
    query: '전체',
    region: '서울',
    category: '주거',
    audience: '청년',
  });
  const query = new URL('https://test.invalid' + requested).searchParams;
  assert.equal(query.get('q'), '전체');
  assert.equal(query.get('region'), '서울');
  assert.equal(query.get('month'), '2026-10');
  assert.equal(result.items[0].applicationEnd, '2026-10-15');
  for (const payload of [
    { ...valid, month: '2026-11' },
    { ...valid, items: [{ ...policy, applicationEnd: '2026-02-30' }] },
    { ...valid, total: 0 },
  ]) {
    await assert.rejects(
      createPolicyRepository({ mode: 'api', request: async () => payload }).calendar('2026-10'),
    );
  }
  await assert.rejects(createPolicyRepository({ mode: 'demo' }).calendar('2026-10'));
});

test('calendar retains unchanged notice identities without losing revised content or metadata', () => {
  const undated = { ...policy, id: 'undated', applicationStart: null, applicationEnd: null };
  const previous = { month: '2026-10', items: [policy], undatedItems: [undated] };
  const unchanged = reconcileCalendarResult(previous, {
    month: '2026-11',
    items: [{ ...policy }],
    undatedItems: [{ ...undated }],
    total: 2,
  });
  assert.equal(unchanged.items[0], policy);
  assert.equal(unchanged.undatedItems[0], undated);
  assert.equal(unchanged.month, '2026-11');
  const revised = { ...policy, title: '변경된 공고', revisionId: 'new-revision' };
  const changed = reconcileCalendarResult(previous, { items: [revised], undatedItems: [] });
  assert.equal(changed.items[0], revised);
  assert.deepEqual(changed.undatedItems, []);
});

test('month precision periods use normal start and end markers and inclusive daily policies', async () => {
  const monthly = {
    ...policy,
    scheduleStatus: 'dated',
    applicationPrecision: 'month',
    applicationStart: '2027-03-01',
    applicationEnd: '2027-04-30',
    applicationMonths: [3, 4],
    applicationYear: null,
    applicationPeriod: '3~4월',
  };
  const payload = {
    month: '2027-04',
    items: [monthly],
    total: 1,
    undatedItems: [],
    undatedTotal: 0,
    truncated: false,
  };
  const parsed = await createPolicyRepository({
    mode: 'api',
    request: async () => payload,
  }).calendar('2027-04');
  assert.equal(parsed.items[0].scheduleStatus, 'dated');
  assert.equal(parsed.items[0].applicationPrecision, 'month');
  assert.equal(parsed.items[0].applicationYear, null);
  assert.deepEqual(parsed.items[0].applicationMonths, [3, 4]);
  assert.deepEqual(
    calendarEvents(parsed.items, '2027-03').map(({ date, type }) => ({ date, type })),
    [{ date: '2027-03-01', type: 'start' }],
  );
  assert.deepEqual(
    calendarEvents(parsed.items, '2027-04').map(({ date, type }) => ({ date, type })),
    [{ date: '2027-04-30', type: 'end' }],
  );
  assert.deepEqual(policiesOnDay(parsed.items, '2027-04-15'), parsed.items);
  assert.deepEqual(policiesOnDay(parsed.items, '2027-04-30', 'end'), parsed.items);
  assert.equal(policiesOnDay(parsed.items, '2027-05-01').length, 0);
  assert.equal(
    calendarEvents(
      [
        {
          ...parsed.items[0],
          applicationStart: '2026-03-01',
          applicationEnd: '2026-04-30',
          applicationYear: 2026,
        },
      ],
      '2027-04',
    ).length,
    0,
  );
  for (const invalid of [
    { ...monthly, applicationMonths: [13] },
    { ...monthly, applicationMonths: [] },
    { ...monthly, applicationYear: '2026' },
    { ...monthly, scheduleStatus: 'unknown' },
    { ...monthly, applicationStart: null },
    { ...monthly, applicationEnd: '2027-04-31' },
  ]) {
    await assert.rejects(
      createPolicyRepository({
        mode: 'api',
        request: async () => ({ ...payload, items: [invalid] }),
      }).calendar('2027-04'),
    );
  }
});

test('month precision dates accept leap month endings and application windows across years', async () => {
  const leap = {
    ...policy,
    applicationPrecision: 'month',
    applicationMonths: [2],
    applicationYear: 2028,
    applicationStart: '2028-02-01',
    applicationEnd: '2028-02-29',
  };
  const payload = {
    month: '2028-02',
    items: [leap],
    total: 1,
    undatedItems: [],
    undatedTotal: 0,
    truncated: false,
  };
  const parsed = await createPolicyRepository({
    mode: 'api',
    request: async () => payload,
  }).calendar('2028-02');
  assert.equal(calendarEvents(parsed.items, '2028-02').at(-1).date, '2028-02-29');
  assert.deepEqual(policiesOnDay(parsed.items, '2028-02-29'), parsed.items);
  await assert.rejects(
    createPolicyRepository({
      mode: 'api',
      request: async () => ({
        ...payload,
        month: '2027-02',
        items: [
          {
            ...leap,
            applicationYear: 2027,
            applicationStart: '2027-02-01',
            applicationEnd: '2027-02-29',
          },
        ],
      }),
    }).calendar('2027-02'),
  );
  const crossing = {
    ...leap,
    applicationYear: null,
    applicationMonths: [11, 12, 1, 2],
    applicationStart: '2026-11-01',
    applicationEnd: '2027-02-28',
  };
  assert.deepEqual(policiesOnDay([crossing], '2027-01-15'), [crossing]);
  assert.equal(calendarEvents([crossing], '2027-02').at(-1).date, '2027-02-28');
});
