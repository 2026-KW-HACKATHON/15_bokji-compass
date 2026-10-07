# 모바일 공개 공고 모델

담당: 프론트엔드/모바일. `model.js`는 공개 공고 API 응답 검증과 목록 요청 경로를 구성합니다. 화면은 `src/app/policies/`에서 조립하며, 공고 분류·조회수 정렬·페이지 계산은 서버 API가 수행합니다.

## 호출과 반환

- `policyPath({ query="", category="전체", region="전국", sort="popular", cursor=null, limit=6 }={})` → `/v1/policies?...` 경로 문자열. 검색어와 필터를 URL 인코딩하고 ‘전체’·‘전국’ 값은 생략합니다. `sort`는 `popular`(출처 누적 조회수), `recent`(최근 등록), `name`(이름)입니다.
- `parsePolicy(item)` → ID·개정 ID·제목·요약·태그·카테고리·지역·대상·기관·지원 내용·신청 기간·원문 링크의 화면용 객체. 필수 공고 계약이 잘못되면 `ApiError`를 던지고 미기재 선택 항목에는 확인 안내를 사용합니다.
- `parsePolicyPage(value)` → `{ items, total, nextCursor }`. 각 공고를 검증하고 중복 ID·잘못된 건수·커서를 거절합니다.
- `safeSourceUrl(value)` → 인증정보 없는 HTTP(S) 절대 URL 또는 `null`.
- `categories` → ‘전체’와 `생활·금융`, `주거`, `일자리`, `교육`, `건강·돌봄`, `문화`, `농림축산·어업`, `사업·창업`, `기타` 분야 목록. `regions`는 ‘전국’과 17개 시도 표시값입니다.

목록 화면의 첫 조회와 검색 조건 초기화는 `popular`를 사용합니다. 정렬 변경·분야/지역 변경·검색 실행은 첫 페이지로 돌아가며 쉬운 화면도 동일한 정렬을 사용합니다. 원천 누적 조회수는 현재 접속자 수나 신청자 수를 뜻하지 않습니다.

## 검증

`frontend/mobile`에서 `node --test tests/policies.test.mjs`, `npm run lint`, `npm run typecheck`를 실행합니다. 공고 테스트는 기본 인기순과 명시적 최근순, 필터 인코딩, 공개 요청·취소, 응답 검증과 안전한 원문 링크를 확인하며 실제 공고 DB를 변경하지 않습니다.
