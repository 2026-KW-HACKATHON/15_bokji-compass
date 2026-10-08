# 우리 동네 복지

담당: 프론트엔드. `#local`에서 입력한 생활지역의 공식 생활서비스를 안내합니다.
회원의 기본 주소에서 시·도/시·군·구를 우선 사용하며 다른 생활지역을 직접 검색할 수 있습니다.
상세 주소·위치 권한·브라우저 저장은 사용하지 않습니다.

- `LocalWelfarePage({user, profile, onSearch, initialSelection?, onSelectionChange?})`: 지역 입력, 분야 선택, 공식 서비스 카드와 공고 검색 연결. 선택한 지역·분야는 App의 계정별 메모리로 페이지 왕복 동안 유지하고 계정 전환 시 비웁니다.
- `parseLocalArea(text, fallbackRegion)` → `{region,district,neighborhood}` 또는 `null`. 명시한 행정구역만 추출합니다.
- `initialLocalArea(user, profile)` → 저장 주소 우선, 불완전한 주소는 시·도까지만 사용.
- `filterLocalServices(services, area, category='all')` → 시·도와 시·군·구 정확 일치 목록. 동 입력은 구 전체 서비스를 숨기지 않습니다.
- `localPolicySearch(area)` → 기존 공고 탐색용 `{query,region}` 또는 `null`. 지역명이 언급된 공고 검색이며 이용 자격 판정이 아닙니다.
- `localServices.js`: 공식 기관 안내를 확인해 등록한 소규모 카탈로그. 실제 운영 여부를 실시간 조회하지 않습니다.

외부 호출: 이 페이지 자체는 API를 호출하지 않습니다. 공식 링크는 기관 사이트를 열고, 공고 찾기는 기존 공개 API 기반 `#explore`로 이동합니다. 입력 전체나 상세 주소를 URL/API/저장소로 전달하지 않습니다.

검증: `npm.cmd test`, `npm.cmd run build`, `npx.cmd playwright test tests/e2e/local-welfare.spec.js tests/e2e/portal-navigation.spec.js`. [기능 기록](../../../../docs/local-welfare.md), [출처 기록](../../../../docs/local-welfare-sources.md).
