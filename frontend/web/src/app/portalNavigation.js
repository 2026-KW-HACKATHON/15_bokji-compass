// Keep public hashes stable while grouping destinations in the header.
export const portalSections = [
  {
    id: 'home',
    label: '홈',
    links: [
      { id: 'home', label: '홈으로 이동' },
      { id: 'guide', label: '서비스 안내' },
    ],
  },
  { id: 'local', label: '우리 동네 복지', links: [{ id: 'local', label: '생활지역 서비스 보기' }] },
  {
    id: 'assistant',
    label: 'AI 비서',
    links: [
      { id: 'assistant-intro', label: '서비스 소개' },
      { id: 'assistant-chat', label: 'AI 비서와 대화하기' },
      { id: 'assistant-overview', label: '내 복지 현황' },
      { id: 'assistant-monitoring', label: '지속 복지 안내' },
    ],
  },
  { id: 'explore', label: '전체 공고', links: [{ id: 'explore', label: '공고 찾기' }] },
  { id: 'calendar', label: '공고 캘린더', links: [{ id: 'calendar', label: '신청 일정 보기' }] },
  { id: 'saved', label: '저장한 공고', links: [{ id: 'saved', label: '저장 목록 보기' }] },
  {
    id: 'profile',
    label: '내 정보',
    links: [
      { id: 'profile', label: '회원 정보' },
      { id: 'new-notices', label: '신규공고 확인하기' },
      { id: 'calculator', label: '계산기' },
    ],
  },
];

export const portalRoutes = [
  ...new Set(
    portalSections.flatMap((section) => [section.id, ...section.links.map((link) => link.id)]),
  ),
];

export function isSectionActive(section, page) {
  return (
    section.id === page ||
    section.links.some((link) => link.id === page) ||
    (section.id === 'profile' && page === 'calculator-details')
  );
}
