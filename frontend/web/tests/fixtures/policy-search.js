// Synthetic publisher/content examples used only by automated tests.
const base = {
  category: '교육',
  region: '서울',
  audience: '청년',
  organization: '광운대학교',
  summary: '학생의 진로와 학습을 지원합니다.',
  benefit: '참여 프로그램 안내',
  tags: ['학생'],
  date: '2026-10-07',
  applicationStart: '2026-10-01',
  applicationEnd: '2026-10-31',
  scheduleStatus: 'dated',
};

export const searchPolicies = [
  ...Array.from({ length: 7 }, (_, index) => ({
    ...base,
    id: `search-publisher-${index + 1}`,
    title: index === 0 ? '광운대학교 재학생 장학 지원' : `지역 청년 장학 프로그램 ${index + 1}`,
  })),
  {
    ...base,
    id: 'search-external-title',
    organization: '노원구',
    title: '광운대 협력 학생 장학 지원',
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    ...base,
    id: `search-external-body-${index + 1}`,
    organization: '서울시',
    title: `대학 연계 진로 교육 ${index + 1}`,
    content: '광운대 학생을 대상으로 장학 프로그램을 운영합니다.',
  })),
  {
    ...base,
    id: 'search-metadata',
    organization: '교육지원센터',
    title: '지역 학습 지원',
    tags: ['광운대학교'],
    contact: '광운대학교 상담실',
    sourceFields: { organization: '광운대학교', contact: '광운대 상담실' },
  },
];
