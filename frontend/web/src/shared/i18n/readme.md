# 웹 번역 상태와 언어 선택

담당: 프론트엔드. `main.jsx`에서 `I18nProvider`로 앱을 감쌉니다. 번역 사전은 `frontend/packages/core/src/i18n/`을 직접 공유합니다.

- `I18nProvider({children})` → React context. 최초 언어는 유효한 브라우저 저장값, 브라우저 선호 언어, 한국어 순서로 결정합니다. 다른 탭의 저장값 변경도 반영합니다.
- `useI18n()` → `{locale, setLocale, t, intlLocale, storageError}`. `t(source, values)`는 선택한 언어의 표시 문자열을 반환합니다. provider 바깥에서 호출하면 오류입니다.
- `setLocale(code)` → 현재 화면을 즉시 갱신하고 저장을 시도합니다. 저장 실패해도 화면에 적용하고 `storageError`를 알립니다. 폼·검색·로그인 상태는 초기화하지 않습니다.
- `LanguageSelector()` → 헤더의 접근 가능한 언어 선택 UI. 각 언어의 이름을 해당 언어로 표시합니다.
- `ContentLanguageNotice()` → 한국어 외의 언어에서 공고 AI 번역·한국어 AI 상담 답변·공식 원문 확인을 안내합니다.
- `useTranslatedPolicy(original,{priority=0,enabled=true})` → `{policy,original,state,error,retry,showOriginal,setShowOriginal}`. `policy`는 표시 전용이고 저장·API에는 `original`을 사용합니다. state는 original/idle/loading/ready/error이며 언어·공고 변경 후 이전 결과는 적용하지 않습니다.
- `useVisibleTranslatedPolicy(original,options={})` → 위 반환값과 `ref`. 요소가 화면의 150px 이내에 들어오면 공고 번역을 요청합니다.
- `PolicyTranslationStatus({translation,controls=false})` → 원문 유지·대기·실패·재시도 안내. controls는 준비된 번역의 원문/번역 전환 버튼을 표시합니다.
- `TranslatedPolicyTitle({policy,as='span'})` → 화면 근처 공고의 번역 제목과 상태 표시.
- `i18n.css` → 긴 번역 문장 줄바꿈, 중국어·일본어 시스템 폰트, 좁은 화면의 언어 선택기 조정. 헤더 배치는 `app/portal.css`에서 언어와 무관하게 화면 너비로 결정하며, 긴 메뉴는 메뉴 영역 안에서 가로 스크롤합니다. 언어 전환 시 헤더·메뉴 영역의 크기는 유지합니다.

언어 변경 시 `html.lang`, `html[data-locale]`, 탭 제목도 변경합니다. 저장값은 기존 JSON 저장 어댑터로 `bokji.locale.v1`에 기록하며 언어 정보만 저장합니다. 사용자 정보는 공고 번역 요청에 보내지 않습니다. 서버가 공개 공고 ID로 원문을 읽어 기존 모델 설정으로 번역합니다. UI와 공고 번역의 [전체 범위·서버 적용 방법](../../../../docs/internationalization.md)을 참고하세요.

```jsx
const { t } = useI18n();
<option value={region}>{t(region)}</option>;
// API에는 원래 region을 전달하며 option 표시만 바뀝니다.
```

검증: `npm test`, `npm run build`, `npm run test:e2e -- tests/e2e/i18n.spec.js`. 기존 한국어 E2E는 `playwright.config.js`에서 명시적으로 `ko-KR` 환경을 사용합니다.
