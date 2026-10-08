import { regions } from '../policies/policyModel.js';

export const POSTCODE_SCRIPT_URL =
  'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

const regionNames = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  전남광주: '전남광주통합특별시',
  전남광주통합특별시: '전남광주통합특별시',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
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
  제주특별자치도: '제주',
  제주도: '제주',
};

export function memberAddressError(value) {
  const { postal_code = '', address = '', address_detail = '' } = value;
  if (!postal_code && !address && !address_detail) return '';
  if (!/^[0-9]{5}$/.test(postal_code) || !address.trim())
    return '주소 검색에서 거주 주소를 선택해 주세요.';
  if (
    [address, address_detail].some(
      (text) => text.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(text),
    )
  )
    return '주소는 줄바꿈 없이 200자 이내로 입력해 주세요.';
  return '';
}

// Keep the existing recommendation region while saving the selected full address separately.
export function selectedMemberAddress(data) {
  const sido = (data.sido || '').trim();
  const selected = {
    region: regionNames[sido] || sido,
    postal_code: (data.zonecode || '').trim(),
    address: (
      (data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress) ||
      data.address ||
      ''
    ).trim(),
    address_detail: '',
  };
  const issue = memberAddressError(selected);
  if (issue || !regions.slice(1).includes(selected.region) || !selected.address)
    throw new Error(issue || '선택한 주소의 지역을 확인하지 못했어요. 다른 주소를 선택해 주세요.');
  return selected;
}

let pendingScript;
const postcodeConstructor = () => window.kakao?.Postcode || window.daum?.Postcode;
const isOffline = () => window.navigator?.onLine === false;
const postcodeLoadMessages = {
  offline: '브라우저가 오프라인 상태예요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  timeout: '주소 검색 서비스의 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.',
  script:
    '카카오 주소 검색을 불러오지 못했어요. 외부 서비스 연결이 차단되었거나 일시적으로 이용할 수 없을 수 있어요. 잠시 후 다시 시도해 주세요.',
  unavailable: '주소 검색 기능을 시작하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
};

function postcodeLoadError(reason) {
  const error = new Error(postcodeLoadMessages[reason]);
  error.code = `POSTCODE_${reason.toUpperCase()}`;
  return error;
}

export function loadPostcode() {
  const loaded = postcodeConstructor();
  if (loaded) return Promise.resolve(loaded);
  if (pendingScript) return pendingScript;
  if (isOffline()) return Promise.reject(postcodeLoadError('offline'));
  pendingScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = POSTCODE_SCRIPT_URL;
    script.async = true;
    let settled = false;
    const timer = setTimeout(() => fail(isOffline() ? 'offline' : 'timeout'), 15000);
    const cleanup = () => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };
    function fail(reason) {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      pendingScript = undefined;
      reject(postcodeLoadError(reason));
    }
    script.onload = () => {
      if (settled) return;
      const Postcode = postcodeConstructor();
      if (!Postcode) return fail('unavailable');
      settled = true;
      cleanup();
      resolve(Postcode);
    };
    script.onerror = () => fail(isOffline() ? 'offline' : 'script');
    document.head.appendChild(script);
  });
  return pendingScript;
}
