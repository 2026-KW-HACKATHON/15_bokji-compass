import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestsConversation } from '../src/features/policies/searchConversation.js';
import { restoreDialogueSession } from '../src/features/assistant/dialogueModel.js';

test('personal support questions and long conversational sentences suggest chat', () => {
  for (const query of [
    '나는 휴학한 학생이고 지원금과 관련된 정보가 필요해',
    '취업 준비 중인 청년인데 월세 지원을 받을 수 있을까요',
    '월계동에 거주 중인 휴학생인데 생활비 관련 정보를 찾고 있어요',
    '장학금 지원을 찾아보고 있는데 신청할 때 어떤 서류를 준비해야 하는지도 자세히 알려주세요',
  ])
    assert.equal(suggestsConversation(query), true, query);
  for (const query of [
    '',
    null,
    '광운대 장학금',
    '화도 동해 장학금',
    '2026학년도 2학기 국가근로장학금 장학생 선발 확정 안내',
  ])
    assert.equal(suggestsConversation(query), false);
});

test('the original search becomes an unsent draft for both guests and the same member', () => {
  const question = '나는 휴학한 학생이고 지원금과 관련된 정보가 필요해';
  for (const owner of [null, 'member-one']) {
    const restored = restoreDialogueSession({ owner, revisionId: null, question }, owner);
    assert.equal(restored.draft, question);
    assert.equal(restored.dialogue, null);
    assert.deepEqual(restored.exchanges, []);
    assert.equal(
      restoreDialogueSession({ owner, revisionId: null, question }, 'member-two').draft,
      '',
    );
  }
});
