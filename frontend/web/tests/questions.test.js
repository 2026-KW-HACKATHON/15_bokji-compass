import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionApi, parseAnswer } from '../src/features/assistant/questionApi.js';

const revision = '11111111-1111-1111-1111-111111111111';
const answer = {
  revision_id: revision,
  status: 'grounded',
  answer: '원문 안내',
  citations: [{ source_field: 'text', quote: '근거' }],
  follow_up_questions: [],
  preview: false,
  eligibility_decided: false,
};

test('question transport uses member credentials and only sends revision and question', async () => {
  let sent;
  const ask = createQuestionApi({
    fetchImpl: async (url, options) => {
      sent = { url, ...options };
      return new Response(JSON.stringify(answer), { status: 200 });
    },
  });
  assert.deepEqual(await ask(revision, '  지원 내용?  '), answer);
  assert.equal(sent.credentials, 'include');
  assert.equal(sent.headers['X-Auth-Request'], '1');
  assert.deepEqual(JSON.parse(sent.body), { revision_id: revision, question: '지원 내용?' });
});

test('rejects mismatched, unpublished, ungrounded or eligibility-deciding answers', () => {
  for (const patch of [
    { revision_id: 'other' },
    { preview: true },
    { citations: [] },
    { eligibility_decided: true },
    { citations: [{ quote: 'text' }] },
  ]) {
    assert.throws(() => parseAnswer({ ...answer, ...patch }, revision), /근거/);
  }
});

test('authentication errors and cancellation never become a displayed answer', async () => {
  const unauthorized = createQuestionApi({
    fetchImpl: async () =>
      new Response(JSON.stringify({ detail: '로그인이 필요해요.' }), { status: 401 }),
  });
  await assert.rejects(unauthorized(revision, '질문'), { status: 401 });
  const controller = new AbortController();
  const ask = createQuestionApi({
    fetchImpl: async () => {
      controller.abort();
      return new Response(JSON.stringify(answer));
    },
  });
  await assert.rejects(ask(revision, '질문', { signal: controller.signal }), { code: 'aborted' });
});
