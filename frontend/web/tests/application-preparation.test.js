import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitoringApi } from '../src/features/monitoring/monitoringApi.js';
import { parseMonitoringSnapshot } from '../src/features/monitoring/monitoringModel.js';
import { completeDialogue } from './fixtures/dialogue.js';

const candidate = () => ({
  ...completeDialogue().candidates[0],
  active: true,
  state: 'watching',
  policy: {
    ...completeDialogue().candidates[0].policy,
    applicationGuide: {
      methodText: '방문 또는 온라인 신청',
      onlineUrl: 'https://www.gov.kr/apply/fixture',
      phones: [],
      visitText: '담당 주민센터 방문',
      documentsStatus: 'listed',
      documentsNote: '',
      documents: [
        { id: 'doc-a', label: '신분증' },
        { id: 'doc-b', label: '대리 신청 시 위임장' },
      ],
    },
  },
});
const snapshot = (item = candidate()) => ({
  profile: {},
  enabled: true,
  updated_at: null,
  last_checked_at: null,
  needs: [],
  candidates: [item],
  alerts: [],
  unread_count: 0,
});

test('preparation survives snapshot parsing without changing recommendation or application status', () => {
  const item = candidate();
  item.application_preparation = {
    revision_id: item.policy.revisionId,
    prepared_document_ids: ['doc-b'],
  };
  const parsed = parseMonitoringSnapshot(snapshot(item)).candidates[0];
  assert.deepEqual(parsed.application_preparation, item.application_preparation);
  assert.equal(parsed.state, 'watching');
  assert.equal(parsed.recommendation_feedback, null);
  assert.equal(parsed.policy.applicationGuide.documents[1].label, '대리 신청 시 위임장');
  assert.equal(parseMonitoringSnapshot(snapshot()).candidates[0].application_preparation, null);
});

test('a newer revision or changed required documents cannot inherit stale preparation', () => {
  const item = candidate();
  item.application_preparation = {
    revision_id: 'earlier-revision',
    prepared_document_ids: ['doc-a'],
  };
  assert.equal(parseMonitoringSnapshot(snapshot(item)).candidates[0].application_preparation, null);
  item.application_preparation.revision_id = item.policy.revisionId;
  item.policy.applicationGuide.documents = [{ id: 'new-doc', label: '새로운 증빙 서류' }];
  assert.equal(parseMonitoringSnapshot(snapshot(item)).candidates[0].application_preparation, null);
  item.application_preparation.prepared_document_ids = ['new-doc', 'new-doc'];
  assert.throws(() => parseMonitoringSnapshot(snapshot(item)), { code: 'invalid_response' });
});

test('document checks use authenticated exact-source requests; invalid input never sends a request', async () => {
  const calls = [];
  const item = parseMonitoringSnapshot(snapshot()).candidates[0];
  const api = createMonitoringApi(async (path, options) => {
    calls.push({ path, ...options });
    return snapshot({
      ...candidate(),
      application_preparation: {
        revision_id: item.policy.revisionId,
        prepared_document_ids: options.body.prepared ? ['doc-a'] : [],
      },
    });
  });
  const controller = new AbortController();
  const saved = await api.preparation(item, 'doc-a', true, { signal: controller.signal });
  assert.equal(calls[0].path, '/v1/monitoring/candidates/preparation');
  assert.equal(calls[0].authenticated, true);
  assert.equal(calls[0].signal, controller.signal);
  assert.deepEqual(calls[0].body, {
    policy_id: item.policy_id,
    need_id: item.need_id,
    revision_id: item.policy.revisionId,
    document_id: 'doc-a',
    prepared: true,
  });
  assert.deepEqual(saved.candidates[0].application_preparation.prepared_document_ids, ['doc-a']);
  const cleared = await api.preparation(item, 'doc-a', false);
  assert.deepEqual(cleared.candidates[0].application_preparation.prepared_document_ids, []);
  for (const [source, document, prepared] of [
    [item, 'invented', true],
    [item, 'doc-a', 'true'],
    [{ ...item, active: false }, 'doc-a', true],
    [{ ...item, recommendation_feedback: { reason: 'not_interested' } }, 'doc-a', true],
    [{ ...item, policy: { ...item.policy, revisionId: null } }, 'doc-a', true],
  ])
    assert.throws(() => api.preparation(source, document, prepared), { code: 'invalid_input' });
  assert.equal(calls.length, 2);
});
