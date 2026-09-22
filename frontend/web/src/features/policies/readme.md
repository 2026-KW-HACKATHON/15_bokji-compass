# 혜택 탐색

담당: 프론트엔드. 합성 예시·탐색 규칙·카드 화면입니다. 실제 정책이나 자격 판정을 제공하지 않습니다.

- `listPolicies()` → `Promise<{items, source: 'demo'}>`. 현재 예시 데이터 6개, 외부 호출 없음. 추후 API 공급 어댑터 교체 지점.
- `filterPolicies(items, options?)` → 정렬된 새 배열. `options`: `query`(공백으로 분리한 키워드 AND), `category`, `region`, `audience`, `sort`(`recent`/`name`), `savedIds`(null이면 전체, 배열이면 해당 ID만). 지역 필터는 지정 지역과 전국을 포함하고 대상 필터는 지정 대상과 전체 대상을 포함합니다. 입력을 변경하지 않으며 유효한 화면 모델 배열을 전제로 합니다. 자격 판정이 아닙니다.
- `PolicyCard({policy, saved, onSave, onOpen})` → React article. `onSave(id)`/`onOpen(policy)` 이벤트를 부모에 전달하며 직접 저장·API 호출하지 않습니다.
- `demoPolicies.js`의 분류·지역은 UI 표시값이며 공식 코드/서버 계약이 아닙니다.

검증: `npm.cmd test`의 조합 검색·전국 포함·저장 ID·정렬 불변성, E2E의 검색·상세·저장 유지.
