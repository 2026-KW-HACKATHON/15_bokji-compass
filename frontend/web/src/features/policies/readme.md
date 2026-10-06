# 공고

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
