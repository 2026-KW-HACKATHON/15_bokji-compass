import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonitoringSnapshot } from '../src/features/monitoring/monitoringModel.js';
import { createMonitoringApi } from '../src/features/monitoring/monitoringApi.js';
import { assistantOverview } from '../src/features/assistant/assistantPageModel.js';
import { completeDialogue } from './fixtures/dialogue.js';

const candidate = () => ({ ...completeDialogue().candidates[0], state: 'applied', active: true });
const blank = () => ({
  profile: {},
  enabled: true,
  updated_at: null,
  last_checked_at: null,
  needs: [],
  candidates: [],
  alerts: [],
  unread_count: 0,
});
const feedback = () => ({
  policy_id: candidate().policy_id,
  need_id: candidate().need_id,
  title: candidate().policy.title,
  reason: 'not_interested',
  updated_at: '2026-10-08T05:00:00Z',
});

test('excluded recommendations leave progress intact and cannot enter the next-action questions', () => {
  const snapshot = parseMonitoringSnapshot({
    ...blank(),
    candidates: [candidate()],
    recommendation_feedback: [feedback()],
  });
  const overview = assistantOverview(snapshot, {});
  assert.equal(overview.active.length, 0);
  assert.equal(overview.progress.length, 1);
  assert.equal(overview.progress[0].state, 'applied');
  assert.equal(overview.questions.length, 0);
  assert.equal(snapshot.recommendation_feedback[0].reason, 'not_interested');
  assert.equal(parseMonitoringSnapshot(blank()).recommendation_feedback.length, 0);
});

test('invalid reasons, mismatched policies and duplicate preference records fail validation', () => {
  for (const update of [
    { recommendation_feedback: [{ ...feedback(), reason: 'guess' }] },
    { recommendation_feedback: [feedback(), feedback()] },
    {
      candidates: [
        { ...candidate(), recommendation_feedback: { ...feedback(), policy_id: 'foreign' } },
      ],
    },
  ])
    assert.throws(() => parseMonitoringSnapshot({ ...blank(), ...update }));
});

test('reason selection and undo are account-authenticated requests with no identity or profile inference', async () => {
  const calls = [];
  const api = createMonitoringApi(async (path, options) => {
    calls.push({ path, options });
    return blank();
  });
  assert.throws(() => api.feedback(candidate(), 'guess'));
  assert.equal(calls.length, 0);
  await api.feedback(candidate(), 'not_eligible');
  await api.feedback(candidate(), 'not_interested');
  await api.feedback(feedback(), null);
  for (const call of calls) {
    assert.equal(call.path, '/v1/monitoring/candidates/feedback');
    assert.equal(call.options.authenticated, true);
    assert.deepEqual(Object.keys(call.options.body).sort(), ['need_id', 'policy_id', 'reason']);
  }
  assert.deepEqual(
    calls.map((call) => call.options.body.reason),
    ['not_eligible', 'not_interested', null],
  );
});
