# 복지나침반 모바일

**2026-10-08 AI 복지비서:** 웹 AI 페이지의 생활정보·지원 후보·추가 확인·신청 현황·새 안내와 대화형 정보 입력을 하단 ‘AI 비서’에서 제공합니다. ‘상담’ 탭은 제거하고 ‘챗봇’은 화면을 일부만 차지하는 별도 패널로 변경했습니다. [AI 화면과 API](src/features/ai/README.md) · [챗봇 동작](src/features/assistant/README.md).

**2026-10-07 다국어 UI·공고 번역:** 한국어·영어·중국어 간체·베트남어·일본어를 상단 🌐 버튼 또는 내 계정에서 선택할 수 있습니다. 선택은 기기에 저장하고, 공고의 제목·요약·본문·상세 조건을 선택한 언어로 번역하며 한국어 원문과 전환할 수 있습니다. 번역 중/실패에는 원문과 안내·재시도를 제공합니다. AI 상담 답변은 현재 한국어입니다. [번역 모듈과 추가 방법](src/i18n/readme.md).

**2026-10-06 Android 릴리스 경로 추가:** `npm run release:android`로 검증·독립 APK 빌드·서명·APK 검사를 수행합니다. 서명 전 빌드 검증은 `npm run release:android -- -Unsigned`입니다. [필수 서명 설정·EAS APK/AAB·실제 검증 범위](../docs/android-release.md).

**2026-10-02 전시 배포 범위:** Android APK와 웹을 우선합니다. iPhone은 웹 접속으로 안내하며 iOS 네이티브 배포 작업은 이번 전시 범위에서 제외합니다. [고정 주소·QR 관리](../docs/exhibition.md).

담당: 프론트엔드/모바일. Android·iOS 공통 React Native + Expo SDK 57 앱입니다. 기존 웹과 별도로 실행하며 금융 입력 규칙은 `../packages/core`에서 공유합니다. 홈·[이메일 회원가입·카카오 가입/로그인](src/features/auth/readme.md)·소득/재산 계산·동의 저장·조회·삭제와 공개 공고 목록·검색·상세를 제공합니다. [알림 권한 안내·전체/유형별 수신 설정·기기 등록](src/features/notifications/readme.md)을 구현했습니다. 실제 자동 푸시 발송·개인 추천·저장 공고 동기화는 후속 작업입니다.

문서 안내: [구현 범위와 이식 현황](../docs/mobile-migration.md) · [최신 보안 재검토와 배포 조건](../docs/mobile-security-review.md) · [배너 이미지·생성 프롬프트](assets/home/README.md). **main 반영은 소스 공유이며, 현재 개발 APK의 배포 승인을 의미하지 않습니다.**

브랜드 로고는 웹의 `../web/public/brand-logo.png`와 동일한 `assets/brand-logo.png`를 사용합니다. 앱 아이콘·웹 미리보기 파비콘·홈 브랜드 영역에서 같은 원본을 사용하며, 로고 변경 시 두 파일을 함께 갱신합니다.

## 실행

2026-10-08: Expo 개발 도구의 node-forge 서명 검증과 braces 재귀 스택 고갈 취약점을 로컬 패치로 보완합니다.
`npm ci`에서 자동 적용하고 주요 npm 명령은 실행 전에 패치 해시를 확인합니다.
직접 Expo/EAS/Gradle 명령을 실행하기 전에는 `npm run security:check`를 실행하세요.
[서명 검증 수정·공식 버전 전환](../docs/node-forge-security-fix.md),
[braces 깊이 제한·남은 감사 경고](../docs/mobile-security-review.md).

고정 서버 주소는 **`https://bokji.commitnaru.com/api`**입니다. `.env.example`과 EAS development/preview/production 프로필에 반영했습니다. 이 PC의 `.env`도 같은 주소를 사용합니다. 전시 웹·QR 주소는 `https://bokji.commitnaru.com/`이며 앱 API에는 `/api`가 필요합니다.

주소는 JS 번들 생성 시 포함됩니다. 기존 설치된 독립 APK는 새 주소로 다시 빌드·서명해 업데이트해야 합니다. 주소 변경 후 개발 앱은 `npm start -- --clear`로 Metro 캐시를 초기화하고 전체 새로고침합니다. 이전 서버의 저장된 로그인은 서버 주소가 달라지면 초기화되므로 고정 사이트 계정으로 다시 로그인합니다. 로컬 API 점검이 필요할 때만 환경변수나 `android:local -- -ApiBaseUrl ...`로 명시적으로 덮어씁니다.

로컬 배포 검증은 Expo 설정 사전 검사와 Gradle에도 주소가 전달되도록 셸에 명시합니다. EAS는 각 프로필의 `env`를 사용합니다.

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='https://bokji.commitnaru.com/api'
$env:BOKJI_RELEASE='1'
npx expo export --platform android --clear
```

2026-10-02: 타입·린트, Android Hermes 번들 생성, 앱 클라이언트의 실제 health/공고 응답 검증 완료. 프록시에 기존 모바일 인증·알림 API 경로를 연결했고 비로그인 401·로그인 빈 입력 422 확인. 이 검증은 서명 APK 생성·실기기 설치 완료를 의미하지 않습니다.

Node.js 22.13 이상. 이 폴더에서 실행합니다. 저장소 전체를 내려받아 `../packages/core` 경로를 유지해야 합니다.

```powershell
npm ci
Copy-Item .env.example .env
# 기본값: https://bokji.commitnaru.com/api
npm start
```

`EXPO_PUBLIC_API_BASE_URL`은 앱에 포함되는 공개 주소입니다. 키·비밀번호를 넣지 마세요. 직접 백엔드 주소는 `https://호스트`, `/api`를 제거해 전달하는 프록시는 `https://호스트/api`입니다. 앱은 Vite proxy를 사용하지 않습니다. 휴대폰의 localhost는 휴대폰 자체입니다. Android 에뮬레이터의 PC 주소는 보통 `10.0.2.2`이며 실제 기기는 접근 가능한 HTTPS 개발 서버를 사용합니다. 개발 JS에서만 HTTP 설정을 허용하지만 네이티브 OS가 HTTP를 차단할 수 있으므로 HTTPS를 권장합니다. 서버 CORS는 브라우저 미리보기에서만 필요하며 Origin을 명시적으로 등록합니다.

API 주소가 없으면 설정 안내를 표시하고 네트워크 작업을 막습니다. 서버 상태 확인은 프로세스 응답만 의미하며 회원 저장소/정책 API 준비를 보장하지 않습니다.

- `npm run android`: Expo Prebuild 후 Android APK를 로컬 빌드·설치·실행. Android SDK/JDK와 기기는 별도 필요.
- `npm run android:local -- -ApiBaseUrl http://127.0.0.1:8766`: Windows에서 SDK와 Android Studio JDK를 찾아 실행하는 보조 명령. 켜진 기기가 정확히 하나 필요하며, 여러 기기는 `-Device emulator-5554`처럼 지정합니다. localhost API와 Metro 포트는 adb reverse로 연결합니다.
- `npm run ios`: macOS에서 iOS 로컬 빌드·설치·실행. Windows에서는 iOS 클라우드 개발 빌드와 iPhone을 사용.
- `npm run web`: 화면 점검용 브라우저. 토큰은 메모리에만 보관하므로 새로고침하면 로그아웃됩니다.
- 첫 네이티브 개발 빌드: Expo 계정을 연결한 뒤 `npx eas-cli@latest build --profile development --platform android` 또는 `--platform ios`. 클라우드 업로드·계정 연결·서명은 아직 수행하지 않았습니다.

실기기에 개발 빌드를 설치한 뒤 Metro QR로 연결합니다. Expo Go는 SDK 호환 여부에 따라 간단한 확인에 사용할 수 있지만 보안 저장소·프로세스 종료/복원 검증은 개발 빌드에서 진행합니다.

## Android Studio로 확인하기

1. Android Studio의 Device Manager에서 일반 가상 기기 `U_Pixel_2_`(표시 이름 `U(Pixel 2)`)를 켭니다. `Pixel_2_API_34`는 화면 렌더링·키보드가 비활성화된 ATD 자동 테스트 이미지이므로 직접 화면을 보며 테스트할 때는 사용하지 않습니다.
2. 저장소 루트에서 `backend/.venv/Scripts/python.exe frontend/mobile/tests/serve-api.py`로 격리 테스트 API를 켭니다. 이미 8766 포트에서 실행 중이면 다시 켜지 않습니다.
3. 이 폴더의 터미널에서 `npm run android:local -- -ApiBaseUrl http://127.0.0.1:8766`을 실행합니다. 최초 빌드에는 Gradle·SDK Platform 36·Build Tools 36.0.0·NDK 등 다운로드 시간이 필요합니다.
4. 에뮬레이터의 복지나침반에서 `mobile_preview` / `PreviewOnly42!`로 로그인합니다. 계산/저장/불러오기를 확인하고 앱을 종료했다 다시 열어 로그인 복원 여부를 확인합니다.

Android Studio에서 네이티브 프로젝트를 열려면 생성된 `frontend/mobile/android`를 선택합니다. 이 디렉터리는 Expo 설정으로 다시 생성할 수 있는 Git 제외 파일입니다. 직접 수정하지 않고 `app.config.ts`/config plugin으로 변경합니다. SDK 설치용 API 버전과 에뮬레이터의 Android 버전은 같을 필요가 없습니다.

`scripts/android-local.ps1`은 `Device`(선택), `ApiBaseUrl`(선택)를 입력받으며 Metro는 8081 포트를 사용합니다. 기기 확인→포트 연결→로컬 Metro 시작/재사용→Expo 로컬 빌드를 실행하고 성공/실패 exit code를 반환합니다. Metro는 IPv4 localhost에만 연결하고 adb reverse로 기기에 전달합니다. 시작된 Metro는 명령 종료 후에도 실행되며 로그는 `.expo/dev/logs/start.log`에 남습니다. API 주소를 바꾸면 기존 Metro를 종료한 뒤 다시 실행하세요. 프로세스 내 환경변수만 설정하고 전역 SDK/JDK 설정이나 가상 기기 데이터는 초기화하지 않습니다. 실행할 API 주소를 지정하지 않으면 기존 환경변수/`.env`를 사용합니다.

## 파일과 공개 진입점

| 위치                                     | 역할·입력·반환                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/_layout.tsx`                    | 공통 상태와 홈·공고·계산기·상담·내 계정 탭 조립                                                                                                                                                                     |
| `src/features/home/HomeScreen.tsx`       | 검색, 분야별 바로가기, 중위소득 확인, 실제 인기 공고                                                                                                                                                                |
| `src/components/ui.tsx`                  | 모든 화면에서 스크롤 밖에 고정한 쉬운 화면 스위치와 공통 UI                                                                                                                                                         |
| `src/components/theme.ts`, `Icon.tsx`    | 공통 색상·글자 크기·탭 높이와 Lucide 아이콘. 일반/쉬운 모드의 시각 구분                                                                                                                                             |
| `src/app/policies/`                      | 목록·검색·분야/지역·정렬·페이지 이동, 별도 상세 경로·공식 링크                                                                                                                                                      |
| `src/features/policies/model.js`         | `policyPath({query?,category?,region?,sort?,cursor?,limit?})` → 공고 조회 경로 문자열(기본 `sort="popular"`, `limit=6`). 공고/페이지 검증·분야 목록·HTTP(S) 링크 검사. [함수 계약](src/features/policies/readme.md) |
| `src/services/client.js`                 | `resolveApiUrl(value,development)` → 검증된 절대 주소. `createClient({baseUrl,fetchImpl?,timeoutMs?})` → HTTP 요청 함수. 외부 HTTP 호출, 15초 제한, 취소·상태 오류                                                  |
| `src/services/api.js`                    | `createApi(request)` → health/login/me/logout/calculate/getProfile/saveProfile/deleteProfile/listPolicies/getPolicy. 금융·공고 응답 검증, 공고는 비회원 요청                                                        |
| `src/services/session.js`                | `createSession({api,storage,baseUrl,now?})` → subscribe/getSnapshot/restore/login/logout/invalidate. 저장소·서버 호출을 주입하고 세션 상태 관리                                                                     |
| `src/platform/sessionStorage.ts`         | read/write/clear: 기기 SecureStore의 토큰·서버 주소·만료·로그아웃 대기 상태만 저장. 웹 어댑터는 메모리 전용                                                                                                         |
| `src/features/finance/FinanceScreen.tsx` | 빠른 중위소득 확인, 5개 입력 단계·최종 확인, 계산 결과·동의 저장·불러오기·삭제                                                                                                                                      |
| `src/features/finance/state.js`          | 메모리 전용 금융 상태, 계정별 초기화, 자동 불러오기와 늦은 응답 보호                                                                                                                                                |
| `src/features/finance/draft.js`          | `updateDraft(draft,path,value,cache?)` → 원본을 바꾸지 않은 입력 초안. 가구/차량 목록 정합성과 축소 후 복원. I/O 없음                                                                                               |
| `app.config.ts`, `eas.json`              | Expo 설정과 개발/내부 테스트/운영 빌드 프로필                                                                                                                                                                       |

## 인증과 개인정보

- 기존 웹 가입 계정으로 `/v1/mobile/auth/login` 호출. 응답은 `{access_token,token_type,expires_in,user}`입니다. 앱은 Bearer 헤더를 쓰고 웹은 기존 HttpOnly 쿠키를 유지합니다.
- 모바일 토큰은 서버에서 별도 해시 영역으로 저장해 웹 쿠키와 상호 사용할 수 없습니다. 7일 만료, 자동 갱신 없음, 만료 시 재로그인. 로그아웃은 서버 세션 폐기 후 로컬 토큰 제거.
- 로그아웃 실패는 성공으로 표시하지 않습니다. 보안 저장소에 로그아웃 대기를 기록하고, 다음 시작에서 세션 복원 대신 폐기를 재시도합니다. 저장소 자체가 잠겼으면 다시 시도 안내를 표시합니다.
- 복원 중 네트워크 오류는 금융정보를 노출하지 않고 재시도를 제공합니다. 오래된 요청의 401은 다른 토큰의 세션을 지우지 않습니다.
- 금융 원자료·계산 결과·비밀번호·사용자 객체는 영구 기기 저장소에 쓰지 않습니다. 금융 저장은 별도 동의와 버튼이 필요합니다. 계산기를 열면 로그인 계정의 저장 정보를 자동 조회하며 작성 중인 값은 덮어쓰지 않습니다.
- 비회원 입력은 로그인 후에도 유지합니다. 다른 계정으로 전환하거나 로그아웃하면 금융 메모리를 초기화하고 이전 요청을 취소합니다. 지연 응답으로 다른 계정의 정보가 복원되지 않습니다.
- 가구원 축소·차량 입력 제거, 계정 정보 삭제는 확인 후 실행합니다. 화면 입력 삭제와 서버 저장 삭제를 구분합니다. 빈칸은 미확인, 0은 실제 0원입니다.
- 쉬운 화면은 실행 중 설정이며 시스템 글꼴 확대도 허용합니다. 현재 기기 간 설정/공고 동기화는 없습니다.

쉬운 화면은 제목 26/본문 20sp, 큰 버튼과 선명한 테두리를 사용합니다. 브랜드와 모드·메뉴 조작을 두 줄로 나누고 분야 바로가기는 2열로 표시합니다. 공고 제목을 자르지 않으며 지원 내용·대상·신청 기간을 구분합니다. 긴 도움말·요약·계산 내역은 펼쳐 읽고, 저장 동의·삭제 확인·결과의 주의·미확인 항목은 항상 접근할 수 있습니다.

`node tests/easy-layout-preview.mjs`로 320·390·430px 화면의 주요 버튼, 펼침 상태, 전체 내용 접근, 가로 넘침을 확인합니다. 이 테스트는 브라우저 안에서만 공고 응답을 대체하며 실제 서비스 데이터는 변경하지 않습니다.

## 공고 조회

홈의 `공고 찾아보기` 또는 `공고` 탭을 사용합니다. 웹과 같은 `GET /v1/policies`, `GET /v1/policies/{id}`에 연결하며 LLM을 호출하지 않습니다. 기본 6개/쉬운 화면 3개씩 표시하고 모드·검색 조건 변경 시 첫 페이지로 돌아갑니다. 빈 목록·통신 실패·재시도·상세 404를 구분합니다. 원문 링크는 인증정보 없는 HTTP(S)만 열고 금융/회원 토큰을 보내지 않습니다.

2026-10-07: 첫 조회와 검색 조건 초기화는 출처 사이트 누적 조회수가 높은 공고부터 보여주는 `popular` 정렬을 사용합니다. 검색 조건의 정렬에서 ‘인기순 (조회수)’, ‘최근 등록순’, ‘이름순’을 선택할 수 있습니다. 분야 목록에는 `농림축산·어업`, `사업·창업`, `기타`를 포함하며 서버가 반환한 카테고리를 그대로 표시합니다. 이 변경은 앱 소스에 적용되므로 설치된 독립 APK 반영에는 새 번들이 필요합니다.

공고 검증에는 MySQL을 사용하는 최신 백엔드가 필요합니다. `tests/serve-api.py`의 격리 금융/인증 서버에는 실제 공고 DB가 없습니다. 이번 실행은 backend에서 `.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8771`로 연 최신 서버에 앱을 연결했습니다. 브라우저도 확인하려면 시작 전 `CORS_ORIGINS`에 `http://localhost:8081`, `http://127.0.0.1:8081`을 JSON 배열로 지정합니다. 모바일은 `npm run android:local -- -ApiBaseUrl http://127.0.0.1:8771`을 사용합니다.

2026-10-01 확인 시 실제 DB의 공개 공고는 0개이며, 수집 원문 2개는 별도 공개 승인 대기입니다. 이 앱 변경은 검토 상태를 변경하거나 미공개 분석 결과를 노출하지 않습니다. 목록·상세 유효 데이터 테스트는 `node tests/policies-preview.mjs`의 브라우저 응답 대역으로만 수행하며 서비스에는 예시 공고를 넣지 않습니다.

## 검증

```powershell
npm run typecheck
npm run lint
npm test
npm run export:native
npx expo-doctor
```

`export:native`는 Android·iOS JavaScript/Hermes 번들 검증이며 APK/IPA 생성이나 실제 OS 실행 검증이 아닙니다. 기존 웹 회귀 검사는 `../web`에서 `npm test`, `npm run build`입니다.

브라우저에서 실제 API와 연결하는 격리 점검은 두 터미널을 사용합니다. 테스트 API는 기존 `.env`와 개발 DB를 사용하지 않으며 `tmp` 아래 임시 SQLite에 합성 계정만 만듭니다.

```powershell
# 저장소 루트, 첫 터미널
backend/.venv/Scripts/python.exe frontend/mobile/tests/serve-api.py
# frontend/mobile, 두 번째 터미널
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:8766'
npm run web -- --localhost --port 8081
# 서버 준비 후 frontend/mobile의 별도 터미널
node tests/preview-smoke.mjs
```

이 브라우저 검사는 `frontend/web`에 설치된 Playwright와 Microsoft Edge를 사용합니다. 테스트 계정은 `mobile_preview` / `PreviewOnly42!`이며 격리 테스트 서버에만 존재합니다. 산출물은 저장소 `tmp/mobile-preview/`에 저장합니다.

2026-10-01 Android 14 에뮬레이터에서 APK 설치/실행, 로그인, SecureStore 세션의 강제 종료 후 복원, 로그아웃 후 재실행, 일반 AVD의 화면/키보드/탭 이동/10단계 계산 응답을 확인했습니다. 화면 기록은 `tmp/mobile-android/`에 있습니다. APK는 `android/app/build/outputs/apk/debug/app-debug.apk`이며 이번 산출물은 x86_64 에뮬레이터용 개발 빌드이므로 Metro가 필요합니다. TalkBack·VoiceOver·실제 휴대폰·iOS 설치/실행은 별도 점검이 필요합니다.

## 배포 전 남은 설정

`com.bokjicompass.app`은 임시 앱 식별자입니다. 스토어 등록 전에 팀 소유 식별자·Expo projectId·Apple/Google 서명·운영 API 주소를 확정해야 합니다. preview/production 프로필은 HTTPS API 주소가 없으면 중단합니다. 현재 스토어 업로드나 EAS 프로젝트 생성은 수행하지 않았습니다.

초기 npm 검사에서 moderate 13건을 발견해 `decode-uri-component` 0.5.0과 `uuid` 11.1.1로 수정했습니다. Router가 CommonJS 함수를 요구하므로 `../packages/decode-uri-component-compat`은 공식 패치 버전을 그대로 호출하는 어댑터만 제공합니다. `.npmrc`의 `install-links=true`가 로컬 패키지와 하위 의존성을 함께 설치합니다. 공유 core 소스를 바꾸면 `npx expo install --npm`으로 모바일의 복사본도 갱신하세요. SDK 강제 다운그레이드는 하지 않았습니다.

## Android 보안 기준과 배포 검사

2026-10-01 현재 APK는 **개발용이며 배포 불가**입니다. 디버그 서명·개발 런처·Metro 의존성이 남아 있으므로 파일명을 release로 바꾸거나 개발 APK를 그대로 배포하면 안 됩니다. 운영 HTTPS API와 팀의 배포 서명이 아직 확정되지 않았습니다.

`plugins/with-security.cjs`가 Prebuild마다 다음 설정을 생성합니다. 생성된 `android/` 파일을 수동 수정하지 마세요.

- 백업과 기기 간 데이터 이전을 금지합니다. SecureStore 외 앱 데이터도 제외합니다.
- 저장소·오버레이·생체인증 등 현재 사용하지 않는 권한을 제거합니다. 필요한 권한은 INTERNET, ACCESS_NETWORK_STATE와 앱 내부 수신기의 서명 권한입니다.
- 시스템 인증기관만 신뢰하고 평문 통신을 차단합니다. debug에서만 `localhost`, `127.0.0.1`, Android 에뮬레이터의 `10.0.2.2`에 HTTP를 허용합니다. LAN IP의 HTTP는 허용하지 않습니다.
- Android 앱 전체에 `FLAG_SECURE`를 적용합니다. 계정·금융정보 보호를 위해 공고를 포함한 앱 화면의 캡처·녹화·최근 앱 미리보기도 제한됩니다. 루팅 기기나 외부 카메라에 대한 보호는 보장하지 않습니다.
- Android 네이티브 HTTP 클라이언트의 자동 리다이렉트를 끕니다. 서버 API는 정확한 주소에서 직접 응답해야 합니다. 웹 fetch도 `redirect: error`입니다. iOS 네이티브 리다이렉트 차단 동작은 아직 별도 검증이 필요합니다.
- 로컬 release의 기본 debug 서명을 제거합니다. 운영 HTTPS API가 없으면 Gradle release 번들/패키징이 실패합니다. EAS preview/production 및 `BOKJI_RELEASE=1`도 URL을 검사합니다.
- Gson 2.10.1, Commons IO 2.17.0 이상을 요구해 발견된 네이티브 취약 버전을 배제합니다. 상위 패키지가 더 최신 버전을 요구하면 강제로 내리지 않습니다.

로그인 만료 시 실행 중에도 로컬 세션을 닫습니다. 백그라운드에서 돌아오면 서버에 로그인 상태를 재확인하며 기존 금융 입력 화면을 초기화합니다. 금융정보는 필요할 때 다시 불러오세요.

완성된 APK 자체의 검증 명령입니다. `APPROVED_CERT_SHA256`은 비밀키가 아닌, 팀이 승인한 배포 인증서의 공개 SHA-256 지문입니다. 인증서 이름만 검사하지 않고 지문이 일치해야 통과합니다.

```powershell
# 저장소 루트, JAVA_HOME / ANDROID_HOME 설정 후
backend/.venv/Scripts/python.exe frontend/mobile/scripts/audit-apk.py PATH_TO_APK --signer-sha256 APPROVED_CERT_SHA256 --report tmp/apk-security.json
# 필요할 때만 --secrets-env backend/.env 추가: 일치 여부만 기록, 비밀값은 출력하지 않음

# frontend/mobile/android: 실제 선택된 릴리스 Maven 버전 추출
./gradlew.bat :app:dependencies --configuration releaseRuntimeClasspath --console=plain > ../../../tmp/android-runtime-dependencies.txt
# 저장소 루트: 공개 패키지 이름/버전만 OSV에 전송
backend/.venv/Scripts/python.exe frontend/mobile/scripts/audit-android-deps.py tmp/android-runtime-dependencies.txt tmp/android-dependency-audit.json
```

APK 검사는 디버그 여부, 서명, 노출 컴포넌트, 권한, XML 정책과 Manifest 연결, 모든 백업 영역, 번들 포함, 키 파일·알려진 로컬 비밀값 유출을 점검하고 미충족 시 실패합니다. npm audit와 Maven/OSV 조회는 별도로 다시 실행해야 합니다. 이 검사는 침투 테스트나 보안 인증을 대신하지 않습니다. 실제 운영 서버의 TLS·인증·접근제어, ARM64 실기기, 최종 서명 APK, 번들/로그의 개인정보, iOS 보안은 출시 전 검증해야 합니다.

2026-10-01 실제 검증 결과:

| 항목                         | 결과                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| 모바일 계약·보안 회귀 테스트 | 21개 통과, 타입·린트 통과                                                             |
| 공고 UI 회귀                 | 고정 쉬운 화면, 페이지 초기화, 필터, 상세, 빈 목록, 503 재시도, 404 통과·JS 오류 없음 |
| 서버 인증·금융정보 검증      | 121개 통과: 토큰 해시·만료·폐기, 계정 격리, 동의, 오류 입력 비노출                    |
| npm audit                    | 기존 moderate 13건 → 알려진 취약점 0건                                                |
| 릴리스 Maven 의존성 OSV 조회 | 187개 조회, 기존 취약 패키지 2개 → 알려진 취약점 0개                                  |
| Android APK                  | x86_64 debug 빌드·설치 성공, 백업·이전 차단 및 최소 권한 확인                         |
| Android 창 보호              | MainActivity의 SECURE 플래그와 adb 캡처 이미지 미생성 확인                            |
| Android 로그인 리다이렉트    | 가짜 로그인으로 HTTP 307 원본 POST 1회, 목적지 요청 0회                               |
| 릴리스 HTTPS 가드            | HTTP API 주소로 release 번들 작업 시 실제 빌드 실패 확인                              |
| Android·iOS JS/Hermes        | 두 플랫폼 번들 생성 성공, iOS OS 실행 검증은 아님                                     |
| 최종 APK 배포 판정           | BLOCKED: debug 서명·개발 런처·로컬 HTTP 예외·독립 번들 없음·승인 서명 미설정          |

최종 APK SHA-256: `bb6f41d9182e7a6d63942d0b09c55928539ffbea80dc59bf512b6e2863162308`. 세부 증거는 저장소 루트의 `tmp/apk-security-after.json`, `tmp/android-dependency-audit-after.json`, `tmp/mobile-audit-after.json`, `tmp/android-redirect-proof.json`에 있습니다. APK 비밀값 대조는 로컬 설정의 유효 비밀값 1개와 private-key 표식/파일명 범위에서 미검출이며, 모든 유형의 비밀정보 부재를 보장하지 않습니다. 릴리스 Manifest 단독 병합은 RN 번들 작업 의존성 때문에 완료되지 않았고, 운영 주소와 서명으로 만든 최종 산출물은 아직 검사하지 못했습니다.

근거: [Expo 설정](https://docs.expo.dev/versions/v57.0.0/config/app/), [URL 디코더 패치](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [uuid 패치](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [Gson 변경 기록](https://github.com/google/gson/blob/main/CHANGELOG.md), [Apache Commons IO 보안 공지](https://commons.apache.org/proper/commons-io/security.html), [OSV 조회 API](https://google.github.io/osv.dev/post-v1-querybatch/).

### 새 홈과 계산기

0.2.0의 홈은 검색·6개 분야 바로가기·중위소득 확인·실제 인기 공고로 구성됩니다. 기존 `HomeBanner.tsx`와 이미지 자산은 보관하지만 홈에는 사용하지 않습니다.

계산기는 빠른 확인과 상세 계산을 같은 화면에서 전환합니다. 웹의 `medianIncome`, `financePrefill`, `countChoices`를 공통 core로 공유합니다. 7명 이상은 정확한 인원을 추가 선택하며 12명 이상은 직접 입력합니다. 상세 계산은 가구·소득·재산·차량·부채의 5단계와 입력 확인으로 나뉩니다. 선택값·만원 단위·0과 모름의 구분, 저장 전 동의는 유지합니다.

### 일반 화면과 쉬운 화면 디자인

2026-10-07: [토스의 글자 계층](https://tossmini-docs.toss.im/tds-react-native/foundation/typography/)과 [목록 구성](https://tossmini-docs.toss.im/tds-react-native/components/list-row/)을 참고해 파란 강조색·밝은 배경·명확한 정보 구분을 적용했습니다. 토스의 전용 폰트·브랜드 자산은 사용하지 않습니다.

- 일반 화면: 중립 회색 배경, 흰색 카드, 단계별 글자 크기, 일관된 Lucide 선 아이콘, 중요도에 따른 버튼 색상. 홈 서비스를 한 영역으로 묶고 검색 입력을 카드로 정리합니다.
- 쉬운 화면: 본문 20sp, 주 버튼 최소 60dp, 입력칸 최소 62dp, 8~10dp 모서리와 선명한 테두리. 메뉴를 글자로 설명하고 선택 항목에는 체크를 표시합니다. OS 글자 크기 조정을 유지합니다.
- 공고는 분야·지역·제목·지원 내용·대상·기간·기관 순으로 구분하며 실제 데이터만 표시합니다. 상세는 지원 내용·대상·기간·공식 공고를 중심으로 재배치합니다. 탭 높이는 화면 모드·안전 영역·OS 글자 배율을 반영합니다.
- `react-native-svg`가 추가되어 기존 개발 앱도 네이티브 재빌드가 필요합니다. 설치된 독립 APK에는 새 APK 빌드·설치 전까지 반영되지 않습니다.

### 챗봇과 전체 메뉴

하단의 ‘상담’ 탭과 오른쪽 위 전체 메뉴를 제공합니다. 쉬운 화면의 메뉴 버튼에는 ‘메뉴’ 글자를 표시합니다. 챗봇을 끌 때 확인과 재진입 위치를 안내하며 상담 탭에서 다시 켤 수 있습니다. 공고 상세에서도 해당 공고에 바로 질문할 수 있습니다. 웹과 동일한 FAQ·직접 질문 API에 모바일 Bearer로 연결합니다. [동작·보안·검증 범위](src/features/assistant/README.md)를 확인하세요.

### 서버 연결 안내

앱 시작·복귀와 사용 중 30초마다 공개 `/health`를 확인합니다. 연결 실패·5초 건강 상태 응답 지연·서버 5xx 응답 시 각 화면 상단에 안내와 **다시 연결** 버튼을 표시합니다. 서버 중단과 인터넷 끊김을 단정하지 않고 함께 안내하며 연결 복구 시 자동으로 숨깁니다. 쉬운 화면에서도 안내를 접지 않습니다. 백그라운드에서는 상태 확인을 중단하고 로그인·저장 요청을 자동 재전송하지 않습니다.

`src/services/serverConnection.js`는 모든 API 호출의 연결 상태를 관찰하고 중복 상태 확인과 오래된 응답을 처리합니다. 로그인 실패(401)·입력 오류(422)는 서버 중단으로 표시하지 않습니다. `npm test`는 연결 거부·지연·503·복구·취소·동시 응답을 검사합니다. Expo 웹 미리보기를 8081번 포트에서 실행한 뒤 `node tests/server-connection-preview.mjs`로 화면 회귀를 검증할 수 있습니다. 이 검사는 API 대역만 사용하며 운영 서버를 끄지 않습니다.
