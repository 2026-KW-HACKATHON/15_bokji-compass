# 모바일 언어 설정

담당: 모바일. 한국어(`ko`), 영어(`en`), 중국어 간체(`zh`), 베트남어(`vi`), 일본어(`ja`) UI를 지원합니다. Expo SDK 57의 기존 SecureStore를 재사용하며 새 네이티브 의존성은 없습니다.

- `I18nProvider`는 루트 RuntimeProvider 바깥에 둡니다. `useI18n()`은 `{locale, intlLocale, setLocale, t, formatMoney, storageError}`를 제공합니다. `t(source, values?)`는 공유 core 카탈로그에서 정확히 일치하는 UI 문구를 번역하고, `{name}` 같은 변수는 값 그대로 삽입합니다.
- `model.js`는 JSX의 줄바꿈/공백을 정리하여 알려진 문구를 찾습니다. 알 수 없는 문자열은 원문을 유지합니다. `createLocalePreference(storage, languages?)`는 `getSnapshot/subscribe/restore/setLocale`을 제공합니다. 읽기 실패에도 앱을 사용할 수 있고, 늦은 읽기가 사용자의 선택을 덮어쓰지 않으며, 저장은 선택 순서대로 처리됩니다.
- 처음에는 브라우저의 언어 목록 또는 네이티브 `Intl` 기본 locale을 참고합니다. 지원하지 않는 언어는 한국어로 시작합니다. 사용자가 고른 언어는 `bokji.locale.v1`에 저장합니다. 네이티브는 SecureStore, 웹 미리보기는 비민감 설정만 localStorage에 JSON 문자열로 저장합니다. 기존 raw 문자열도 읽으며, 지원하지 않는 저장 값은 무시합니다. 저장 실패 시 화면에 안내합니다. 인증 토큰 저장 방식은 변경하지 않습니다.
- 상단의 언어 아이콘·현재 언어 버튼과 내 계정의 언어 선택에서 즉시 변경합니다. 각 언어는 고유 표기(`한국어`, `English`, `中文`, `Tiếng Việt`, `日本語`)를 사용합니다. 선택한 언어에 체크를 표시하고 쉬운 화면에서는 큰 글자와 전체 폭 선택 행을 사용합니다. 숫자·KRW 금액은 선택한 locale의 Intl 형식으로 표시하며, 금융 입력 단위는 만원으로 유지하고 각 언어로 설명합니다.
- `LocalizedText`, `Copy`, `Button`은 알려진 UI 문자열을 번역합니다. **공고의 표시 데이터, AI 답변, 서버 설명, 사용자 입력/이름에는 `original`을 지정합니다.** 이 플래그는 UI 카탈로그의 문구 치환을 막으며, 공고의 API 번역 결과도 그대로 표시합니다. `ReadableText`도 전달받은 값을 그대로 표시합니다. API category/region/occupation 등의 enum, 경로, 사용자 입력 값은 번역하지 않습니다. 정책 필터는 표시 라벨만 번역합니다.
- `features/policies/usePolicyTranslation.tsx`는 한국어 이외의 언어에서 `api.policyTranslations.translate(policy, locale, {signal, priority})`를 호출합니다. API는 `GET /v1/policies/{id}/translation?language=en|zh|vi|ja`를 사용하며 공유 core 클라이언트가 응답 검증·65초 제한·메모리 캐시·요청 중복 제거·대기열을 담당합니다. 상세 화면은 우선순위 10을 사용합니다. 언어/공고 변경과 화면 종료 시 구독을 취소하고 오래된 응답은 표시하지 않습니다. 한국어에서는 요청하지 않습니다.
- `usePolicyTranslation(policy, priority=0)`는 `{display, active, status, original, toggleOriginal, retry}`를 반환합니다. `display`는 표시할 원본 또는 번역 정책이고 `active`는 번역 UI가 필요한지 나타냅니다. `status`는 `loading/translated/original/error`, `original`은 원문 선택 여부입니다. `toggleOriginal()`은 표시 모드를 전환하고 `retry()`는 실패한 요청을 다시 시도합니다. `PolicyTranslationControls({state, compact=false})`는 이 반환값을 받아 상태 안내, 원문/번역 전환, 실패 시 재시도 UI를 반환하며 한국어에서는 아무것도 표시하지 않습니다.
- 카드·홈·목록·상담의 선택 공고 제목·상세에 번역된 제목, 요약, 대상, 기관, 혜택, 기간을 표시합니다. 상세에는 본문, 지급 시기, 신청 방법, 연락처, 기타 조건, 원문 상세 항목도 보존하여 표시합니다. 원본 객체를 수정하지 않고 표시 객체만 교체하므로 ID, revision, 필터, 공식 URL, 상담의 API 요청 값은 유지합니다.
- 번역 중에는 한국어 원문과 진행 안내를 표시합니다. 실패 시 원문과 다시 시도 버튼을 제공합니다. 각 공고의 원문/번역 전환 버튼을 사용할 수 있으며 공고나 언어를 바꾸면 번역 보기를 기본으로 합니다. `OriginalContentNotice`는 공고의 AI 번역과 공식 원문 확인을 안내하고 AI 상담 답변은 현재 한국어임을 알립니다.
- 금융 문항 제목은 `features/finance/i18n.js`에서 문항 ID와 입력 인덱스로 구성합니다. 로컬 검증 오류와 검토표만 표시용으로 번역하며 계산 모델·저장 데이터는 유지합니다.

번역 추가는 `frontend/packages/core/src/i18n/mobileMessages.js`에 한국어 원문과 `en/zh/vi/ja` 네 값을 함께 넣습니다. 원문을 바꾸면 카탈로그 키도 함께 변경합니다. 동적 문장은 완성된 문자열을 연결하지 말고 `t('차량 {count}대', {count})`처럼 작성합니다.

검증: `node --test tests/i18n.test.mjs tests/policy-translation.test.mjs`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run export:native`. 언어 테스트는 네 카탈로그의 누락/한글 잔존, 우선 언어 감지, 저장 실패/복원 경쟁, 빠른 선택의 저장 순서, 금융 동적 제목과 검증, API 필터 원본 보존, 외부 콘텐츠 경계를 확인합니다. 공고 테스트는 전체 내용 보존·네 언어 번역·정체성/공식 URL 보존·캐시·한국어 요청 생략·실패 후 재시도를 확인합니다.

화면 회귀 검증은 `EXPO_PUBLIC_API_BASE_URL=https://api.example.test`로 `npm run export:web`를 실행한 뒤 `node tests/i18n-preview.mjs`를 사용합니다. 테스트 자체가 임시 로컬 서버와 Edge 브라우저를 열고 API fixture를 주입합니다. 실제 모델 생성 없이 다섯 언어, 저장/재시작, 원문 전환, 새 언어에서 번역 보기 복원, 오류 재시도, 오래된 언어 응답 무시, 홈 카드, 모바일 가로 넘침을 확인합니다. 스크린샷은 ignored `tmp/mobile-i18n/preview`에 저장합니다.

참고: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [SecureStore SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/).
