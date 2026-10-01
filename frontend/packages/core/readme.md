# 웹·모바일 공통 금융 모델

담당: 프론트엔드. 기존 웹의 `financeModel.js`, `financeFlow.js`를 옮긴 플랫폼 독립 JavaScript입니다. DOM·기기 저장·네트워크 호출·서버 계산 산식이 없습니다. 웹의 기존 경로는 재내보내기로 호환하며 모바일은 `@bokji/core/finance-model`, `@bokji/core/finance-flow`를 사용합니다.

- `emptyFinancialProfile()` → 미확인 값으로 시작하는 원입력 초안.
- `moneyInput(text)`, `moneyInputValue(value)` → 만원 입력/표시 표현. `parseMoney(value,label)` → 정수 원 또는 null; 잘못된 금액은 오류.
- `toFinancialProfile(draft)` → 서버 전송 필드만 포함한 정규화 원자료. 미확인과 0을 구분하며 잘못된 가구·차량·선택값은 오류.
- `parseCalculation(value)` → 검증된 서버 계산 결과 또는 오류. 최종 지원 자격을 새로 계산하지 않음.
- `financeQuestions(draft)` → 현재 가구·차량 수에 따른 질문 배열.
- `visibleFields(question,draft)`, `fieldValue(draft,path)`, `validateQuestion(question,draft)` → 표시 필드·입력값·첫 오류 또는 null.
- `formatMoney`, `formatNumber`, `officialSourceUrl` → 표시값 또는 검증된 HTTPS 출처 URL/null.

호출 세부 계약은 [웹 계산기](../../web/src/features/finance/readme.md)와 [금융 API](../../docs/api-integration.md)를 따릅니다. 검증: `frontend/web`의 `npm test`, `npm run build`; `frontend/mobile`의 `npm test`, `npm run typecheck`, `npm run export:native`.
