import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPolicyTranslation,
  createPolicyTranslationClient,
} from '../../packages/core/src/i18n/policyTranslation.js';

const original = () => ({
  id: 'policy/id',
  revisionId: 'revision-1',
  title: '주거 지원',
  summary: '청년을 위한 지원',
  category: '주거',
  region: '서울',
  sourceUrl: 'https://example.org/official',
  tags: ['청년'],
  sourceFields: { description: '신청 내용' },
  otherConditions: ['만 19세 이상'],
});
const response = (policy, language = 'en') => ({
  policy_id: policy.id,
  revision_id: policy.revisionId,
  language,
  source_language: 'ko',
  source_hash: 'a'.repeat(64),
  cached: false,
  translation: {
    title: 'Housing support',
    summary: 'Support for young adults',
    sourceFields: { description: 'Application details' },
    otherConditions: ['Age 19 or older'],
  },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('content translations overlay only reviewed display fields and never change canonical policies', () => {
  const policy = original();
  const translated = applyPolicyTranslation(policy, 'en', response(policy));
  assert.equal(translated.title, 'Housing support');
  assert.equal(policy.title, '주거 지원');
  assert.equal(translated.category, '주거');
  assert.equal(translated.sourceUrl, policy.sourceUrl);
  assert.deepEqual(translated.tags, ['청년']);
  assert.throws(
    () => applyPolicyTranslation(policy, 'en', { ...response(policy), revision_id: 'revision-2' }),
    { code: 'stale_revision' },
  );
  for (const patch of [
    { sourceUrl: 'https://other.example/' },
    { id: 'another-policy' },
    { category: 'Housing' },
    { sourceFields: { injected: 'field' } },
    { otherConditions: [] },
  ]) {
    assert.throws(
      () =>
        applyPolicyTranslation(policy, 'en', {
          ...response(policy),
          translation: { ...response(policy).translation, ...patch },
        }),
      { code: 'invalid_translation' },
    );
  }
});

test('Korean and unsupported locales never start translation; only policy ID and language enter requests', async () => {
  const policy = original();
  const calls = [];
  const client = createPolicyTranslationClient({
    request: async (...args) => {
      calls.push(args);
      return response(policy);
    },
  });
  assert.equal(await client.translate(policy, 'ko'), policy);
  await assert.rejects(client.translate(policy, 'fr'), { code: 'unsupported_language' });
  assert.equal(calls.length, 0);
  await client.translate(policy, 'en');
  assert.deepEqual(calls[0], [
    '/v1/policies/policy%2Fid/translation?language=en',
    { timeoutMs: 65000 },
  ]);
});

test('list projections accept translated detail fields without changing canonical links and filters', () => {
  const policy = {
    ...original(),
    sourceFields: {},
    otherConditions: [],
    content: '',
    paymentSchedule: null,
  };
  const translated = applyPolicyTranslation(policy, 'en', {
    ...response(policy),
    translation: {
      ...response(policy).translation,
      content: 'Full application body',
      paymentSchedule: '2026-10',
    },
  });
  assert.equal(translated.content, 'Full application body');
  assert.equal(translated.paymentSchedule, '2026-10');
  assert.deepEqual(translated.sourceFields, { description: 'Application details' });
  assert.equal(translated.sourceUrl, policy.sourceUrl);
  assert.equal(translated.region, '서울');
  assert.deepEqual(policy.sourceFields, {});
});

test('shared requests survive one subscriber cancelling and retain each caller’s canonical metadata', async () => {
  const policy = original();
  const pending = deferred();
  let calls = 0;
  const client = createPolicyTranslationClient({
    request: async () => {
      calls += 1;
      return pending.promise;
    },
  });
  const abort = new AbortController();
  const first = client.translate(policy, 'en', { signal: abort.signal });
  const second = client.translate({ ...policy, region: '경기' }, 'en');
  abort.abort();
  await assert.rejects(first, { code: 'aborted' });
  pending.resolve(response(policy));
  const translated = await second;
  assert.equal(calls, 1);
  assert.equal(translated.region, '경기');
  assert.equal(translated.title, 'Housing support');
});

test('queued requests with no remaining subscriber do not generate unwanted translations', async () => {
  const policy = original();
  const pending = deferred();
  const calls = [];
  const client = createPolicyTranslationClient({
    request: async (path) => {
      calls.push(path);
      return pending.promise;
    },
  });
  const first = client.translate(policy, 'en');
  const abort = new AbortController();
  const queued = client.translate({ ...policy, id: 'another' }, 'en', { signal: abort.signal });
  abort.abort();
  await assert.rejects(queued, { code: 'aborted' });
  pending.resolve(response(policy));
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
});

test('detail requests take priority and queue limits fail safely while existing work completes', async () => {
  const policy = original();
  const pending = deferred();
  const calls = [];
  const client = createPolicyTranslationClient({
    maxPending: 2,
    request: async (path) => {
      const id = decodeURIComponent(path.split('/')[3]);
      calls.push(id);
      if (calls.length === 1) return pending.promise;
      return response({ ...policy, id });
    },
  });
  const first = client.translate(policy, 'en');
  const card = client.translate({ ...policy, id: 'card' }, 'en');
  const detail = client.translate({ ...policy, id: 'detail' }, 'en', { priority: 10 });
  await assert.rejects(client.translate({ ...policy, id: 'over-limit' }, 'en'), {
    code: 'translation_busy',
    status: 429,
  });
  pending.resolve(response(policy));
  await Promise.all([first, card, detail]);
  assert.deepEqual(calls, [policy.id, 'detail', 'card']);
});

test('cache checks revisions, content changes and expiry instead of displaying an old translation', async () => {
  let time = 0;
  let calls = 0;
  const client = createPolicyTranslationClient({
    ttlMs: 30,
    now: () => time,
    request: async () => {
      calls += 1;
      return response(policy);
    },
  });
  let policy = original();
  await client.translate(policy, 'en');
  await client.translate({ ...policy }, 'en');
  assert.equal(calls, 1);
  policy = { ...policy, revisionId: 'revision-2' };
  await client.translate(policy, 'en');
  assert.equal(calls, 2);
  policy = { ...policy, summary: '업데이트된 지원 내용' };
  await client.translate(policy, 'en');
  assert.equal(calls, 3);
  time = 31;
  await client.translate(policy, 'en');
  assert.equal(calls, 4);
});
