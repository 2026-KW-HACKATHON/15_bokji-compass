import test from 'node:test';
import assert from 'node:assert/strict';
import { policyDeadline } from '../src/features/policies/deadlineModel.js';
import { seoulToday } from '../src/features/calendar/calendarModel.js';

test('deadlines classify upcoming, closing today and closed dates without using application starts', () => {
  const policy = { applicationEnd: '2026-10-15', applicationStart: '2026-10-20' };
  assert.deepEqual(policyDeadline(policy, '2026-10-08'), { state: 'upcoming', days: 7 });
  assert.deepEqual(policyDeadline(policy, '2026-10-15'), { state: 'today', days: 0 });
  assert.deepEqual(policyDeadline(policy, '2026-10-18'), { state: 'closed', days: -3 });
  assert.deepEqual(policyDeadline({ ...policy, scheduleStatus: 'ongoing' }, '2026-10-18'), {
    state: 'closed',
    days: -3,
  });
});

test('ongoing applies only without an end date, and source wording never supplies a deadline', () => {
  for (const applicationEnd of [null, undefined, '']) {
    assert.deepEqual(policyDeadline({ applicationEnd, scheduleStatus: 'ongoing' }, '2026-10-08'), {
      state: 'ongoing',
      days: null,
    });
    assert.deepEqual(
      policyDeadline({ applicationEnd, applicationPeriod: '2026년 10월 15일까지' }, '2026-10-08'),
      { state: 'unknown', days: null },
    );
  }
  assert.deepEqual(policyDeadline(undefined, '2026-10-08'), { state: 'unknown', days: null });
  for (const applicationEnd of [
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-10-00',
    '2026-1-15',
    '2026-10-15T00:00:00Z',
    ' 2026-10-15',
    '3~4월',
    20261015,
  ]) {
    assert.deepEqual(policyDeadline({ applicationEnd, scheduleStatus: 'ongoing' }, '2026-10-08'), {
      state: 'unknown',
      days: null,
    });
  }
  assert.deepEqual(policyDeadline({ applicationEnd: '2026-10-15' }, '2026-02-30'), {
    state: 'unknown',
    days: null,
  });
});

test('day counts handle month boundaries, leap years and new years with exact UTC days', () => {
  for (const [today, end, days] of [
    ['2026-01-31', '2026-02-01', 1],
    ['2026-02-28', '2026-03-01', 1],
    ['2028-02-28', '2028-02-29', 1],
    ['2028-02-28', '2028-03-01', 2],
    ['2026-12-31', '2027-01-01', 1],
    ['2027-01-01', '2026-12-31', -1],
  ]) {
    assert.deepEqual(policyDeadline({ applicationEnd: end }, today), {
      state: days > 0 ? 'upcoming' : 'closed',
      days,
    });
  }
  const expanded = {
    applicationPeriod: '3~4월',
    applicationPrecision: 'month',
    applicationStart: '2027-03-01',
    applicationEnd: '2027-04-30',
  };
  assert.deepEqual(policyDeadline(expanded, '2027-03-01'), { state: 'upcoming', days: 60 });
  assert.deepEqual(policyDeadline(expanded, '2027-04-30'), { state: 'today', days: 0 });
});

test('default today follows Korea midnight even when the browser timezone is in the US', (context) => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  context.after(() => {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  });
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-08T14:59:59Z') });
  assert.equal(seoulToday(), '2026-10-08');
  assert.deepEqual(policyDeadline({ applicationEnd: '2026-10-09' }), {
    state: 'upcoming',
    days: 1,
  });
  context.mock.timers.setTime(new Date('2026-10-08T15:00:00Z').getTime());
  assert.equal(seoulToday(), '2026-10-09');
  assert.deepEqual(policyDeadline({ applicationEnd: '2026-10-09' }), { state: 'today', days: 0 });
  assert.deepEqual(policyDeadline({ applicationEnd: '2026-10-08' }), { state: 'closed', days: -1 });
});

test('US daylight-saving transitions do not shorten or extend calendar day counts', (context) => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  context.after(() => {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  });
  assert.deepEqual(policyDeadline({ applicationEnd: '2026-03-09' }, '2026-03-07'), {
    state: 'upcoming',
    days: 2,
  });
  assert.deepEqual(policyDeadline({ applicationEnd: '2026-11-02' }, '2026-10-31'), {
    state: 'upcoming',
    days: 2,
  });
});
