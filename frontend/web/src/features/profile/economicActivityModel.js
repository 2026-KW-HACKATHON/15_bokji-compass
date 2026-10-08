// Keep stored values stable while presenting a formal, two-level selection.
export const economicActivityGroups = [
  {
    value: 'working',
    label: '취업·사업',
    occupations: ['직장인', '자영업자', '프리랜서'],
  },
  { value: 'student', label: '학생', occupations: ['학생'] },
  { value: 'not_working', label: '미취업', occupations: ['무직', '취업 준비 중'] },
  { value: 'other', label: '기타', occupations: ['기타'] },
];

export const currentOccupations = economicActivityGroups.flatMap((group) => group.occupations);
export const legacyOccupation = '은퇴 후';
export const legacyActivityGroup = 'legacy';

export function occupationLabel(value) {
  if (value == null || value === '선택하지 않음') return null;
  if (value === '직장인') return '임금근로자';
  if (value === legacyOccupation) return '경제활동 상태 확인 필요';
  return value;
}

export function householdLabel(value) {
  if (value == null || value === '선택하지 않음') return null;
  if (value === '혼자 살아요') return '1인 가구';
  if (value === '가족과 살아요') return '가족 동거 가구';
  return value;
}

export function economicActivityGroup(value) {
  if (value === legacyOccupation) return legacyActivityGroup;
  return economicActivityGroups.find((group) => group.occupations.includes(value))?.value || '';
}

// Choosing a different broad category must never carry over an unrelated detail.
// Categories with several details remain unknown until the user chooses one.
export function occupationForGroup(groupValue, currentValue) {
  const group = economicActivityGroups.find(({ value }) => value === groupValue);
  if (!group) return null;
  if (group.occupations.includes(currentValue)) return currentValue;
  return group.occupations.length === 1 ? group.occupations[0] : null;
}
