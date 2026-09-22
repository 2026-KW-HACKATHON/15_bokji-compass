import { regions, categories } from '../policies/demoPolicies.js';

export const defaultProfile = { region: '전국', interests: [] };
export function isProfile(value) {
  return (
    !!value &&
    regions.includes(value.region) &&
    Array.isArray(value.interests) &&
    value.interests.every((item) => categories.slice(1).includes(item))
  );
}
