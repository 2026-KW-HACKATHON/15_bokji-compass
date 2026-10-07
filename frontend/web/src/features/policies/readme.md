# 공고

2026-10-07 전체공고 정렬·분야: `PolicyExplorer`와 repository.list의 기본 정렬은
`popular`(인기순·조회수)입니다. 최근 등록순(`recent`)과 이름순(`name`)도 선택할 수 있으며,
정렬·필터 변경과 조건 초기화는 첫 페이지로 돌아갑니다. 서버는 전체 검색 결과를 정렬한 후
페이지를 나눕니다. 확인된 정부24/복지로 누적 조회수가 높은 순서이며, 0회는 미제공보다 먼저,
동률은 최근 등록일·공고 ID 순서입니다. `filterPolicies`도 같은 기준의 새 배열을 반환합니다.
`categories`에 농림축산·어업, 사업·창업, 기타를 추가했습니다. 전체공고·캘린더·관심 분야가
같은 목록을 사용하고, 새 공고의 카드 아이콘은 각각 `sprout`, `store`입니다.
[기존 공고 재분류와 관리자 우선순위](../../../../../backend/docs/policy-categories.md).

2026-10-07 관리자 수정 반영: repository.get(id,{signal})는 최신 공개 상세를 조회합니다.
목록·캘린더·열린 상세는 usePolicyRefresh로 활성 상태 30초 및 포커스/복귀 시 갱신합니다.
상세 비공개/삭제 404는 열린 상세를 닫습니다. 이전 요청 취소와 선택 ID 검사로 응답 경합을 막습니다.
parsePolicy는 전체 본문·원문 항목·성별·기타 조건·신청 방법/링크·문의처·게시/수정일을 보존합니다.
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
- filterPolicies(items,{query,tag,category,region,audience,sort,savedIds}) → 새 배열. AND 검색·정확한 태그·전국 포함·정렬. 입력 배열 변경 없음.
- parsePolicy(item) → 표시 모델. 필수값 오류 시 ApiError. parsePolicyPage(response) → {items,total,nextCursor}.
- safeSourceUrl(value) → HTTP(S) URL 또는 null.
- parsePopularity(value) → `{views,source,basis,asOf}` 또는 null. 정부24/복지로의 0 이상 정수 누적 조회수(`provider_cumulative_views`)만 보존합니다. 예측 인기·최근 이용자 수는 생성하지 않습니다.
- parseBudget(value) → `{usedPercent,sourceUrl,asOf,evidence}` 또는 null. 0~100의 명시된 수치, HTTPS 근거 URL과 비어 있지 않은 근거 문장을 모두 요구합니다. 공고 기간·조회수로 소진률을 추정하지 않습니다.
- formatSignalDate(value) → 검증된 날짜·시각을 서울 시간대의 YYYY-MM-DD로 표시합니다. UTC 수집 시각을 브라우저 운영체제의 시간대에 따라 다르게 표시하지 않습니다.
- parsePolicy는 위 선택 지표와 `budgetNotice`(공식 원문의 예산 안내 문자열, 최대 500자)를 보존합니다. 누락·잘못된 지표는 카드에서 숨깁니다.
- PolicyIndicators({policy}) → 선택 지표의 출처별 누적 조회·수집일, 공식 예산 소진률·기준일·근거 링크, 원문의 예산 안내를 표시합니다. 실제 지표가 없으면 아무것도 렌더링하지 않습니다. 두 화면 모드의 PolicyCard에서 사용하며 추천 카드의 일반 화면에도 신청 기간을 표시합니다.
- PolicyExplorer({repository,tag,onClearTag,easy,saved,onSave,onOpen,onTag}) → 검색/페이지 React UI.
- PolicyCard({policy,saved,onSave,onOpen,onTag,easy?,reason?}) → 카드. 콜백은 정책 객체 또는 태그 문자열을 전달.
- PolicyDetail({policy,saved,onSave,onClose,onTag,mode,easy}) → native dialog. 공식 링크는 검증된 API URL만.

검색어·분야·지역·대상은 같은 목록 API 요청으로 전달하며 조건 변경 시 cursor를 초기화합니다.
지역 약칭과 정식 명칭, 대상의 나이/가구 조건·동의어는 서버에서 분류합니다.
브라우저에서 현재 페이지의 공고만 다시 필터링하지 않습니다. 서버 기준은
[저장소의 검색 필터](../../../../../backend/app/modules/storage/readme.md)를 참고합니다.

쉬운 화면은 한 열에 공고 3개씩 표시하며 기본 화면은 기존 6개 단위를 유지합니다. 모드 전환 시 페이지는 처음으로 돌아가고 검색어·분야·지역·대상·정렬 조건은 보존합니다. 쉬운 검색 조건은 접을 수 있는 한 영역의 기본 선택 상자이며 적용 조건을 요약합니다. 검색 결과가 한 페이지뿐이면 이전·다음 버튼을 표시하지 않습니다.

쉬운 공고 카드에는 지원 내용·대상·신청 기간과 ‘자세히 보기’ 동작 하나를 제공합니다. 저장·태그 탐색은 상세창에서 사용하며 미확인 기간은 공식 공고 확인 안내를 표시합니다. 상세창을 닫으면 원래 버튼으로 초점을 돌려줍니다.

[서버 계약 제안](../../../../docs/service-contract.md). `tests/policies.test.js`와 브라우저 태그·검색·상세·페이지 흐름을 검증하며 이번 변경의 실제 확인 범위와 미실행 E2E는 [쉬운 화면 문서](../../../../docs/senior-mode.md)에 구분합니다.
