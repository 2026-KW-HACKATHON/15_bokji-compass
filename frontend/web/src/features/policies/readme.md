# 공고

2026-10-08 마감 D-Day: `PolicyDeadline({policy})`는 서버의 `applicationEnd`를 한국 시간
오늘과 비교하여 D-n, D-Day, 접수 마감 D+n, 상시 접수 또는 마감일 확인 필요를 표시합니다.
전체/추천/저장 공고 카드의 일반·쉬운 화면, 상세와 캘린더 공고 행이 함께 사용합니다.
`deadlineModel.policyDeadline(policy,today=seoulToday()) -> {state,days}`는 정상 날짜의
UTC 일수 차를 계산하며 state는 upcoming/today/closed/ongoing/unknown입니다.
원문 날짜를 별도 재해석하거나 외부 요청을 하지 않습니다. `useSeoulToday()`는 공통
구독과 한 개의 타이머로 한국 자정 및 화면 복귀 때 갱신하며 마지막 구독 해제 시 정리합니다.
검증: `tests/deadline.test.js`, `tests/e2e/policy-deadline.spec.js`.

2026-10-08 상세 정보: `PolicyDetail({policy,saved,onSave,onClose,onTag,easy,user,onAsk})`는
제목 아래 `공고 원문 보기`와 하단 공식 공고 링크를 제공합니다. `sourceUrl`과
`applicationUrl`은 각각 `safeSourceUrl`로 HTTP(S) 주소를 검증하며 원문과 신청 페이지를
구분합니다. 원천 `sourceFields`의 법령(`laws`), 지원 형태(`support_type`), 지원 주기,
서비스 분야, 접수 기관, 첨부 파일, 기준 연도, 관련 링크는 한글 항목명과 선택 언어의
번역을 표시합니다. 외부 페이지 이동은 사용자가 링크를 눌렀을 때 새 창으로 실행합니다.
PC/모바일·일반/쉬운 화면 검증: `tests/e2e/policy-source.spec.js`.

2026-10-07 자연어 검색: 필요한 지원을 문장으로 입력하면 기본 `all`(자동으로 찾기)에서
서버가 입력 의도에 맞는 공고를 찾습니다. 검색 해석·오타 수정안과 결과를 함께 보여주며,
기관명이 모호하면 게시 기관과 관련 지원의 개수로 선택해서 좁힐 수 있습니다. 필수 선택 단계는 없습니다.
해석 아래 관계 버튼은 `search_relation=publisher|related`로 자동 해석을 유지합니다. 관련 지원에는
학교 이름이 직접 없는 출처 문맥의 결과도 남으며 같은 버튼을 다시 누르면 해제합니다.
`검색 범위 직접 선택`을 열면 게시 기관(`organization`)·공고 내용(`content`)의 기존 문구
검색으로 직접 지정합니다. 카드는 서버의 검증된 `searchMatch` 이유와 원문 근거를 표시합니다.
범위 변경은 이미 적용한 검색어로 첫 페이지를 조회하고, 입력 중인 검색어는 검색 버튼/Enter로
적용합니다. 조건 초기화는 자동 범위·자동 정렬로 복원하며, 쉬운 화면 전환은 조건을 보존합니다.
캘린더 검색창에도 같은 범위 선택과 초기화·쉬운 화면 보존 동작을 제공합니다.
목록과 캘린더 repository는 `filters.searchScope`를 서버의 `search_scope`로 전달하고 기본
`all`은 생략합니다. 오타 수정의 `원래 검색어로 찾기`는 원래 입력을 유지하고 `search_mode=literal`을
요청합니다. 자동 검색은 로컬 서버에서만 해석하며 계정·금융 정보를 추가하지 않습니다.
[자연어 검색·공개 메타데이터·검증 기록](../../../../docs/policy-search.md).

2026-10-07 전체공고 정렬·분야: 검색어가 없으면 기본 정렬은 `popular`(인기순·조회수)이며,
자연어 검색에서는 서버 관련도순을 사용합니다. 사용자가 선택한 `relevance`·`popular`·
최근 등록순(`recent`)·이름순(`name`)은 검색어를 바꿔도 보존합니다.
정렬·필터 변경과 조건 초기화는 첫 페이지로 돌아갑니다. 서버는 전체 검색 결과를 정렬한 후
페이지를 나눕니다. 확인된 정부24/복지로 누적 조회수가 높은 순서이며, 0회는 미제공보다 먼저,
동률은 최근 등록일·공고 ID 순서입니다. `filterPolicies`도 같은 기준의 새 배열을 반환합니다.
`categories`에 농림축산·어업, 사업·창업, 기타를 추가했습니다. 전체공고·캘린더·관심 분야가
같은 목록을 사용하고, 새 공고의 카드 아이콘은 각각 `sprout`, `store`입니다.
[기존 공고 재분류와 관리자 우선순위](../../../../../backend/docs/policy-categories.md).

2026-10-07 관리자 수정 반영: repository.get(id,{signal})는 최신 공개 상세를 조회합니다.
목록·캘린더·열린 상세는 usePolicyRefresh로 활성 상태 30초 및 포커스/복귀 시 갱신합니다.
전체 공고는 이미 조회한 같은 조건·페이지의 자동 갱신 중 카드·총 개수·페이지 버튼을 유지하고,
응답 완료 후 최신 목록을 반영합니다. 자동 갱신 실패 시에도 기존 결과(빈 목록 포함)를 유지합니다.
첫 조회와 검색 조건·페이지·화면 모드 변경에는 로딩/오류·재시도를 표시합니다.
상세 비공개/삭제 404는 열린 상세를 닫습니다. 이전 요청 취소와 선택 ID 검사로 응답 경합을 막습니다.
parsePolicy는 전체 본문·원문 항목·성별·기타 조건·신청 방법/링크·문의처·게시/수정일을 보존합니다.
신청 일정의 `applicationPrecision=month|month_end`, `applicationRecurrence=yearly|monthly`와
연도·월 메타데이터와 복수 회차 `applicationWindows`도 보존합니다. 각 회차는 적어도 한 개의
정상 날짜를 요구하며 존재하는 시작일은 마감일보다 늦을 수 없습니다. calendar repository는 날짜 공고에 조회 월 `calendarMonth`를
붙입니다. `mergePolicyDetail(current, detail)`는 같은 ID·개정·원문 신청기간의 공고에서
정밀도·반복 주기가 같은 연도 미기재 일정 또는 같은 수의 복수 회차인 경우 선택한 달력
날짜·회차 배열·선택 회차 메타데이터를 유지하면서 새 상세 본문을 반영합니다.
개정이나 기간이 바뀌면 새 서버 일정을 사용합니다. 번역은 날짜·반복 주기를 변경할 수 없습니다.
PolicyDetail은 원문을 접어 보여주고 신청 링크를 HTTP(S)로 검증합니다. 원문은 React 텍스트로 표시합니다.

2026-10-06 목록 카드: 기본 화면에는 사업 목적을 설명하는 `summary`를 최대 두 줄로 표시하고
중복되던 지원 조건(`benefit`)은 상세 보기에서 제공합니다. 쉬운 화면의 지원 내용은 유지합니다.
카테고리 아이콘과 태그는 공통 파란색 테마를 사용합니다.

2026-10-06 공고체·지급 시기: 서버의 검증된 개요 요약을 표시하고 `parsePolicy`는 선택 문자열
`paymentSchedule`을 보존합니다. 목록 카드와 일반/쉬운 상세창은 이 값이 있는 경우에만
신청 기간과 별도의 `지급 시기` 항목을 표시합니다. 필드가 없는 기존 응답은 기존대로 처리합니다.
문체 정리는 서버 표시 계층에서 수행하며 원문과 인용은 변경하지 않습니다.

담당: 프론트엔드. 서버 API의 공고만 조회·탐색합니다. 더미 공고는 자동 테스트에만 존재합니다.

- createPolicyRepository({mode,request,path?}).list(filters,{cursor?,limit?,signal?}) → Promise<{items,total,nextCursor,source}>. api GET /v1/policies. demo 직접 요청은 설정 오류.
- createPolicyRepository({mode,request,path?}).calendar(month,filters,{signal?}) → Promise<{month,items,undatedItems,total,undatedTotal,truncated}>. api GET /v1/policies/calendar. 목록과 같은 query/searchScope 전달, 날짜 응답 검증.
- filterPolicies(items,{query,searchScope='all',tag,category,region,audience,sort,savedIds}) → 새 배열. 검색 범위별 AND 검색·정확한 태그·전국 포함·정렬. 입력 배열 변경 없음. 테스트 대역용 순수 함수이며 런타임 서버 검색을 대체하지 않습니다.
- matchesPolicySearch(policy,query='',searchScope='all') → boolean. 기관과 제목·요약·지원 내용·본문을 구분하여 단어를 모두 찾습니다. 정식 대학명은 `광운대학교`/`광운대` 같은 약칭도 찾고, 알 수 없는 범위는 RangeError. 외부 호출 없음.
- parsePolicy(item) → 표시 모델. 필수값 오류 시 ApiError. parsePolicyPage(response) → {items,total,nextCursor}.
- safeSourceUrl(value) → HTTP(S) URL 또는 null.
- parseSearchMetadata(value) → 검증된 검색 해석·수정안·범위별 개수·주의 문구 또는 null. 잘못된 선택 메타데이터는 공고 목록 자체를 실패시키지 않고 숨깁니다.
- parseSearchMatch(value) → 검증된 관계·이유·원문 근거 또는 null. 이유만 있고 근거가 없거나 잘못된 형식이면 숨깁니다. React 텍스트로 렌더링합니다.
- effectivePolicySort(filters) → 명시 정렬 또는 자동 `relevance`/`popular`. repository는 자동 검색에 정렬을 생략하여 서버 기본을 따릅니다.
- parsePopularity(value) → `{views,source,basis,asOf}` 또는 null. 정부24/복지로의 0 이상 정수 누적 조회수(`provider_cumulative_views`)만 보존합니다. 예측 인기·최근 이용자 수는 생성하지 않습니다.
- parseBudget(value) → `{usedPercent,sourceUrl,asOf,evidence}` 또는 null. 0~100의 명시된 수치, HTTPS 근거 URL과 비어 있지 않은 근거 문장을 모두 요구합니다. 공고 기간·조회수로 소진률을 추정하지 않습니다.
- formatSignalDate(value) → 검증된 날짜·시각을 서울 시간대의 YYYY-MM-DD로 표시합니다. UTC 수집 시각을 브라우저 운영체제의 시간대에 따라 다르게 표시하지 않습니다.
- parsePolicy는 위 선택 지표와 `budgetNotice`(공식 원문의 예산 안내 문자열, 최대 500자)를 보존합니다. 누락·잘못된 지표는 카드에서 숨깁니다.
- PolicyIndicators({policy}) → 선택 지표의 출처별 누적 조회·수집일, 공식 예산 소진률·기준일·근거 링크, 원문의 예산 안내를 표시합니다. 실제 지표가 없으면 아무것도 렌더링하지 않습니다. 두 화면 모드의 PolicyCard에서 사용하며 추천 카드의 일반 화면에도 신청 기간을 표시합니다.
- PolicyExplorer({repository,tag,onClearTag,easy,saved,onSave,onOpen,onTag}) → 검색/페이지 React UI.
- PolicyCard({policy,saved,onSave,onOpen,onTag,easy?,reason?}) → 카드. 콜백은 정책 객체 또는 태그 문자열을 전달.
- PolicyDetail({policy,saved,onSave,onClose,onTag,mode,easy}) → native dialog. 공식 링크는 검증된 API URL만.

검색어·검색 범위·분야·지역·대상은 같은 목록 API 요청으로 전달하며 조건 변경 시 cursor를 초기화합니다.
지역 약칭과 정식 명칭, 대상의 나이/가구 조건·동의어는 서버에서 분류합니다.
브라우저에서 현재 페이지의 공고만 다시 필터링하지 않습니다. 서버 기준은
[저장소의 검색 필터](../../../../../backend/app/modules/storage/readme.md)를 참고합니다.

쉬운 화면은 한 열에 공고 3개씩 표시하며 기본 화면은 기존 6개 단위를 유지합니다. 모드 전환 시 페이지는 처음으로 돌아가고 검색어·검색 범위·관계 선택·분야·지역·대상·정렬 조건은 보존합니다. 검색 범위는 검색창 아래의 접힌 직접 선택 영역에 있으며, 나머지 쉬운 검색 조건도 접을 수 있는 한 영역의 기본 선택 상자이며 적용 조건을 요약합니다. 검색 결과가 한 페이지뿐이면 이전·다음 버튼을 표시하지 않습니다.

쉬운 공고 카드에는 지원 내용·대상·신청 기간과 ‘자세히 보기’ 동작 하나를 제공합니다. 저장·태그 탐색은 상세창에서 사용하며 미확인 기간은 공식 공고 확인 안내를 표시합니다. 상세창을 닫으면 원래 버튼으로 초점을 돌려줍니다.

[서버 계약 제안](../../../../docs/service-contract.md). `tests/policies.test.js`와 브라우저 태그·검색·상세·페이지 흐름을 검증하며 이번 변경의 실제 확인 범위와 미실행 E2E는 [쉬운 화면 문서](../../../../docs/senior-mode.md)에 구분합니다.

## 다국어 화면

`useI18n().t()`는 검색·필터·페이지·저장·상세 항목과 접근성 이름을 5개 언어로 표시합니다. 선택 상자의 `value`, 검색 요청의 한국어 지역·분야·대상과 태그는 기존 API 계약을 유지합니다. 사전은 `frontend/packages/core/src/i18n/featureMessages.js`와 `policyMessages.js`에서 공유합니다. 지표 수치는 선택 언어의 `Intl` 형식으로, 기준일은 한국 시간으로 표시합니다.

`useTranslatedPolicy(original,{priority=0,enabled=true})`는 한국어 이외 언어에서 서버의 `GET /v1/policies/{id}/translation?language=...`을 호출하고 검증된 표시 문구만 원본에 덧씌웁니다. 제목·요약·대상·기관·지원 내용·신청/지급 안내·본문·성별 조건·문의처·신청 방법·기타 조건·원문 항목·예산 안내를 번역합니다. ID·revision·필터값·태그·URL·기준 날짜·수치는 원본을 유지합니다. 저장·상세 열기 콜백은 항상 `original`을 전달합니다. `PolicyDetail`은 번역/한국어 원문 전환을 제공하고 상세 요청은 대기열 우선순위 10을 사용합니다.

공유 클라이언트는 revision·언어·원문 내용 기준 캐시와 진행 중 요청 공유를 관리합니다. 각 hook은 자신의 구독만 취소하고 이전 언어/원본의 늦은 응답을 무시합니다. `useVisibleTranslatedPolicy`의 `.ref`를 카드에 연결하면 화면 근처에 나타난 뒤 번역을 요청합니다. `PolicyTranslationStatus`는 번역 중 원문, 번역 오류/다시 시도, AI 번역, 한국어 원문 상태를 안내합니다. 번역 실패 시 내용은 한국어 원문으로 남습니다. 사용자 질문과 AI 답변/검색 근거는 별도 번역하지 않습니다. `tests/e2e/policy-translation.spec.js`는 합성 공고로 4개 번역 언어, 원문 전환, 원본 저장/URL/날짜 보존, 늦은 응답과 오류 재시도를 검증합니다.

`parsePolicy`의 `translationSourceEmptyFields`는 누락/null인 대상·기관·지원 내용·신청 안내의 화면 기본값을 식별합니다. 번역 요청에서는 이 기본값을 원문 없는 빈 문자열로 검증하며, 서버 번역도 비어 있을 때만 선택 언어의 화면 기본값을 복원합니다. 실제 내용이 있는 필드는 엄격한 내용 검증을 유지합니다. 대상이 없는 레거시 응답은 ‘지원 대상 확인 필요’로 표시하며 실제 대상 정보와 API 필터값은 유지합니다. 저장한 공고를 재파싱할 때도 원문 필드 누락 정보를 유지합니다. 원문 보기 선택은 같은 ID/revision의 자동 새로고침에서 유지하며 공고/개정/언어가 바뀌면 초기화합니다.

`policyTranslationModel.js`는 표시 기본값과 실제 원문을 구분하는 순수 함수입니다. `emptyTranslationFields(item)`은 누락된 표시 필드 이름 배열, `policyTranslationSource(policy)`는 기본값을 빈 원문으로 돌린 검사 전용 객체, `restoreTranslationFallbacks(original,translated,t)`는 원문이 없는 항목에만 번역된 UI 안내를 복원한 표시 객체를 반환합니다. 입력 객체를 변경하지 않습니다.
