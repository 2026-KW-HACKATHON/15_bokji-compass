import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assistantOverview,
  questionForNeed,
} from '../src/features/assistant/assistantPageModel.js';

const snapshot = (overrides = {}) => ({
  profile: null,
  needs: [],
  candidates: [],
  alerts: [],
  unread_count: 0,
  ...overrides,
});
const candidate = (policyId, needId, state, active = true) => ({
  policy_id: policyId,
  need_id: needId,
  state,
  active,
  policy: { id: policyId, title: `${policyId} 지원` },
  questions: [],
});

test('assistant overview counts application progress once per policy and prefers its active record', () => {
  const value = assistantOverview(
    snapshot({
      candidates: [
        candidate('one', 'old', 'completed', false),
        candidate('one', 'housing', 'preparing'),
        candidate('one', 'interest', 'preparing'),
        candidate('two', 'job', 'applied', false),
        candidate('three', 'job', 'watching'),
        candidate('four', 'job', 'dismissed'),
      ],
    }),
    { region: '서울' },
  );
  assert.deepEqual(value.progressCounts, { preparing: 1, applied: 1, completed: 0 });
  assert.equal(value.progress.length, 2);
  assert.equal(value.progress[0].active, true);
});

test('overview deduplicates follow-up questions and does not present inactive questions', () => {
  const active = {
    ...candidate('one', 'housing', 'watching'),
    questions: ['건축연도는?', '소득은?'],
  };
  const stale = { ...candidate('old', 'housing', 'watching', false), questions: ['이전 조건은?'] };
  const value = assistantOverview(
    snapshot({
      needs: [{ id: 'housing', title: '집수리', questions: ['건축연도는?'] }],
      candidates: [active, stale],
      alerts: [
        { id: 'read', read: true },
        { id: 'new', read: false },
      ],
    }),
    null,
  );
  assert.deepEqual(
    value.questions.map((item) => item.question),
    ['건축연도는?', '소득은?'],
  );
  assert.equal(value.questions[1].policy, active.policy);
  assert.deepEqual(
    value.newAlerts.map((item) => item.id),
    ['new'],
  );
});

test('situation summary shows saved facts without inferring damage, job seeking or grant eligibility', () => {
  const value = assistantOverview(
    snapshot({
      profile: {
        housing_tenure: 'owner',
        building_year: 1920,
        repair_needed: null,
        job_seeking: false,
        disaster_damage: null,
      },
    }),
    { region: '전국' },
  );
  assert.deepEqual(value.facts, ['본인 소유 주택', '1920년 준공']);
  assert.deepEqual(assistantOverview(snapshot(), null).facts, []);
  assert.equal(questionForNeed('housing_repair'), '주택 수리 지원을 알아보고 싶어요');
  assert.equal(questionForNeed('disaster_watch'), '재난 피해 지원을 알아보고 싶어요');
  assert.equal(questionForNeed('unknown'), '');
});

test('a profile with only interests still provides a useful saved-information summary', () => {
  const value = assistantOverview(snapshot({ profile: { interests: ['주거', '일자리'] } }), null);
  assert.deepEqual(value.facts, ['주거', '일자리']);
});

test('saved household facts are shown and repeated occupation/interest labels appear once', () => {
  const value = assistantOverview(
    snapshot({ profile: { occupation: '기타', household: '혼자 살아요', interests: ['기타'] } }),
    { region: '서울' },
  );
  assert.deepEqual(value.facts, ['서울', '기타', '1인 가구']);
});
