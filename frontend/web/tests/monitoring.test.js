import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPolicies } from './fixtures/policies.js';
import { createMonitoringApi } from '../src/features/monitoring/monitoringApi.js';
import {
  emptyMonitoringProfile,
  initialMonitoringProfile,
  parseMonitoringProfile,
  parseMonitoringSnapshot,
  todayInSeoul,
} from '../src/features/monitoring/monitoringModel.js';

const emptySnapshot = () => ({
  profile: null,
  enabled: false,
  updated_at: null,
  last_checked_at: null,
  needs: [],
  candidates: [],
  alerts: [],
  unread_count: 0,
});
test('unknown facts stay null and explicit no/zero values are never inferred as yes', () => {
  assert.deepEqual(parseMonitoringProfile({}), emptyMonitoringProfile);
  const profile = parseMonitoringProfile({
    repair_needed: false,
    job_seeking: false,
    disaster_damage: false,
  });
  assert.equal(profile.disaster_damage, false);
  assert.equal(profile.disaster_type, null);
  assert.equal(profile.housing_tenure, null);
  const seeded = initialMonitoringProfile({
    occupation: '은퇴 후',
    household: '가족과 살아요',
    interests: ['주거', '주거'],
  });
  assert.equal(seeded.occupation, '은퇴 후');
  assert.deepEqual(seeded.interests, ['주거']);
  assert.equal(seeded.job_seeking, null);
});
test('invalid or future dates and noninteger construction years are rejected', () => {
  for (const value of ['2026-02-30', '2026-13-01', '3000-01-01'])
    assert.throws(() => parseMonitoringProfile({ disaster_occurred_on: value }));
  for (const value of [1799, 3000, 1999.5, '1999'])
    assert.throws(() => parseMonitoringProfile({ building_year: value }));
  assert.equal(
    parseMonitoringProfile({ disaster_occurred_on: todayInSeoul() }).disaster_occurred_on,
    todayInSeoul(),
  );
});
test('snapshot accepts server metadata and scan failure while validating candidate relationships', () => {
  const policy = demoPolicies[0];
  const response = {
    ...emptySnapshot(),
    profile: {},
    version: 'server-version',
    scan_status: 'unavailable',
    needs: [
      {
        id: 'housing',
        title: '주거 지원',
        reason: '입력한 주거 상황',
        keywords: ['주거'],
        questions: ['피해 여부 확인'],
      },
    ],
    candidates: [
      {
        need_id: 'housing',
        policy_id: policy.id,
        policy,
        reason: '관련 지원 후보',
        questions: ['세부 조건 확인'],
        status: 'needs_review',
        state: 'preparing',
      },
    ],
  };
  const snapshot = parseMonitoringSnapshot(response);
  assert.equal(snapshot.scan_status, 'unavailable');
  assert.equal(snapshot.candidates[0].state, 'preparing');
  assert.equal(snapshot.candidates[0].active, true);
  const historical = parseMonitoringSnapshot({
    ...response,
    candidates: [{ ...response.candidates[0], active: false, schedule_status: 'upcoming' }],
  });
  assert.equal(historical.candidates[0].active, false);
  assert.equal(historical.candidates[0].schedule_status, 'upcoming');
  assert.throws(() =>
    parseMonitoringSnapshot({
      ...response,
      candidates: [{ ...response.candidates[0], policy_id: 'another-policy' }],
    }),
  );
  assert.throws(() =>
    parseMonitoringSnapshot({
      ...response,
      candidates: [response.candidates[0], response.candidates[0]],
    }),
  );
});
test('malformed responses never become empty success snapshots', () => {
  assert.throws(() => parseMonitoringSnapshot({ enabled: false }));
  assert.throws(() => parseMonitoringSnapshot({ ...emptySnapshot(), unread_count: -1 }));
  assert.throws(() => parseMonitoringSnapshot({ ...emptySnapshot(), alerts: [{ id: 'alert' }] }));
});
test('every request authenticates, saving requires explicit consent and actions use server IDs', async () => {
  const calls = [];
  const api = createMonitoringApi(async (path, options) => {
    calls.push({ path, options });
    return path.endsWith('/alerts/read') ? { updated: true } : emptySnapshot();
  });
  assert.throws(() => api.save({}, { consent: false, enabled: true }));
  assert.equal(calls.length, 0);
  await api.read();
  await api.save({}, { consent: true, enabled: false });
  await api.preferences(true);
  await api.refresh();
  await api.state({ policy_id: 'source-policy', need_id: 'housing' }, 'applied');
  await api.readAlerts(['alert-a', 'alert-a']);
  await api.remove();
  assert.ok(calls.every(({ options }) => options.authenticated === true));
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[1].options.body.consent, true);
  assert.equal(calls[1].options.body.enabled, false);
  assert.deepEqual(calls[4].options.body, {
    policy_id: 'source-policy',
    need_id: 'housing',
    state: 'applied',
  });
  assert.deepEqual(calls[5].options.body, { ids: ['alert-a'] });
});
