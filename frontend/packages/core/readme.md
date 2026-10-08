# 웹·모바일 공통 금융 모델

2026-10-08: `financeQuestions(draft)`의 가구 정보는 ‘지원 대상 구분’과 ‘국민기초생활수급자·차상위계층’ 명칭을 사용합니다. 선택 체크박스 두 개의 보조 안내 문구는 제거했으며 선택 여부와 `recipient_status` 전송 값은 유지합니다.

2026-10-07: `@bokji/core/i18n`에 다섯 언어 UI 사전, 언어 감지·fallback·변수 처리를 제공합니다. `src/i18n/policyTranslation.js`는 표시 전용 공고 번역의 HTTP 요청·캐시·취소·응답 검증을 공유합니다. 함수 계약과 사용법은 [공통 번역](src/i18n/readme.md), 범위는 [다국어 UI와 공고 번역](../../docs/internationalization.md)를 참고하세요.

담당: 프론트엔드. 기존 웹의 `financeModel.js`, `financeFlow.js`를 옮긴 플랫폼 독립 JavaScript입니다. DOM·기기 저장·네트워크 호출·서버 계산 산식이 없습니다. 웹의 기존 경로는 재내보내기로 호환하며 모바일은 `@bokji/core/finance-model`, `@bokji/core/finance-flow`를 사용합니다.

- `emptyFinancialProfile()` → 미확인 값으로 시작하는 원입력 초안.
- `moneyInput(text)`, `moneyInputValue(value)` → 만원 입력/표시 표현. `parseMoney(value,label)` → 정수 원 또는 null; 잘못된 금액은 오류.
- `toFinancialProfile(draft)` → 서버 전송 필드만 포함한 정규화 원자료. 미확인과 0을 구분하며 잘못된 가구·차량·선택값은 오류.
- `parseCalculation(value)` → 검증된 서버 계산 결과 또는 오류. 최종 지원 자격을 새로 계산하지 않음.
- `financeQuestions(draft)` → 현재 가구·차량 수에 따른 질문 배열.
- `visibleFields(question,draft)`, `fieldValue(draft,path)`, `validateQuestion(question,draft)` → 표시 필드·입력값·첫 오류 또는 null.
- `formatMoney`, `formatNumber`, `officialSourceUrl` → 표시값 또는 검증된 HTTPS 출처 URL/null.
- `@bokji/core/median-income` → 2026년 공식 기준 중위소득 표, 정확한 가구원 수에 따른 기준 금액·월소득 비율. 웹과 모바일 빠른 계산이 공유.
- `@bokji/core/finance-prefill` → 저장 정보·회원 기본값에서 금융 초안과 빠른 계산 기본값 생성. 사용자가 수정한 값과 미확인을 보호.
- `@bokji/core/count-choices` → 가구원·자녀 수의 기본/확장/직접 입력 선택지. 묶음 선택만으로 정확한 인원을 추정하지 않음.

모바일은 `.npmrc`의 `install-links=true`로 이 패키지를 복사해 설치합니다. core 수정 후에는 설치된 복사본을 갱신하고 Metro를 다시 시작해야 합니다.

호출 세부 계약은 [웹 계산기](../../web/src/features/finance/readme.md)와 [금융 API](../../docs/api-integration.md)를 따릅니다. 검증: `frontend/web`의 `npm test`, `npm run build`; `frontend/mobile`의 `npm test`, `npm run typecheck`, `npm run export:native`.
