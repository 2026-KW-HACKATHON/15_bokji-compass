# 회원 주소 검색 입력

2026-10-07. 담당: 프론트엔드·회원 API.

비회원은 기존 `ProfileForm`에서 시·도를 선택합니다. 회원은 일반 가입의 주소 단계, 가입 후 맞춤 설정, 내 정보의 기본 정보 수정에서 카카오 우편번호 서비스로 도로명·지번·건물명을 검색하고 결과를 선택합니다. 우편번호·기본 주소를 자동 입력한 뒤 상세 주소를 작성합니다. 주소는 기존 맞춤 정보와 같이 선택 사항입니다. 일반 가입에서 맞춤 정보 수집에 동의하지 않으면 주소 단계를 생략합니다.

## 호출과 반환

- `MemberAddressFields({value,onChange,idPrefix,label,disabled})`: `value`는 `region`, `postal_code`, `address`, `address_detail`을 가진 폼 초안입니다. 검색 선택 시 `onChange`에 네 필드를 전달하고, 상세 주소 변경은 `address_detail`만 전달합니다. 부모는 전달값을 기존 초안과 합칩니다. 검색 재선택은 이전 상세 주소를 비우고 상세 주소 입력칸으로 초점을 이동합니다. 지우기는 네 필드를 빈 문자열로 전달합니다. 컴포넌트 반환은 React 입력 화면입니다.
- `loadPostcode()`: 공식 HTTPS SDK를 동적으로 로딩하고 `Promise<Postcode 생성자>`를 반환합니다. 이미 로딩한 SDK와 진행 중 요청을 재사용합니다. 네트워크 오류·15초 제한 실패 시 사용자 메시지를 반환하고 재시도를 허용합니다. PC·모바일에서 팝업 없이 페이지 내 iframe으로 검색합니다.
- `selectedMemberAddress(data)`: 서비스의 `zonecode`, `userSelectedType`, `roadAddress`/`jibunAddress`, `sido`를 사용해 네 주소 필드를 반환합니다. 5자리 우편번호의 앞자리 0을 보존하고 시·도 정식 이름을 기존 축약 지역으로 변환합니다. 잘못된 결과는 오류를 발생시킵니다.
- `memberAddressError(draft)`: 선택 주소가 없거나 정상인 경우 빈 문자열, 부분 주소·우편번호 오류·200자 초과·제어문자 입력은 오류 안내를 반환합니다. 기존 시·도만 가진 회원은 그대로 저장할 수 있습니다.

회원 가입 및 `POST /v1/auth/profile`에 선택 `postal_code`, `address`, `address_detail`을 전달하며 빈 값은 `null`입니다. 회원 응답과 `GET /v1/auth/me`도 같은 필드를 반환합니다. 내 정보 요약은 정확한 주소와 우편번호를 보여 줍니다. 정확한 주소는 브라우저 추천 프로필이나 외부 AI 문맥에 자동 첨부하지 않으며 추천·질문에 사용하는 `region`은 기존 시·도입니다.

## 외부 호출과 배포

검색 버튼을 누를 때만 `https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js`를 불러옵니다. 카카오 검색 iframe에서 사용자가 검색하고 선택한 주소를 앱으로 돌려줍니다. 별도 API 키가 필요 없는 [공식 우편번호 가이드](https://postcode.map.kakao.com/guide)의 embed 방식을 사용합니다. CSP가 있는 배포는 SDK 출처와 우편번호 프레임 출처를 허용해야 합니다. 저장소 Caddy 예시를 갱신했습니다.

SQLite는 회원 API 초기화 시 선택 주소 열을 추가합니다. MySQL은 백엔드에서 `python -m app.modules.auth init`을 실행한 뒤 서버를 재시작합니다. 기존 회원의 시·도·세션·개인정보를 유지하며 주소 열은 처음에 `NULL`입니다. 회원 주소 저장 및 개인정보 안내는 [회원 API](../../backend/app/modules/auth/readme.md), [동의 안내](../../backend/docs/privacy-consent.md)를 따릅니다.

## 검증

웹 `npm test`, `npm run build`와 `npx playwright test tests/e2e/member-address.spec.js tests/e2e/auth.spec.js`로 확인합니다. 주소 변환·입력 검증·요약 단위 테스트와 PC/모바일 검색 선택, 상세 주소, 회원 저장·새로고침, 기존 회원, 주소 삭제, SDK 실패 후 재시도, 비회원 지역 선택, 가입·카카오 가입 후 설정 흐름을 검증합니다. 자동 E2E는 주소 공급자 SDK를 대역으로 처리하므로 실제 카카오 서비스 가용성은 별도 확인합니다.

2026-10-07 검증: 웹 단위 테스트 74개·Vite 빌드·변경 코드 Prettier 통과. 회원 주소 PC/모바일 E2E 14개와 기존 인증 E2E 52개 통과. 실제 SDK와 검색 iframe의 200 응답, 320px에서 공개 기관 주소 검색·선택, 우편번호 `04524`·기본 주소 자동 입력 및 상세 주소 초점 이동을 확인했으며 가로 넘침과 콘솔 오류는 없었습니다. 운영 DB 변경과 서버 재시작은 다른 서버 기능의 동시 수정이 진행 중이므로 수행하지 않았습니다.
