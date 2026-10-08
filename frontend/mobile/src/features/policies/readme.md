# 모바일 공개 공고 모델

담당: 프론트엔드/모바일. `model.js`는 공개 공고 API 응답 검증과 목록 요청 경로를 구성합니다. 화면은 `src/app/policies/`에서 조립하며, 공고 분류·조회수 정렬·페이지 계산은 서버 API가 수행합니다.

## 호출과 반환

- `policyPath({ query="", searchScope="all", searchMode="smart", category="전체", region="전국", sort="auto", cursor=null, limit=6 }={})` → `/v1/policies?...` 경로 문자열. 검색어와 필터를 URL 인코딩하고 기본 필터·자동 모드는 생략합니다. `searchScope`는 `all`(자동으로 찾기), `organization`(게시 기관), `content`(공고 내용)이며 기본 `all`을 제외하고 `search_scope`로 전달합니다. `searchMode="literal"`은 원래 입력의 문구 검색을 요청합니다. 자동 정렬은 검색어가 있으면 서버 기본을 따르고, 없으면 `popular`를 보냅니다. 명시한 `relevance|popular|recent|name`은 보존합니다.
- `parsePolicy(item)` → ID·개정 ID·제목·요약·태그·카테고리·지역·대상·기관·지원 내용·신청 기간·원문 링크의 화면용 객체. 필수 공고 계약이 잘못되면 `ApiError`를 던지고 미기재 선택 항목에는 확인 안내를 사용합니다.
- `parsePolicyPage(value)` → `{ items, total, nextCursor, search? }`. 각 공고를 검증하고 중복 ID·잘못된 건수·커서를 거절합니다. 선택 해석 메타데이터는 검증한 경우에만 보존합니다. `parsePolicy`는 검증된 `searchMatch` 또는 null을 보존합니다.
- `searchMetadata.js`의 `parseSearchMetadata`·`parseSearchMatch` → 해석·수정안·범위별 개수·원문 근거 또는 null. 내부 필드·잘못된 선택 메타데이터는 버리며 공고 본체는 유지합니다. 근거는 최대 3개/인용 250자, React Native 텍스트로 표시합니다. `effectivePolicySort(filters)` → 명시 정렬 또는 자동 관련도/인기순 표시값. 외부 호출 없음.
- `safeSourceUrl(value)` → 인증정보 없는 HTTP(S) 절대 URL 또는 `null`.
- `categories` → ‘전체’와 `생활·금융`, `주거`, `일자리`, `교육`, `건강·돌봄`, `문화`, `농림축산·어업`, `사업·창업`, `기타` 분야 목록. `regions`는 ‘전국’과 17개 시도 표시값입니다.
- `searchScopes`, `searchScopeLabels` → 검색 범위 코드 목록과 화면 표시값. 웹과 같은 `all`·`organization`·`content` 계약을 사용합니다.

목록의 기본은 자동 범위·자동 정렬입니다. 자연어 검색 시 결과와 해석·오타 수정안·검증된 이유/원문 근거를 함께 표시합니다. `원래 검색어로 찾기`는 입력을 바꾸지 않고 literal로 다시 검색합니다. `검색 범위·조건 직접 선택`은 필수가 아니며 기관·내용 문구 검색, 분야·지역·정렬을 지정할 때 엽니다. 조건 변경은 첫 페이지로 돌아가고 쉬운 화면은 검색어·조건·명시 정렬을 보존합니다. 결과를 신청 자격 확정으로 표시하지 않습니다. 검색은 공개 API와 입력한 문장만 사용하며 계정 주소·금융 정보를 추가하지 않습니다. [웹·앱 검색 계약과 검증](../../../../docs/policy-search.md).

## 검증

해석 아래의 기관·관련 지원 선택은 `searchRelation`을 `search_relation=publisher|related`로 전달하고
자동 범위를 유지합니다. 같은 선택은 해제하며 새 검색·직접 범위·원문 검색은 관계를 초기화합니다.
쉬운 화면 전환과 페이지 이동은 관계 선택을 보존합니다. 근거 필드는 공개 본문·제목·기관·지원
필드와 편집 요약·조건만 허용하며 연락처 등 다른 필드는 숨깁니다.

`frontend/mobile`에서 `npm run test`, `npm run lint`, `npm run typecheck`를 실행합니다. 공고·스마트 검색 테스트는 자동/명시 정렬, 범위·필터 전달, 문구 검색 되돌림, 응답 메타데이터/근거 검증, 안전한 원문 링크를 확인하며 실제 공고 DB를 변경하지 않습니다. 변경 전 Expo SDK 57 문서와 React Native Text/접근성 문서를 확인했습니다. 실제 기기·스크린 리더·APK 재빌드와 배포는 별도입니다.
