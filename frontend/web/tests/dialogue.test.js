import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialogueApi, parseDialogue } from '../src/features/assistant/dialogueApi.js';
import { confirmedFacts, dialogueError } from '../src/features/assistant/dialogueModel.js';
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
