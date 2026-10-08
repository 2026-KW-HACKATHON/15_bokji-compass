import { demoPolicies } from './policies.js';
import { emptyMonitoringProfile } from '../../src/features/monitoring/monitoringModel.js';

export const dialoguePolicy = {
  ...demoPolicies[0],
  revisionId: '11111111-1111-1111-1111-111111111111',
  title: '시험용 노후주택 수리 공고',
  sourceUrl: 'https://www.gov.kr/dialogue-test',
};
export const blankDialogue = (overrides = {}) => ({
  answer: '현재 가진 정보로는 지원 여부를 확인하기 어려워요. 먼저 누구의 상황인지 알려 주세요.',
  topic: 'housing_repair',
  eligibility_decided: false,
  continuation: 'opaque-session-token',
  follow_up: {
    slot: 'subject',
    question: '누구의 상황을 알아보고 계신가요?',
    input_type: 'select',
    options: [
      { value: 'self', label: '본인' },
      { value: 'other', label: '다른 사람' },
      { value: 'hypothetical', label: '가정해서 질문' },
    ],
    allow_unknown: true,
  },
  missing_fields: [
    { slot: 'housing_tenure', label: '주택 소유·거주 형태' },
    { slot: 'building_year', label: '건축 연도' },
  ],
  profile_draft: { ...emptyMonitoringProfile },
  confirmed_fields: [],
  can_save_profile: false,
  candidates: [],
  selected_policy: null,
  source_links: [],
  practical_steps: [],
  catalog_status: 'not_requested',
  ...overrides,
});
export const completeDialogue = () =>
  blankDialogue({
    answer:
      '1920년 건축으로 확인했어요. 건축 연도만으로 지원 여부를 확정할 수 없으며, 지역과 소득 등 공고별 조건을 더 확인해야 해요.',
    follow_up: null,
    missing_fields: [{ slot: 'income', label: '공고에서 정한 소득 기준' }],
    profile_draft: { ...emptyMonitoringProfile, housing_tenure: 'owner', building_year: 1920 },
    confirmed_fields: ['housing_tenure', 'building_year'],
    can_save_profile: true,
    catalog_status: 'ready',
    candidates: [
      {
        need_id: 'housing_repair',
        policy_id: dialoguePolicy.id,
        policy: dialoguePolicy,
        status: 'needs_review',
        reason: '입력한 건축 연도와 관련된 주택 수리 공고예요.',
        questions: ['소득과 세부 지역 조건을 확인해 주세요.'],
        schedule_status: 'unknown',
      },
    ],
  });
