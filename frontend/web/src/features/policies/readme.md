# 공고

담당: 프론트엔드. 서버 또는 명시된 합성 예시 공고를 조회·탐색합니다.

- createPolicyRepository({mode,request,path?}).list(filters,{cursor?,limit?,signal?}) → Promise<{items,total,nextCursor,source}>. api GET /v1/policies, demo는 로컬 6개.
- filterPolicies(items,{query,tag,category,region,audience,sort,savedIds}) → 새 배열. AND 검색·정확한 태그·전국 포함·정렬. 입력 배열 변경 없음.
- parsePolicy(item) → 표시 모델. 필수값 오류 시 ApiError. parsePolicyPage(response) → {items,total,nextCursor}.
- safeSourceUrl(value) → HTTP(S) URL 또는 null.
- PolicyExplorer({repository,tag,onClearTag,easy,saved,onSave,onOpen,onTag}) → 검색/페이지 React UI.
- PolicyCard({policy,saved,onSave,onOpen,onTag,easy?,reason?}) → 카드. 콜백은 정책 객체 또는 태그 문자열을 전달.
- PolicyDetail({policy,saved,onSave,onClose,onTag,mode,easy}) → native dialog. 공식 링크는 검증된 API URL만.
  [서버 계약 제안](../../../../docs/service-contract.md). 검증: tests/policies.test.js와 브라우저 태그·검색·상세·페이지 흐름.
