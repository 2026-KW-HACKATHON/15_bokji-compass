# 우리 동네 복지

2026-10-08: 회원 주소의 `전남광주통합특별시`와 `전남광주` 별칭을 같은 통합 지역으로
해석합니다. 시·군·구와 동은 주소에 직접 표시된 값만 사용합니다.

담당: 프론트엔드. `#local`에서 입력한 생활지역의 공식 생활서비스를 공개 API로 조회합니다.
주소가 없으면 서울 노원구 월계1동을 중점 지역으로 시작합니다. 회원 주소나 추천 지역이 있으면 이를 우선하며 다른 생활지역도 직접 검색할 수 있습니다.
상세 주소·위치 권한·브라우저 저장은 사용하지 않습니다.

2026-10-08 지역 조회 버튼: ‘이 지역 보기’에 공통 `button primary` 스타일을 적용합니다.
모서리는 10px로 둥글게 표시하고 글자·화살표 주변 여백을 다른 주요 버튼과 맞춥니다.
PC에서는 지역 입력 옆, 700px 이하에서는 전체 폭으로 표시합니다. 지역 조회의 입력·반환·
서버 호출은 그대로 유지하며 기존 `local-welfare.spec.js`로 일반/쉬운 화면과 모바일을 확인합니다.

- `LocalWelfarePage({user, profile, repository, onSearch, initialSelection?, onSelectionChange?})`: 지역·분야·동 중심 범위·등록 지역 선택, 로딩/빈 목록/오류/재시도와 공식 서비스 카드. 선택은 App 계정별 메모리로 왕복 중 유지하고 계정 전환 시 비웁니다.
- `createLocalServiceRepository({request}).list(filters,{signal})` → 검증한 `{items,total,coverage,focus,checkedAt}`. `/v1/local-services`에 지역·분야·범위만 전달하며 상세주소·우편번호·임의 필드는 보내지 않습니다.
- `parseLocalServicePage(value)` → URL·날짜·개수·범위를 검사한 응답. 잘못된 응답은 `invalid_response` 오류입니다. 장애를 예시 서비스로 대체하지 않습니다.
- `parseLocalArea(text, fallbackRegion)` → `{region,district,neighborhood}` 또는 `null`. 명시한 행정구역만 추출합니다.
- `initialLocalArea(user, profile)` → 저장 주소 우선, 불완전한 주소는 시·도까지만 사용. `startingLocalArea()`는 지역 미입력 때만 `priorityLocalArea`(서울 노원구 월계1동)를 사용합니다.
- `localPolicySearch(area)` → 기존 공고 탐색용 `{query,region}` 또는 `null`. 지역명이 언급된 공고 검색이며 이용 자격 판정이 아닙니다.
- 지역별 매칭·정렬·기한 지난 사업 제외는 서버 책임입니다. 프론트 고정 `localServices.js`를 제거했습니다.

외부 호출: 공개 `/v1/local-services`로 검증된 서버 카탈로그를 조회합니다. 공식 링크는 기관 사이트를 열고 공고 찾기는 `#explore`로 이동합니다. 입력 전체나 상세 주소를 URL/API/저장소로 전달하지 않습니다.

`scope=all`은 선택 지역의 동·구·광역·전국 범위를 합치고, `scope=neighborhood`는 공식 자료로 해당 동과의 관계를 확인한 안내만 표시합니다. 행정동·법정동과 시설 위치·거주지 자격을 구분합니다. 전국·세종도 처리합니다. 새 지역은 서버의 검증된 JSON을 추가하고 화면을 수정하지 않습니다.

E2E 지역서비스는 실제 테스트 서버 카탈로그를 조회하며 다른 공고 API만 테스트 대역입니다. [백엔드 계약](../../../../../backend/docs/local-services.md).

검증: `npm.cmd test`, `npm.cmd run build`, `npx.cmd playwright test tests/e2e/local-welfare.spec.js tests/e2e/portal-navigation.spec.js`. [기능 기록](../../../../docs/local-welfare.md), [출처 기록](../../../../docs/local-welfare-sources.md).
