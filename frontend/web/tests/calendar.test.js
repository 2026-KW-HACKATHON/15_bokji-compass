import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarCells,
  calendarEvents,
  isCalendarDate,
  policiesOnDay,
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
