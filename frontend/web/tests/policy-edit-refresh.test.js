import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyRepository } from '../src/features/policies/policyRepository.js';
import { parsePolicy } from '../src/features/policies/policyModel.js';

const edited = {
  id: 'gov24:edited-policy',
  title: '관리자 수정 제목',
  summary: '수정된 요약',
  tags: ['교육'],
  category: '교육',
  content: '긴 본문\n'.repeat(20000),
  sourceFields: { text: '전체 본문', eligibility: '수정한 조건', bad: 42 },
  applicationMethod: '온라인 신청',
  contact: '수정 기관',
  applicationUrl: 'https://example.com/apply',
  otherConditions: ['수정한 소득 조건', 42],
};

test('detail loads the current server revision with an encoded policy key and cancellation', async () => {
  let captured;
  const controller = new AbortController();
  const repository = createPolicyRepository({
    mode: 'api',
    request: async (...args) => {
      captured = args;
      return edited;
    },
  });
  const policy = await repository.get(edited.id, { signal: controller.signal });
  assert.equal(captured[0], '/v1/policies/gov24%3Aedited-policy');
  assert.equal(captured[1].signal, controller.signal);
  assert.equal(policy.content, edited.content);
  assert.equal(policy.applicationMethod, edited.applicationMethod);
  assert.deepEqual(policy.sourceFields, { text: '전체 본문', eligibility: '수정한 조건' });
  assert.deepEqual(policy.otherConditions, ['수정한 소득 조건']);
});

test('edited application links remain safe and old responses remain compatible', () => {
  assert.equal(
    parsePolicy({ ...edited, applicationUrl: 'javascript:alert(1)' }).applicationUrl,
    null,
  );
  const old = parsePolicy({ id: 'old', title: '기존 공고', summary: '요약', tags: [] });
  assert.equal(old.content, '');
  assert.deepEqual(old.sourceFields, {});
});
