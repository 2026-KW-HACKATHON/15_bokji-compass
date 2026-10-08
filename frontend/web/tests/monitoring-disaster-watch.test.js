import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPolicies } from './fixtures/policies.js';
import {
  emptyMonitoringProfile,
  parseMonitoringSnapshot,
} from '../src/features/monitoring/monitoringModel.js';

test('dynamic disaster watch needs do not convert unknown damage facts into confirmed damage', () => {
  const policy = demoPolicies[0];
  const snapshot = parseMonitoringSnapshot({
    profile: { ...emptyMonitoringProfile },
    enabled: true,
    updated_at: '2026-10-07T00:00:00Z',
    last_checked_at: '2026-10-07T00:00:00Z',
    needs: [
      {
        id: 'disaster_watch',
        title: '거주 지역 재난 지원 확인',
        reason: '입력한 거주 지역에 관련 지원 공고가 있어요.',
        keywords: ['재난 지원'],
        questions: ['실제 피해 여부와 발생일을 확인해 주세요.'],
      },
    ],
    candidates: [
      {
        need_id: 'disaster_watch',
        policy_id: policy.id,
        policy,
        status: 'needs_review',
        reason: '거주 지역과 관련된 지원 원문을 찾았어요.',
        questions: ['실제 피해 여부를 확인해 주세요.'],
        state: 'watching',
      },
    ],
    alerts: [
      {
        id: 'watch-alert',
        policy_id: policy.id,
        need_id: 'disaster_watch',
        title: '재난 관련 지원 공고 확인',
        body: '실제 피해 여부와 발생일을 확인해 주세요.',
        created_at: '2026-10-07T00:00:00Z',
        read: false,
      },
    ],
    unread_count: 1,
  });
  assert.equal(snapshot.needs[0].id, 'disaster_watch');
  assert.equal(snapshot.candidates[0].need_id, 'disaster_watch');
  assert.equal(snapshot.candidates[0].status, 'needs_review');
  assert.equal(snapshot.profile.disaster_damage, null);
  assert.equal(snapshot.profile.disaster_type, null);
  assert.equal(snapshot.profile.disaster_occurred_on, null);
  assert.equal(snapshot.alerts[0].need_id, 'disaster_watch');
});
