// Explicit server contract responses; this transport does not interpret queries.
const base = {
  summary: '대학 재학생의 생활과 학업을 지원합니다.',
  tags: [],
  category: '교육',
  region: '전국',
  audience: '대학생',
  organization: '광운대학교',
  benefit: '장학금 지원',
  date: '2026-10-07',
  applicationStart: '2026-10-01',
  applicationEnd: '2026-10-31',
  applicationPeriod: '2026-10-01 ~ 2026-10-31',
  scheduleStatus: 'dated',
};
const matched = (relations, reason, field, quote) => ({
  relations,
  reason,
  evidence: [{ field, quote }],
});
export const smartRecords = [
  {
    ...base,
    id: 'smart-general',
    title: '대학생 등록금 지원',
    organization: '한국장학지원센터',
    sourceFields: { eligibility: '국내 대학 재학생의 등록금을 지원합니다. 근로 의무가 없습니다.' },
    searchMatch: matched(
      ['student_general', 'benefit'],
      '학교에 관계없이 대학 재학생 대상 등록금 지원이에요.',
      'eligibility',
      '국내 대학 재학생의 등록금을 지원합니다. 근로 의무가 없습니다.',
    ),
  },
  {
    ...base,
    id: 'smart-kw-scholarship',
    title: '생활비 장학 지원',
    content: '광운대학교 재학생에게 생활비 장학금을 지급합니다.',
    searchMatch: matched(
      ['publisher', 'target'],
      '광운대학교 재학생 대상 장학 공고예요.',
      'text',
      '광운대학교 재학생에게 생활비 장학금을 지급합니다.',
    ),
  },
  {
    ...base,
    id: 'smart-campus',
    title: '캠퍼스 행사 안내',
    benefit: '행사 참여 안내',
    searchMatch: matched(
      ['publisher'],
      '광운대학교가 올린 공고예요.',
      'organization',
      '광운대학교',
    ),
  },
  {
    ...base,
    id: 'smart-work',
    title: '근로 장학 프로그램',
    content: '광운대학교 재학생이 근로를 수행한 뒤 장학금을 받습니다.',
    searchMatch: matched(
      ['publisher', 'target'],
      '광운대학교 재학생 대상 근로 장학 공고예요.',
      'text',
      '광운대학교 재학생이 근로를 수행한 뒤 장학금을 받습니다.',
    ),
  },
  {
    ...base,
    id: 'smart-contextual',
    title: '우리대학 학생 생활 지원',
    organization: '대학지원재단',
    sourceFields: { eligibility: '우리대학 재학생의 생활을 지원합니다.' },
    searchMatch: matched(
      ['contextual'],
      '원문이 올라온 학교의 재학생 대상 지원이에요.',
      'eligibility',
      '우리대학 재학생의 생활을 지원합니다.',
    ),
  },
];
export const messyQuery = '광운데 재학생인데 알바 말고 등록금 도와주는거 없나';
export const publisherQuery = '광운대에서 올린 장학 공고좀 찾아줘';
export const smartSummary =
  '광운대학교 학생의 등록금·장학 지원으로 이해했어요. 근로가 필요한 공고는 제외했어요.';

export async function mockSmartSearchApi(page) {
  const respond = (params) => {
    const query = params.get('q') || '';
    const scope = params.get('search_scope') || 'all';
    const relation = params.get('search_relation');
    const literal = params.get('search_mode') === 'literal' || scope !== 'all';
    let items = smartRecords;
    let search;
    if (query) {
      let summary = '입력한 검색어의 공고를 찾았어요.';
      let interpretedQuery = query;
      let corrections = [];
      let alternatives = [];
      if (literal && query === messyQuery) items = [];
      else if (query === messyQuery) {
        items = smartRecords.slice(0, 2);
        summary = smartSummary;
        interpretedQuery = '광운대학교 대학생 등록금 장학 근로 제외';
        corrections = [{ from: '광운데', to: '광운대' }];
      } else if (query === publisherQuery) {
        items = [smartRecords[1]];
        summary = '광운대학교가 올린 장학 공고로 이해했어요.';
        interpretedQuery = '광운대학교 게시 기관 장학';
      } else if (query === '광운대') {
        items =
          scope === 'content'
            ? [smartRecords[1], smartRecords[3]]
            : scope === 'organization' || relation === 'publisher'
              ? smartRecords.slice(1, 4)
              : relation === 'related'
                ? [smartRecords[1], smartRecords[3], smartRecords[4]]
                : smartRecords.slice(1);
        summary = literal
          ? '선택한 검색 범위에서 광운대를 찾았어요.'
          : '광운대학교가 올린 공고와 관련 내용을 함께 찾았어요.';
        alternatives = [
          { scope: 'all', label: '함께 찾은 공고', count: 4 },
          { scope: 'organization', label: '광운대가 올린 공고', count: 3 },
          { scope: 'content', label: '광운대 관련 지원', count: 3 },
        ];
      } else items = [];
      search = {
        mode: literal ? 'literal' : 'smart',
        summary,
        originalQuery: query,
        interpretedQuery,
        corrections,
        alternatives,
      };
    }
    return { items, search };
  };
  await page.route('**/api/v1/policies?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const { items, search } = respond(params);
    const offset = Number(params.get('cursor') || 0);
    const limit = Number(params.get('limit') || 6);
    return route.fulfill({
      json: {
        items: items.slice(offset, offset + limit),
        total: items.length,
        nextCursor: offset + limit < items.length ? String(offset + limit) : null,
        search,
      },
    });
  });
  await page.route('**/api/v1/policies/calendar?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const { items, search } = respond(params);
    return route.fulfill({
      json: {
        month: params.get('month'),
        items,
        total: items.length,
        undatedItems: [],
        undatedTotal: 0,
        truncated: false,
        search,
      },
    });
  });
}
