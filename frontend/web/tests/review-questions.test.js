import test from 'node:test';
import assert from 'node:assert/strict';
import {
  officialRequirementsNotice,
  userConditionLabel,
  userReviewQuestions,
} from '../src/features/assistant/reviewQuestions.js';
import { parseMonitoringSnapshot } from '../src/features/monitoring/monitoringModel.js';
import { parseDialogue } from '../src/features/assistant/dialogueApi.js';
import { blankDialogue, completeDialogue } from './fixtures/dialogue.js';

const legacy = [
  '공고의 거주 지역 조건에 필요한 정보를 확인해 주세요.',
  '공고의 regular_income_status 조건에 필요한 정보를 확인해 주세요.',
  '공고의 employment_vulnerability 조건에 필요한 정보를 확인해 주세요.',
  '공고의 local_geography_knowledge 조건에 필요한 정보를 확인해 주세요.',
  '원문에 기재된 추가 지원대상 조건을 확인해 주세요.',
  '공고의 전체 조건·예외를 공식 안내와 함께 확인해 주세요.',
];

test('saved extraction diagnostics become one useful official action, preserving actual requirements', () => {
  const actual = '지원 대상 안내: 정기소득이 없는 사람 (단, 공고의 예외 적용)';
  assert.deepEqual(userReviewQuestions([...legacy, actual, actual]), [
    actual,
    officialRequirementsNotice,
  ]);
  assert.deepEqual(userReviewQuestions([]), []);
  assert.equal(userConditionLabel('local_geography_knowledge', 'priority'), '우대사항');
  assert.equal(userConditionLabel('거주 지역'), '거주 지역');
});

test('stored candidates omit repeated profile questions without changing progress or review status', () => {
  const candidate = { ...completeDialogue().candidates[0], state: 'preparing', active: true };
  const personal = '학업 중 참여할 수 있는 지원을 찾으시나요, 취업 준비를 하고 계신가요?';
  const snapshot = parseMonitoringSnapshot({
    profile: {},
    enabled: true,
    updated_at: null,
    last_checked_at: null,
    needs: [
      {
        id: candidate.need_id,
        title: '지원 찾기',
        reason: '저장한 상황',
        keywords: ['지원'],
        questions: [personal],
      },
    ],
    candidates: [{ ...candidate, questions: [personal, ...legacy] }],
    alerts: [],
    unread_count: 0,
  });
  assert.deepEqual(snapshot.needs[0].questions, [personal]);
  assert.deepEqual(snapshot.candidates[0].questions, [officialRequirementsNotice]);
  assert.equal(snapshot.candidates[0].state, 'preparing');
  assert.equal(snapshot.candidates[0].status, 'needs_review');
});

test('conversation candidates also suppress diagnostics from older server responses', () => {
  const candidate = completeDialogue().candidates[0];
  const result = parseDialogue(
    blankDialogue({ candidates: [{ ...candidate, questions: legacy }] }),
  );
  assert.deepEqual(result.candidates[0].questions, [officialRequirementsNotice]);
});

test('unsupported extracted fields are never presented as information a user can enter', () => {
  const result = parseDialogue(
    blankDialogue({
      missing_fields: [
        { slot: 'regular_income_status', label: 'regular_income_status' },
        { slot: 'local_geography_knowledge', label: 'local_geography_knowledge' },
        { slot: 'housing_tenure', label: '주택 소유·거주 형태' },
      ],
    }),
  );
  assert.deepEqual(result.missing_fields, [
    { slot: 'housing_tenure', label: '주택 소유·거주 형태' },
  ]);
});
