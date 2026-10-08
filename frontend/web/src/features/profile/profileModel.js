import { regions, categories } from '../policies/policyModel.js';
import { currentOccupations } from './economicActivityModel.js';
export const ageBands = [
  '선택하지 않음',
  '19세 미만',
  '19~34세',
  '35~49세',
  '50~64세',
  '65세 이상',
];
export const occupations = ['선택하지 않음', ...currentOccupations];
export const households = ['선택하지 않음', '혼자 살아요', '가족과 살아요'];
export const defaultProfile = {
  region: '전국',
  ageBand: '선택하지 않음',
  occupation: '선택하지 않음',
  household: '선택하지 않음',
  interests: [],
};
export function memberRecommendationProfile(user, previous = defaultProfile) {
  const age = user.age;
  const band = age == null ? 0 : age < 19 ? 1 : age < 35 ? 2 : age < 50 ? 3 : age < 65 ? 4 : 5;
  return { ...previous, region: user.region || '전국', ageBand: ageBands[band] };
}
export function isProfile(value) {
  return (
    !!value &&
    regions.includes(value.region) &&
    ageBands.includes(value.ageBand) &&
    (occupations.includes(value.occupation) || value.occupation === '은퇴 후') &&
    households.includes(value.household) &&
    Array.isArray(value.interests) &&
    value.interests.every((item) => categories.slice(1).includes(item))
  );
}
export function recommendationProfile(value) {
  if (value == null) return {};
  if (!isProfile(value)) throw new Error('올바른 사용자 정보가 필요합니다.');
  return {
    region: value.region,
    ageBand: value.ageBand === ageBands[0] ? null : value.ageBand,
    occupation:
      value.occupation === occupations[0] || value.occupation === '은퇴 후'
        ? null
        : value.occupation,
    household: value.household === households[0] ? null : value.household,
    interests: [...new Set(value.interests)],
  };
}

// Read older browser profiles without discarding their region, age or interests.
export function normalizeProfile(value) {
  return value.occupation === '은퇴 후' ? { ...value, occupation: occupations[0] } : value;
}
