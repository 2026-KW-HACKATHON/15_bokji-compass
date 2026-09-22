import { regions, categories } from '../policies/policyModel.js';
export const ageBands = [
  '선택하지 않음',
  '19세 미만',
  '19~34세',
  '35~49세',
  '50~64세',
  '65세 이상',
];
export const occupations = [
  '선택하지 않음',
  '학생',
  '취업 준비 중',
  '직장인',
  '자영업자',
  '은퇴 후',
  '기타',
];
export const households = ['선택하지 않음', '혼자 살아요', '가족과 살아요'];
export const defaultProfile = {
  region: '전국',
  ageBand: '선택하지 않음',
  occupation: '선택하지 않음',
  household: '선택하지 않음',
  interests: [],
};
export function isProfile(value) {
  return (
    !!value &&
    regions.includes(value.region) &&
    ageBands.includes(value.ageBand) &&
    occupations.includes(value.occupation) &&
    households.includes(value.household) &&
    Array.isArray(value.interests) &&
    value.interests.every((item) => categories.slice(1).includes(item))
  );
}
export function recommendationProfile(value) {
  if (!isProfile(value)) throw new Error('올바른 사용자 정보가 필요합니다.');
  return {
    region: value.region,
    ageBand: value.ageBand === ageBands[0] ? null : value.ageBand,
    occupation: value.occupation === occupations[0] ? null : value.occupation,
    household: value.household === households[0] ? null : value.household,
    interests: [...new Set(value.interests)],
  };
}
