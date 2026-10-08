import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialogueApi, parseDialogue } from '../src/features/assistant/dialogueApi.js';
import {
  confirmedFacts,
  dialogueError,
  restoreDialogueSession,
} from '../src/features/assistant/dialogueModel.js';
import { blankDialogue, completeDialogue } from './fixtures/dialogue.js';

test('dialogue accepts unknown facts and never accepts an eligibility decision', () => {
  assert.equal(parseDialogue(blankDialogue()).profile_draft.building_year, null);
  assert.equal(parseDialogue(completeDialogue()).candidates[0].status, 'needs_review');
  for (const update of [
    { eligibility_decided: true },
    { continuation: '' },
    { follow_up: {} },
    { profile_draft: { building_year: 3000 } },
    { confirmed_fields: ['income'] },
    { can_save_profile: true },
    { source_links: [{ label: '기관', url: 'javascript:alert(1)' }] },
  ]) {
    assert.throws(() => parseDialogue(blankDialogue(update)));
  }
});
test('confirmed facts contain only explicit fields and preserve no instead of unknown', () => {
  const result = completeDialogue();
  result.profile_draft.repair_needed = false;
  result.confirmed_fields.push('repair_needed');
  assert.deepEqual(confirmedFacts(parseDialogue(result)), [
    { field: 'housing_tenure', label: '주택 소유·거주 형태', value: '본인 소유 주택' },
    { field: 'building_year', label: '건축 연도', value: '1920년' },
    { field: 'repair_needed', label: '주택 수리 필요', value: '아니요' },
  ]);
});
test('dialogue requests authenticate, pass opaque continuation and only save after explicit confirmation', async () => {
  const calls = [];
  const api = createDialogueApi(async (path, options) => {
    calls.push({ path, ...options });
    return path.endsWith('/profile')
      ? {
          profile: null,
          enabled: false,
          updated_at: null,
          last_checked_at: null,
          needs: [],
          candidates: [],
          alerts: [],
          unread_count: 0,
        }
      : blankDialogue();
  });
  await api.start(' 집수리 지원금 ', { revisionId: 'published-revision' });
  await api.answer('opaque', 'building_year', '1920년 건축');
  await api.answer('opaque', 'housing_type', null);
  await assert.rejects(api.save('opaque', { consent: false, confirmed: true }));
  await assert.rejects(api.save('opaque', { consent: true, confirmed: false }));
  assert.equal(calls.length, 3);
  await api.save('opaque', { consent: true, confirmed: true });
  assert.deepEqual(calls[0].body, { question: '집수리 지원금', revision_id: 'published-revision' });
  assert.deepEqual(calls[1].body, {
    continuation: 'opaque',
    answer: { slot: 'building_year', value: '1920년 건축' },
  });
  assert.deepEqual(calls[2].body.answer, { slot: 'housing_type', value: null });
  assert.deepEqual(calls[3].body, { continuation: 'opaque', consent: true, confirmed: true });
  assert.ok(calls.every((call) => call.authenticated && call.method === 'POST'));
});
test('expired dialogue prompts restart without rendering server details', () => {
  assert.match(dialogueError({ status: 410, message: 'private' }), /새 상담/);
  assert.doesNotMatch(dialogueError({ status: 422, message: 'private' }), /private/);
});

test('chat explicitly selects conversational mode for every message without changing profile saves', async () => {
  const calls = [];
  const api = createDialogueApi(
    async (path, options) => {
      calls.push({ path, ...options });
      return blankDialogue({ follow_up: null, missing_fields: [] });
    },
    { guest: true, conversational: true },
  );
  await api.start(' 테스트 대화야 ');
  await api.continue('same-session', '안녕');
  assert.deepEqual(calls[0].body, { question: '테스트 대화야', mode: 'conversation' });
  assert.deepEqual(calls[1].body, {
    continuation: 'same-session',
    question: '안녕',
    mode: 'conversation',
  });
  assert.ok(calls.every((call) => call.path === '/v1/assistant/chat/dialogue'));
});

test('free text follow-ups keep the opaque session and can also continue guest conversations', async () => {
  const calls = [];
  const controller = new AbortController();
  const api = createDialogueApi(
    async (path, options) => {
      calls.push({ path, ...options });
      return completeDialogue();
    },
    { guest: true },
  );
  await api.continue('opaque-existing-session', ' 필요한 서류는 무엇인가요? ', {
    signal: controller.signal,
  });
  assert.equal(calls[0].path, '/v1/assistant/chat/dialogue');
  assert.deepEqual(calls[0].body, {
    continuation: 'opaque-existing-session',
    question: '필요한 서류는 무엇인가요?',
  });
  assert.equal(calls[0].signal, controller.signal);
  assert.equal(calls[0].authenticated, true);
});

test('an unsent follow-up and all earlier exchanges survive navigation only for their account', () => {
  const exchanges = Array.from({ length: 65 }, (_, index) => ({
    question: `질문 ${index}`,
    answer: `답변 ${index}`,
  }));
  const source = {
    owner: 'member-one',
    revisionId: null,
    dialogue: completeDialogue(),
    exchanges,
    draft: '다음 신청 준비를 알려주세요',
  };
  const resumed = restoreDialogueSession(source, 'member-one');
  assert.equal(resumed.draft, source.draft);
  assert.deepEqual(resumed.exchanges, exchanges);
  assert.equal(restoreDialogueSession(source, 'member-two').draft, '');
  assert.deepEqual(restoreDialogueSession(source, 'member-two').exchanges, []);
});

test('handoff restores the pending answer and confirmed facts, but never carries consent or a request', () => {
  const dialogue = completeDialogue();
  const session = restoreDialogueSession(
    {
      owner: 'member-one',
      revisionId: 'selected-policy',
      question: '리모델링 지원금을 받을 수 있어?',
      dialogue,
      exchanges: [{ question: '1920년 건축', answer: dialogue.answer }],
      input: '단독주택',
      saved: '',
      candidateLimit: 6,
      consent: true,
      busy: 'save',
      error: 'previous request error',
    },
    'member-one',
    'selected-policy',
  );
  assert.equal(session.input, '단독주택');
  assert.equal(session.question, '리모델링 지원금을 받을 수 있어?');
  assert.equal(session.dialogue.continuation, dialogue.continuation);
  assert.equal(session.dialogue.profile_draft.building_year, 1920);
  assert.equal(session.exchanges.length, 1);
  assert.equal(session.candidateLimit, 6);
  assert.ok(!('consent' in session));
  assert.ok(!('busy' in session));
  assert.ok(!('error' in session));
});

test('handoff cannot restore another account or selected policy', () => {
  const source = {
    owner: 'member-one',
    revisionId: 'selected-policy',
    question: '집에 누수가 있어요',
    input: '1920년 건축',
    dialogue: completeDialogue(),
    exchanges: [{ question: 'private answer' }],
  };
  for (const [owner, revisionId] of [
    ['member-two', 'selected-policy'],
    ['member-one', 'different-policy'],
    ['member-one', null],
    [null, 'selected-policy'],
  ]) {
    const session = restoreDialogueSession(source, owner, revisionId);
    assert.equal(session.dialogue, null);
    assert.equal(session.question, '');
    assert.equal(session.input, '');
    assert.deepEqual(session.exchanges, []);
  }
  assert.equal(restoreDialogueSession({ ...source, owner: null }, null).dialogue, null);
});
