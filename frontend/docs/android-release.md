# Android 릴리스 빌드와 서명

담당: 모바일/배포. 2026-10-06 추가. 배포 주소는 `https://bokji.commitnaru.com/api`이며 앱 식별자는 `com.bokjicompass.app`입니다. 이 식별자를 기존 출시 앱에서 변경하면 다른 앱으로 취급됩니다.

## Windows 로컬 APK

Node.js 22.13 이상, Android Studio의 SDK/Build Tools/NDK, JDK와 저장소의 backend Python 환경을 준비합니다. 저장소 전체를 받아 로컬 `frontend/packages`도 유지합니다. `frontend/mobile`에서 실행합니다.

```powershell
npm ci
npm run release:check
# 서명키 없이 네이티브 빌드만 검증. 결과는 설치·배포 불가.
npm run release:android -- -Unsigned
```

첫 출시이고 기존 키가 없으면 `npm run release:key`로 로컬 배포 키를 만들 수 있습니다. 이 명령은 기존 키·자격 증명을 덮어쓰지 않습니다. 무작위 비밀번호는 현재 Windows 사용자의 DPAPI로 보호해 저장하고 `npm run release:android`가 자동으로 불러옵니다. 이미 검증 빌드한 unsigned 파일만 서명하려면 `npm run release:android -- -SignOnly`를 사용합니다.

`credentials/bokji-compass-release.p12`와 `credentials/android-release.json`은 Git 제외 파일이며 함께 보관합니다. DPAPI 비밀번호는 현재 Windows 계정에서만 복호화할 수 있으므로 다른 PC·Windows 재설치로 옮기기 전에는 현재 계정에서 별도 안전한 비밀번호 백업이 필요합니다. 배포 키를 잃으면 같은 설치 앱의 후속 업데이트에 사용할 수 없습니다.

`scripts/android-release.ps1`은 릴리스 설정 → 타입 → 린트 → 앱 회귀 → Expo Prebuild → Gradle assembleRelease를 순서대로 실행하며 오류 시 즉시 종료합니다. Prebuild가 생성된 `android/`를 갱신하므로 네이티브 변경은 `app.config.ts`와 config plugin으로 관리합니다. 실제 ARM 기기와 x86_64 에뮬레이터를 위한 JS 포함 APK를 만들며 Metro를 필요로 하지 않습니다. unsigned 산출물은 저장소의 `output/android-release/bokji-compass-unsigned.apk`에 복사합니다.

`-ApiBaseUrl https://다른운영서버/api`로 공개 주소를 덮어쓸 수 있습니다. 기본은 현재 셸 환경변수 또는 Expo의 production `.env` 우선순위입니다. 앱 번들 생성과 Gradle 검증에 같은 API 주소를 전달하고 명령 종료 후 원래 셸의 API/릴리스 변수를 복원합니다.

Windows의 Ninja 260자 경로 오류를 피하도록 config plugin이 C++ staging을 저장소의 `tmp/cxx`로 옮기고 `CMAKE_OBJECT_PATH_MAX=240`을 적용합니다. Windows 레지스트리나 시스템 경로 설정을 바꾸지 않습니다. 기존 생성 프로젝트의 plugin 블록도 Prebuild마다 갱신하므로 보완 후 전체 native 폴더를 삭제할 필요가 없습니다.

서명 APK는 **기존 배포 keystore를 사용**하고 아래 변수를 로컬 프로세스 환경에 준비한 뒤 `npm run release:android`를 실행합니다. 비밀번호를 소스·명령 인수·채팅에 넣지 않습니다. 첫 출시의 새 키 생성과 보관은 별도로 결정하며 기존 앱 업데이트 시 키를 바꾸면 안 됩니다.

| 환경변수 | 내용 |
| --- | --- |
| `BOKJI_ANDROID_KEYSTORE` | 배포 keystore의 로컬 절대 경로 |
| `BOKJI_ANDROID_KEY_ALIAS` | 해당 keystore의 키 별칭 |
| `BOKJI_ANDROID_STORE_PASSWORD` | keystore 비밀번호 |
| `BOKJI_ANDROID_KEY_PASSWORD` | 키 비밀번호 |
| `BOKJI_ANDROID_CERT_SHA256` | 팀에서 사용할 배포 인증서의 공개 SHA-256 지문 |

서명 모드에서는 빌드 전에 필수 변수를 확인하고 zipalign → apksigner → APK 정적 검사를 실행합니다. apksigner에 비밀번호의 **환경변수 이름**만 전달합니다. 배포 인증서 지문·비디버그 서명·JS 번들·권한·백업/HTTPS 정책을 검증한 파일만 `output/android-release/<APK SHA-256>.apk`와 공유용 `bokji-compass.apk`로 복사하며 결과는 `apk-audit.json`에 기록합니다. 실패한 후보는 `bokji-compass-candidate.apk`로 남습니다. 해시 파일은 정적 검사 완료를 의미하며 실기기 동작까지 보장하지 않습니다. 빌드 스크립트는 APK를 사이트나 스토어에 자동 게시하지 않습니다.

## EAS 클라우드 빌드

Expo 계정과 팀 프로젝트를 연결한 뒤 `EXPO_PUBLIC_EAS_PROJECT_ID`에 실제 프로젝트 UUID를 설정합니다. 로컬 `.env`는 업로드하지 않으므로 EAS preview/production 환경에도 같은 공개 변수를 설정합니다. Firebase 푸시를 사용할 경우 `BOKJI_GOOGLE_SERVICES_FILE`은 EAS의 파일 환경변수로 준비합니다. 서비스 계정 개인키를 앱에 넣지 않습니다.

```powershell
npm run release:check
# 직접 설치·전시 배포용 APK
npx eas-cli@latest build --platform android --profile preview
# Google Play 업로드용 AAB
npx eas-cli@latest build --platform android --profile production
```

preview는 내부 배포 APK, production은 버전 코드 자동 증가 AAB를 명시합니다. 두 프로필 모두 릴리스 HTTPS 검사를 적용합니다. EAS post-install 훅에서 node-forge 패치, Expo 설정과 실제 projectId, 최신 공유 core를 재검사합니다. 클라우드 서명은 EAS 자격 증명 관리로 준비합니다. `credentials.json`과 keystore는 Git에서 제외합니다.

근거: [Expo APK 프로필](https://docs.expo.dev/build-reference/apk/), [EAS 빌드 훅](https://docs.expo.dev/build-reference/npm-hooks/), [Android apksigner와 환경변수 비밀번호](https://developer.android.com/tools/apksigner).

## 구현과 검사 진입점

| 파일/진입점 | 입력·반환·역할 |
| --- | --- |
| `scripts/check-release.mjs` | 기본 CLI는 production 환경을 로드하고 실제 Expo 설정·공유 core를 검사. 성공 0, 실패 1 |
| `checkSharedCore(root)` | 모바일 루트 경로 → 설치된 `@bokji/core`와 원본 바이트 대조, 누락·불일치 시 예외 |
| `checkProjectId(config, {required})` | Expo 설정 → EAS UUID 검사, 로컬 빌드는 푸시 미설정 허용 |
| `check-release.mjs --eas` | EAS 프로젝트 UUID 필수. preview/production은 릴리스, development는 개발 설정 검사 |
| `check-release.mjs --print-api` | production dotenv로 해석한 공개 API 주소만 stdout에 반환; PowerShell→Gradle 전달용 |
| `scripts/audit-apk.py` | APK·배포 인증서 지문 → JSON 보고서, PASS 0 / 조건 불충족 1 / 검사 미완료 2 |

권한 검사기는 현재 expo-notifications/FCM이 사용하는 정확한 알림·부팅·WakeLock·수신 권한을 허용하며 저장소·오버레이·생체인증·임의의 다른 앱 수신기 권한은 계속 차단합니다.
SDK가 간접 추가한 설치 유입·제조사 배지 권한 17개는 앱에서 사용하지 않으므로 Expo의 blockedPermissions로 제거합니다. FCM 수신기는 정확한 클래스와 공급자의 SEND 권한이 모두 일치할 때만 공개 컴포넌트 검사에서 허용합니다.

```powershell
npm run typecheck
npm run lint
npm test
# 저장소 루트
backend/.venv/Scripts/python.exe -m unittest discover -s frontend/mobile/scripts/tests -v
```

실제 푸시 전송 worker는 기존 미구현 범위입니다. 로컬 APK 빌드에는 EAS/Firebase 설정이 없어도 되며 앱에서 기기 등록 준비 안내를 제공합니다. 출시 시 서명된 APK를 실제 ARM64 휴대폰에 설치해 실행·로그인·공고·계산·저장·로그아웃과 재실행을 확인합니다. 최신 의존성 조회 결과와 이번 실제 빌드 결과는 작업 기록에 별도로 기재합니다.

2026-10-06 npm audit 재조회는 high 19개이며 두 근본 원인은 node-forge와 braces입니다. node-forge는 기존 설치 시 패치·해시 검사로 보완하고 있습니다. [braces 공식 공지](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)는 아직 수정 버전이 없습니다. Expo 44로 내리는 audit의 자동 제안은 SDK 57과 호환되지 않아 적용하지 않았습니다. 취약점 0개로 기록하지 않으며 개발 도구를 공개 서버로 사용하지 않습니다.

이번 실제 검증: 모바일 80개·타입·린트, APK 검사 회귀 6개, 3개 ABI의 native release Gradle 빌드 성공. 새 배포 키의 서명 APK는 21개 정적 검사 PASS. 최적화된 XML 경로는 APK 리소스 테이블에서 해석해 검사한다. 실제 휴대폰 설치/실행과 원격 푸시는 미검증이며 스토어 업로드나 웹 다운로드 게시도 수행하지 않았다.

## 서버 중단 시 앱 안내

2026-10-06 후속 APK에는 공통 서버 연결 안내를 포함했다. 앱 시작·복귀·활성 상태의 30초 주기로 인증 없이 `/health`를 확인하고 일반 API의 네트워크 실패·시간 초과·5xx도 관찰한다. 연결 중단 시 모든 화면과 쉬운 화면에 원인 가능성·사용 제한·다시 연결 버튼을 표시하며 복구 시 숨긴다. 건강 상태 확인은 5초 제한이고 중복 요청을 합치며 백그라운드에서는 확인을 취소한다. 로그인·저장을 자동 반복하지 않는다. 서버 자체 중단과 기기 인터넷 끊김은 구분할 수 없어 두 가능성을 안내한다.

후속 검증: 모바일 87개·타입·린트 통과. API 대역으로 320/390px의 시작 시 장애, 탭 이동, 쉬운 화면, 수동 복구, 후속 503와 자동 건강 상태 확인을 검사했다. 기존 네이티브 설정으로 JS 변경을 재빌드하고 동일한 배포 키로 서명하여 APK 정적 검사 21개 PASS. 현재 공유 파일은 `output/android-release/bokji-compass.apk`, SHA-256은 `4a90e98b8cb39e482b68ecd506e4b21b9234d2ee0bbb43d9ec63bac665b9ded7`이다. 실제 휴대폰의 네트워크 끊김·설치 실행은 기기 미연결로 미검증이다.
