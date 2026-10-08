// Previously saved snapshots can still contain extraction diagnostics.
export const officialRequirementsNotice =
  '세부 신청 조건은 공식 공고의 지원 대상·신청 제외 대상 안내를 확인해 주세요.';

const internalKey = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/i;
const legacyDiagnostic = /^공고의 .+ 조건에 필요한 정보를 확인해 주세요\.$/;
const legacyNotices = new Set([
  '원문에 기재된 추가 지원대상 조건을 확인해 주세요.',
  '공고의 전체 조건·예외를 공식 안내와 함께 확인해 주세요.',
]);

export function userReviewQuestions(questions, profileQuestions = []) {
  const personal = new Set(profileQuestions);
  const result = new Set();
  let needsOfficialNotice = false;
  for (const item of questions) {
    const question = item.trim();
    if (personal.has(question)) continue;
    if (
      legacyDiagnostic.test(question) ||
      internalKey.test(question) ||
      legacyNotices.has(question)
    ) {
      needsOfficialNotice = true;
      continue;
    }
    result.add(question);
  }
  if (needsOfficialNotice) result.add(officialRequirementsNotice);
  return [...result];
}

export function userConditionLabel(label, role = 'eligibility') {
  if (!internalKey.test(label)) return label;
  return (
    {
      eligibility: '지원 대상',
      exclusion: '신청 제외 대상',
      priority: '우대사항',
      application: '신청 안내',
      reference: '참고사항',
    }[role] || '지원 대상'
  );
}
