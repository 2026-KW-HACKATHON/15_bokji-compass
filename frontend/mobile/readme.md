# 복지나침반 모바일

담당: 프론트엔드/모바일. Android·iOS 공통 React Native + Expo SDK 57 앱입니다. 기존 웹과 별도로 실행하며 금융 입력 규칙만 `../packages/core`에서 공유합니다. 첫 이식 범위는 홈·로그인·소득/재산 계산·동의 저장·조회·삭제입니다. 공고/추천·가입 화면·푸시·저장 공고 동기화는 후속 작업입니다.

## 실행

Node.js 22.13 이상. 이 폴더에서 실행합니다. 저장소 전체를 내려받아 `../packages/core` 경로를 유지해야 합니다.

```powershell
npm ci
Copy-Item .env.example .env
# .env의 EXPO_PUBLIC_API_BASE_URL을 접근 가능한 서버 주소로 편집
npm start
```

`EXPO_PUBLIC_API_BASE_URL`은 앱에 포함되는 공개 주소입니다. 키·비밀번호를 넣지 마세요. 직접 백엔드 주소는 `https://호스트`, `/api`를 제거해 전달하는 프록시는 `https://호스트/api`입니다. 앱은 Vite proxy를 사용하지 않습니다. 휴대폰의 localhost는 휴대폰 자체입니다. Android 에뮬레이터의 PC 주소는 보통 `10.0.2.2`이며 실제 기기는 접근 가능한 HTTPS 개발 서버를 사용합니다. 개발 JS에서만 HTTP 설정을 허용하지만 네이티브 OS가 HTTP를 차단할 수 있으므로 HTTPS를 권장합니다. 서버 CORS는 브라우저 미리보기에서만 필요하며 Origin을 명시적으로 등록합니다.

API 주소가 없으면 설정 안내를 표시하고 네트워크 작업을 막습니다. 서버 상태 확인은 프로세스 응답만 의미하며 DB/SMS/정책 API 준비를 보장하지 않습니다.

- `npm run android`: Expo Prebuild 후 Android APK를 로컬 빌드·설치·실행. Android SDK/JDK와 기기는 별도 필요.
- `npm run android:local -- -ApiBaseUrl http://127.0.0.1:8766`: Windows에서 SDK와 Android Studio JDK를 찾아 실행하는 보조 명령. 켜진 기기가 정확히 하나 필요하며, 여러 기기는 `-Device emulator-5554`처럼 지정합니다. localhost API와 Metro 포트는 adb reverse로 연결합니다.
- `npm run ios`: macOS에서 iOS 로컬 빌드·설치·실행. Windows에서는 iOS 클라우드 개발 빌드와 iPhone을 사용.
- `npm run web`: 화면 점검용 브라우저. 토큰은 메모리에만 보관하므로 새로고침하면 로그아웃됩니다.
- 첫 네이티브 개발 빌드: Expo 계정을 연결한 뒤 `npx eas-cli@latest build --profile development --platform android` 또는 `--platform ios`. 클라우드 업로드·계정 연결·서명은 아직 수행하지 않았습니다.

실기기에 개발 빌드를 설치한 뒤 Metro QR로 연결합니다. Expo Go는 SDK 호환 여부에 따라 간단한 확인에 사용할 수 있지만 보안 저장소·프로세스 종료/복원 검증은 개발 빌드에서 진행합니다.

## Android Studio로 확인하기

1. Android Studio의 Device Manager에서 가상 기기를 켭니다. 이 PC에는 `Pixel_2_API_34`가 있습니다.
2. 저장소 루트에서 `backend/.venv/Scripts/python.exe frontend/mobile/tests/serve-api.py`로 격리 테스트 API를 켭니다. 이미 8766 포트에서 실행 중이면 다시 켜지 않습니다.
3. 이 폴더의 터미널에서 `npm run android:local -- -ApiBaseUrl http://127.0.0.1:8766`을 실행합니다. 최초 빌드에는 Gradle·SDK Platform 36·Build Tools 36.0.0·NDK 등 다운로드 시간이 필요합니다.
4. 에뮬레이터의 복지나침반에서 `mobile_preview` / `PreviewOnly42!`로 로그인합니다. 계산/저장/불러오기를 확인하고 앱을 종료했다 다시 열어 로그인 복원 여부를 확인합니다.

Android Studio에서 네이티브 프로젝트를 열려면 생성된 `frontend/mobile/android`를 선택합니다. 이 디렉터리는 Expo 설정으로 다시 생성할 수 있는 Git 제외 파일입니다. 직접 수정하지 않고 `app.config.ts`/config plugin으로 변경합니다. SDK 설치용 API 버전과 에뮬레이터의 Android 버전은 같을 필요가 없습니다.

`scripts/android-local.ps1`은 `Device`(선택), `ApiBaseUrl`(선택), `Port`(기본 8081)를 입력받습니다. 기기 확인→포트 연결→Expo 로컬 빌드를 실행하고 성공/실패 exit code를 반환합니다. 프로세스 내 환경변수만 설정하고 전역 SDK/JDK 설정이나 가상 기기 데이터는 초기화하지 않습니다. 실행할 API 주소를 지정하지 않으면 기존 환경변수/`.env`를 사용합니다.

## 파일과 공개 진입점

| 위치 | 역할·입력·반환 |
|---|---|
| `src/app/_layout.tsx` | 공통 상태와 홈·소득/재산·내 계정 탭 조립 |
| `src/services/client.js` | `resolveApiUrl(value,development)` → 검증된 절대 주소. `createClient({baseUrl,fetchImpl?,timeoutMs?})` → HTTP 요청 함수. 외부 HTTP 호출, 15초 제한, 취소·상태 오류 |
| `src/services/api.js` | `createApi(request)` → health/login/me/logout/calculate/getProfile/saveProfile/deleteProfile. 금융 입력·응답은 공통 모델로 검증 |
| `src/services/session.js` | `createSession({api,storage,baseUrl,now?})` → subscribe/getSnapshot/restore/login/logout/invalidate. 저장소·서버 호출을 주입하고 세션 상태 관리 |
| `src/platform/sessionStorage.ts` | read/write/clear: 기기 SecureStore의 토큰·서버 주소·만료·로그아웃 대기 상태만 저장. 웹 어댑터는 메모리 전용 |
| `src/features/finance/FinanceScreen.tsx` | 공통 질문을 네이티브 입력으로 표시. 원자료 전송·계산·명시적 저장·불러오기·삭제 |
| `src/features/finance/draft.js` | `updateDraft(draft,path,value)` → 원본을 바꾸지 않은 입력 초안. 가구/차량 목록 정합성 유지. I/O 없음 |
| `app.config.ts`, `eas.json` | Expo 설정과 개발/내부 테스트/운영 빌드 프로필 |

## 인증과 개인정보

- 기존 웹 가입 계정으로 `/v1/mobile/auth/login` 호출. 응답은 `{access_token,token_type,expires_in,user}`입니다. 앱은 Bearer 헤더를 쓰고 웹은 기존 HttpOnly 쿠키를 유지합니다.
- 모바일 토큰은 서버에서 별도 해시 영역으로 저장해 웹 쿠키와 상호 사용할 수 없습니다. 7일 만료, 자동 갱신 없음, 만료 시 재로그인. 로그아웃은 서버 세션 폐기 후 로컬 토큰 제거.
- 로그아웃 실패는 성공으로 표시하지 않습니다. 보안 저장소에 로그아웃 대기를 기록하고, 다음 시작에서 세션 복원 대신 폐기를 재시도합니다. 저장소 자체가 잠겼으면 다시 시도 안내를 표시합니다.
- 복원 중 네트워크 오류는 금융정보를 노출하지 않고 재시도를 제공합니다. 오래된 요청의 401은 다른 토큰의 세션을 지우지 않습니다.
- 금융 원자료·계산 결과·비밀번호·사용자 객체는 영구 기기 저장소에 쓰지 않습니다. 금융 저장은 별도 동의와 버튼이 필요합니다. 서버 조회도 버튼을 누를 때만 실행합니다.
- 로그인/로그아웃/계정 상태 전환 시 계산기 메모리와 요청을 초기화합니다. 현재 첫 버전은 비회원 입력도 로그인 시 초기화되므로 먼저 로그인한 뒤 입력/저장을 진행하세요.
- 가구원 축소·차량 입력 제거, 계정 정보 삭제는 확인 후 실행합니다. 화면 입력 삭제와 서버 저장 삭제를 구분합니다. 빈칸은 미확인, 0은 실제 0원입니다.
- 쉬운 화면은 실행 중 설정이며 시스템 글꼴 확대도 허용합니다. 현재 기기 간 설정/공고 동기화는 없습니다.

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

이 브라우저 검사는 `frontend/web`에 설치된 Playwright와 Microsoft Edge를 사용합니다. 테스트 계정은 `mobile_preview` / `PreviewOnly42!`이며 격리 테스트 서버에만 존재합니다. 산출물은 저장소 `tmp/mobile-preview/`에 저장합니다. 네이티브 SecureStore·TalkBack·VoiceOver·실제 기기의 종료/재실행은 별도 점검이 필요합니다.

## 배포 전 남은 설정

`com.bokjicompass.app`은 임시 앱 식별자입니다. 스토어 등록 전에 팀 소유 식별자·Expo projectId·Apple/Google 서명·운영 API 주소를 확정해야 합니다. preview/production 프로필은 HTTPS API 주소가 없으면 중단합니다. 현재 스토어 업로드나 EAS 프로젝트 생성은 수행하지 않았습니다.

초기 의존성 검사에서 moderate 13건(주요 원인: Expo 빌드 도구의 xcode→uuid, Router의 query-string→decode-uri-component)이 보고됐습니다. 호환성을 깨는 SDK 강제 다운그레이드는 적용하지 않았습니다. 출시 전 상위 패키지의 수정 릴리스를 확인하고 재검사해야 합니다. 상세 단계·검증 결과는 [이식 기록](../docs/mobile-migration.md)을 참고하세요.
