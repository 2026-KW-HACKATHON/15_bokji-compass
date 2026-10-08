# 웹·모바일 공통 번역

2026-10-08: `navigationMessages.js`에 추천 제외 저장 중 안내와 실패 후 카드 복원
안내의 5개 언어 문구를 추가했습니다.

2026-10-08: `commonMessages.js`의 공통 하단 AI 안내를 간결한 격식체로 바꾸고 네 외국어 번역도 줄였습니다. `translate(locale, source) -> string` 계약은 동일합니다.

2026-10-08: `navigationMessages.js`에 종 알림 목록·미읽음 수·공고 연결·실패 안내를
영어·중국어·베트남어·일본어로 추가했습니다. `{count}`와 `{title}`을 치환하며 서버
알림 제목·본문의 원문은 유지합니다. `translate(locale, source, params) -> string` 계약은 같습니다.

2026-10-08: `featureDynamicMessages.js`는 ‘신청일까지 {count}일 남음’·‘마감일까지 {count}일 남음’, 오늘 신청 시작/마감과 접수 마감 문구를 네 외국어로 제공합니다. D+/D-/경과 일수 번역은 제거했으며 `translate(locale, source, {count}) -> string` 호출 계약은 같습니다.

2026-10-08: `localMessages.js`는 우리 동네 복지의 메뉴·지역 입력·분야·빈 상태·공식 안내 링크 UI 43개 문구를 영어·중국어·베트남어·일본어로 제공합니다. `index.js`의 `messageCatalogs`와 `messages`에 등록하며 서비스 원문과 입력 지역명은 번역하지 않습니다.

2026-10-08: `accountMessages.js`는 주소 검색의 브라우저 오프라인·응답 지연·외부
서비스 로딩 실패·초기화 실패를 구분하는 한국어 원문과 네 언어 번역을 제공합니다.
`translate(locale, source)` 계약은 동일하며 `postcode-loader.test.js`가 오류별 번역을 확인합니다.

2026-10-08: `navigationMessages.js`는 계층형 상단 메뉴의 하위 목적지·닫기 버튼·접근성 문구를 제공합니다. `{menu} 하위 메뉴`는 번역한 메뉴 이름을 변수로 받아 문장을 완성합니다. `messageCatalogs`와 최종 `messages`에 함께 등록하며 번역 함수 계약은 동일합니다.

담당: 프론트엔드. 한국어·영어·중국어(간체)·베트남어·일본어 UI 사전, 플랫폼 독립 언어 처리 및 주입된 HTTP 함수로 공개 공고 번역을 조회하는 클라이언트를 제공합니다. React, DOM, 기기 저장소에 의존하지 않습니다.

- `locales` → `{code, nativeName, intlLocale}` 목록. 코드: `ko`, `en`, `zh`, `vi`, `ja`.
- `normalizeLocale(value)` → 지원되는 언어의 코드. `en-US`, `zh-Hant-TW` 등 지역 변형은 해당 언어 사전으로 연결하고 지원되지 않으면 `ko`를 반환합니다. 중국어는 간체 사전 하나를 사용합니다.
- `isSupportedLocale(value)` → 저장 가능한 정확한 코드인지 boolean.
- `parseStoredLocale(raw)` → 기존 JSON 문자열 또는 앱의 원시 저장 문자열에서 유효한 코드, 그 외 `null`.
- `detectLocale(languages)` → 순서대로 처음 지원되는 언어 코드 또는 `ko`.
- `intlLocaleFor(code)` → `ko-KR`, `en-US`, `zh-CN`, `vi-VN`, `ja-JP` 중 하나.
- `translate(locale, source, values={})` → 사전의 UI 문자열. 사전에 없는 문자열은 원문 그대로 반환합니다. `{name}` 또는 `{{name}}`에 전달한 값만 치환하며, 빠진 변수는 그대로 남깁니다. HTML을 생성하지 않습니다.
- `translateFinanceError(message, t)` → 로컬 금융 모델에서 발생한 검증 오류를 필드명과 문장 단위로 번역합니다. 공고 본문·사용자 입력·임의 서버 본문에는 적용하지 않습니다.
- `localeStorageKey` → `bokji.locale.v1`. 플랫폼별 저장 구현은 이 모듈 밖에서 담당합니다.
- `messageCatalogs`, `messages` → 검사와 조회용 사전. common/account/feature/mobile/finance/policy 영역으로 나누며 한국어 원문을 키로 사용합니다.

```js
import { translate, detectLocale } from '@bokji/core/i18n';
const locale = detectLocale(['vi-VN', 'en-US']);
translate(locale, '{count}명', { count: 3 }); // '3 người'
```

새 UI 문구는 담당 사전에 `{en, zh, vi, ja}`를 모두 추가하고 렌더링 시 번역합니다. 지역·분야·선택값 같은 API 값은 한국어 또는 기존 코드로 보존하고 표시값만 번역하세요. 동적 문장은 문자열 조각을 이어 붙이지 말고 변수 있는 문장 키를 사용합니다. 사용자 이름·주소·검색어·공고 원문·AI 응답은 사전으로 대체하지 않습니다.

웹/모바일은 로컬 core 소스를 공유합니다. UI 사전은 공고·사용자 입력·AI 답변을 자동 번역하지 않습니다. 공개 공고 번역은 아래 별도 클라이언트를 사용하며 AI 자유 답변·외부 주소검색·관리자 콘솔은 원문으로 유지합니다.

## 공고 표시 번역 클라이언트

`assistantMessages.js`는 `#assistant`와 상단의 AI 복지비서·서비스 소개 메뉴에 추가된 UI 사전입니다. `messageCatalogs`와 `messages`에 함께 등록하며 제목·설명·요약 카드·신청 상태·챗봇 이어보기·로딩 안내를 다섯 언어로 제공합니다. `{year}년 준공`은 연도 값만 삽입해 표시합니다. `translate(locale, source, values)`의 반환값과 기존 fallback 계약은 동일합니다.

`policyTranslation.js`는 UI 사전과 별도 진입점입니다.

- `policyTranslationFields` → 제목·본문·신청 방법 등 표시 필드 허용 목록. ID·링크·지역/분야 코드·필터 날짜를 포함하지 않습니다.
- `applyPolicyTranslation(policy, language, response)` → 응답의 공고 ID·언어·원문 해시·개정·표시값 구조를 검사하고 원본을 변경하지 않은 새 표시 객체. 잘못된 응답에는 `PolicyTranslationError`를 던집니다. 전체 상세와 일부 필드가 빠진 목록 응답을 모두 허용합니다.
- `createPolicyTranslationClient({request,maxEntries=100,maxPending=128,ttlMs=30000,now=Date.now})` → `{translate,clear}`. 주입 함수 `request(path,{timeoutMs:65000})`에는 공개 공고 ID와 언어만 전달합니다.
- `translate(policy, language, {signal,priority=0}={})` → 번역 표시 객체의 Promise. 한국어는 원본을 즉시 반환하며 서버 호출이 없습니다. 메모리 캐시와 공유 요청은 원문·개정·언어별로 구분합니다. 요청은 하나씩 실행하고 높은 priority의 대기 작업을 먼저 처리합니다. subscriber 취소는 다른 화면에서 사용 중인 공유 요청을 중단하지 않으며 사용자가 모두 떠난 미시작 작업은 제거합니다.
- `clear()` → 메모리 결과를 비우고 대기 작업을 거절합니다. 진행 중 요청 결과는 이후 캐시에 추가하지 않습니다.
- `PolicyTranslationError` → `{code,message,status}`를 가진 오류. 원문을 계속 표시하고 사용자에게 재시도 상태를 안내합니다.

서버 캐시는 공개 상태·개정·해시·프롬프트 버전을 확인합니다. [전체 운영·지원 범위](../../../../docs/internationalization.md), [서버 계약](../../../../../backend/app/modules/policy_translation/readme.md).

검증: 웹 `npm test`의 `i18n.test.js`가 언어 감지·fallback·변수 및 모든 사전의 네 언어 완결성을 검사합니다. `policy-translation.test.js`는 응답 허용 목록·개정·캐시·요청 병합·취소를 검사합니다. 웹 E2E에서 실제 선택·재접속·입력 보존·저장 실패·320px 쉬운 화면·공고 번역 상태를 검사합니다. 모바일 검증은 해당 i18n 폴더와 테스트 문서를 참고하세요.
