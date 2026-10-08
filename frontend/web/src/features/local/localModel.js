import { regions } from '../policies/policyModel.js';

export const priorityLocalArea = Object.freeze({
  region: '서울',
  district: '노원구',
  neighborhood: '월계1동',
});

export function startingLocalArea(user, profile) {
  const saved = initialLocalArea(user, profile);
  return saved.region ? saved : { ...priorityLocalArea };
}

const provinceAliases = {
  서울특별시: '서울',
  서울시: '서울',
  부산광역시: '부산',
  부산시: '부산',
  대구광역시: '대구',
  대구시: '대구',
  인천광역시: '인천',
  인천시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  대전시: '대전',
  울산광역시: '울산',
  울산시: '울산',
  세종특별자치시: '세종',
  세종시: '세종',
  경기도: '경기',
  강원도: '강원',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주도: '제주',
  제주특별자치도: '제주',
};

function normalizedRegion(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return Object.hasOwn(provinceAliases, text)
    ? provinceAliases[text]
    : regions.slice(1).includes(text)
      ? text
      : '';
}

const districtToken = /^[가-힣]{1,20}(?:시|군|구)$/;
const neighborhoodToken = /^[가-힣]{1,20}(?:\d{1,2}(?:[·.]\d{1,2})?)?(?:동|읍|면)$/;
const buildingBlock = /^[가나다라마바사아자차카타파하]동$/;

function explicitNeighborhood(value) {
  return typeof value === 'string' &&
    neighborhoodToken.test(value) &&
    !buildingBlock.test(value) &&
    !/^제\d+동$/.test(value)
    ? value
    : '';
}

// Read only locality words explicitly present in an address. Road names and
// building/unit numbers cannot provide a missing neighborhood or district.
export function parseLocalArea(text, fallbackRegion = '') {
  if (typeof text !== 'string' || !text.trim() || text.length > 200) return null;
  if (/[\u0000-\u001f\u007f]/.test(text)) return null;
  const tokens = text.trim().split(/\s+/);
  if (tokens[0] === '전국')
    return tokens.length === 1 ? { region: '전국', district: '', neighborhood: '' } : null;
  const explicitRegion = normalizedRegion(tokens[0]);
  const region = explicitRegion || normalizedRegion(fallbackRegion);
  if (!region) return null;
  let index = explicitRegion ? 1 : 0;
  let district = '';
  if (region !== '세종' && districtToken.test(tokens[index] || '')) {
    district = tokens[index++];
    if (district.endsWith('시') && /^[가-힣]{1,20}구$/.test(tokens[index] || ''))
      district += ` ${tokens[index++]}`;
  }
  // An omitted province is usable only when the remaining input starts with a
  // locality. A random road/building string must not inherit profile geography.
  const immediateNeighborhood = explicitNeighborhood(tokens[index]);
  if (!explicitRegion && !district && !immediateNeighborhood) return null;
  let neighborhood = immediateNeighborhood;
  if (!neighborhood) {
    for (const match of text.matchAll(/\(([^()]*)\)/g)) {
      const token = match[1].trim().split(/[\s,]+/)[0];
      neighborhood = explicitNeighborhood(token);
      if (neighborhood) break;
    }
  }
  return { region, district, neighborhood };
}

export function initialLocalArea(user, profile) {
  const memberRegion = normalizedRegion(user?.region);
  const addressArea = parseLocalArea(user?.address, memberRegion);
  return (
    addressArea || {
      region: memberRegion || normalizedRegion(profile?.region),
      district: '',
      neighborhood: '',
    }
  );
}

// The existing catalog searches mentions, not verified service coverage. Send
// only province and district; never send the saved street address or unit.
export function localPolicySearch(area) {
  if (!area?.district || !normalizedRegion(area.region)) return null;
  const parsed = parseLocalArea(`${area.region} ${area.district}`);
  if (!parsed || parsed.district !== area.district || parsed.neighborhood) return null;
  return { query: parsed.district, region: parsed.region };
}
