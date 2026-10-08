# 모바일 변경사항과 보안 재검토

검토일: 2026-10-01. 대상: `frontend/mobile`, `frontend/packages/decode-uri-component-compat` 및 모바일 문서. 이 기록은 소스 공유 전 점검 결과이며, 침투 테스트나 스토어 배포 인증을 대신하지 않습니다.

## 2026-10-08 braces 추가 보완

- 잠금 파일 기준 npm audit에서 high 19개를 확인했습니다. 실제 원인은 node-forge와
  braces 두 가지이며, 상위 Expo·Metro·React Native 패키지 경고까지 집계한 수입니다.
  node-forge는 아래 기존 프로젝트 패치를 유지하고 검증했습니다.
- `braces@3.0.3`의 [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)는
  길이 제한 이하의 깊은 괄호 패턴이 재귀 AST 처리의 스택을 고갈시킬 수 있는 문제입니다.
  공식 수정 버전이 없으므로 `scripts/apply-braces-security-patch.mjs`에 로컬 보완을 추가했습니다.
  파서의 스택과 compile·expand·stringify의 AST 탐색 깊이를 128 이하로 제한합니다.
  지나친 중첩은 작은 입력 처리 단계에서 명시적 RangeError로 거부하며, 호출자가 오류를
  처리해야 합니다. 임의 패턴의 모든 CPU·메모리 사용을 제한하는 수정은 아닙니다.
- 원본 3.0.3의 4개 소스와 수정본의 SHA-256을 고정했습니다. 잠금 파일의 모든 중첩 설치본을
  검사하고 버전·경로·소스가 다르면 쓰기 전에 실패합니다. 일반 범위·선택·유니코드와 Metro의
  micromatch 패턴, 8,001자 중첩 입력, 직접 전달한 AST, 반복·새 설치·중첩 설치를 검사합니다.
- `scripts/apply-security-patches.mjs`가 Forge와 braces를 함께 처리합니다. npm postinstall에서
  자동 적용하고 개발·테스트·린트·export·릴리스·EAS 설치 후 명령은 수정본을 검증합니다.
  `npm run security:patch`로 현재 설치본을 준비하고 `npm run security:check`로 확인합니다.
- 버전은 braces 3.0.3과 node-forge 1.4.0으로 유지하므로 버전 기반 audit의 high 19개는 남습니다.
  경고를 숨기거나 공식 수정 버전으로 바꾼 것이 아닙니다. 공식 수정 릴리스가 나오면 이 로컬
  수정과 해시 고정을 검토하고 제거해야 합니다. Expo SDK 57·React Native 버전은 유지합니다.
- 웹·공통 API의 조회 격리·CSP·DOM 설정 검사는 [웹 보안 안내](../../backend/docs/web-security.md)에
  기록했습니다. 새로운 앱 APK나 운영 OTA를 발행하지 않았습니다.
- 최종 검증: 잠금 파일 기준 `npm ci`의 postinstall에서 두 패치 자동 적용을 확인했습니다.
  기존 설치에서 누락됐던 expo-crypto·expo-web-browser도 복구했습니다. 모바일 전체 테스트
  146개, 타입·린트, Android/iOS Metro·Hermes export가 통과했습니다. 새 braces 보안 검사는
  이 중 13개입니다. export는 `.cache/security-native-export`의 격리 산출물이며 서명 APK나
  실기기 설치 검증을 뜻하지 않습니다.

## 2026-10-06 node-forge 보완

- 아래 10월 2일에 남아 있던 node-forge 서명 검증 문제에 프로젝트 패치를 적용했다.
  재설치 자동 적용, 버전·코드 해시 검사, 실제 Forge/Expo 정상·비정상 서명 회귀를 추가했다.
  [구체적인 변경과 검증, 적용 범위, 남은 의존성 경고](node-forge-security-fix.md).
- 모바일 전체 77개, 새 설치 환경의 보안 회귀 45개, 타입·린트, Android/iOS export 통과.
- 공식 릴리스 버전은 1.4.0으로 유지되므로 버전 기반 audit 경고는 남는다. 재조회에서는 별도
  braces 공지도 확인되었고 두 원인이 high 19개로 집계되었다. 아래 과거 수치는 당시 기록이다.

## 2026-10-02 통합 후 의존성 재검토

- 웹 `npm audit --json`은 0건. 모바일은 `node-forge@1.4.0`의 [GHSA-86w9-cpqp-85rv / CVE-2026-85393](https://github.com/advisories/GHSA-86w9-cpqp-85rv) 한 원인이 상위 Expo 패키지까지 전파되어 high 4개로 보고됩니다. 아래 10월 1일의 0건 결과는 당시 조회 기록이며 현재 상태가 아닙니다.
- 공지에 따른 영향은 낮은 지수의 RSA 키에 대해 잘못 구성된 PKCS#1 v1.5 서명을 정상으로 받아들일 수 있는 검증 오류입니다. 10월 2일 조회 시 공식 수정 버전은 없고 npm 최신도 1.4.0입니다. `@expo/code-signing-certificates@0.0.7`도 node-forge ^1.4.0에 의존하므로 이 업데이트만으로 해결되지 않습니다. npm이 제안한 Expo 44로의 강제 변경은 SDK 57 앱과 호환되지 않아 적용하지 않았습니다.
- 설치 트리는 `expo@57.0.26 → @expo/cli@57.0.27 → node-forge@1.4.0`이며 `@expo/code-signing-certificates@0.0.6`도 같은 forge를 사용합니다. 설치된 CLI의 `build/src/utils/codesigning.js`가 `validateSelfSignedCertificate` 및 `signBufferRSASHA256AndVerify`를 호출하고, 인증서 라이브러리는 각각 `certificate.verify`와 `certificate.publicKey.verify`를 호출합니다.
- CLI 호출자는 `start/server/middleware/ExpoGoManifestHandlerMiddleware.js`의 개발 manifest 서명 경로입니다. 자체 인증서 검증에는 `updates.codeSigningCertificate` 및 private key 설정이 필요합니다. Expo 개발 인증서는 `expo-expect-signature`와 EAS 프로젝트 설정에 따라 사용됩니다. 앱 소스는 forge를 가져오지 않으며 현재 app.config.ts에는 자체 updates 코드서명 설정이 없습니다. iOS CLI의 별도 forge 사용은 인증서 PEM을 파싱하는 경로입니다.
- 현재 잠금 파일·설정으로 Android/iOS `expo export --clear` 성공. Node 로더 추적을 추가한 export의 3개 프로세스 모두 forge/인증서 라이브러리 로드 및 서명 검증 호출이 0회였습니다. 이는 이번 일반 번들 생성에서 해당 검증 경로가 실행되지 않았다는 근거이며 다른 CLI 명령까지 포함하지 않습니다. 검사 스크립트와 결과는 추적 제외된 `tmp/kakao-merge-validation/forge-trace.cjs`, `forge-export-*.json`에 보관합니다.
- 남은 제한: CLI 의존성 자체의 취약점은 제거되지 않았습니다. 신뢰되지 않은 인증서·개인키를 개발 도구에 주입하지 않고 개발 서버를 공개 운영 서버로 사용하지 않습니다. 공식 수정 버전이 나오면 SDK 호환 범위에서 갱신하고 재검사해야 합니다. 이 검토는 원격 EAS 빌드 서비스나 운영 OTA 서명 경로의 안전성을 인증하지 않습니다.

## 이번 변경사항

| 영역 | 동작 | 확인 방법 |
| --- | --- | --- |
| 홈 | 초록색 중심의 헤더와 서비스 바로가기 카드 | 일반/쉬운 모드 320·390·430px 화면 |
| 배너 | 복지 찾기·중위소득·계정 3장, 스와이프·이전/다음·기능 이동 | 브라우저 순환/스크롤/계정 이동, Android 실제 스와이프 |
| 쉬운 화면 | 상단 고정 스위치, 짧은 문장, 긴 설명 펼침, 주요 버튼 우선 배치 | 저장 동의·삭제 확인·계산 주의사항 유지 확인 |
| 계산기 | 하단 ‘계산기’, 화면 ‘중위소득 계산기’ | 기존 소득/재산 입력·계산·명시적 저장 흐름 유지 |
| 공고 | 웹과 같은 공개 목록·상세 API, 검색·필터·페이지·공식 링크 | LLM 없이 요청, 빈 목록/실패/재시도/404 구분 |
| 보안 | 기기 저장·통신·권한·APK 설정·취약 의존성 강화 | 아래 재검토 결과와 APK 배포 검사 |

배너는 앱 기능을 설명하는 장식 이미지입니다. 실제 공고, 추천 결과, 지급 보장을 나타내지 않습니다. 이미지 3장은 앱 내부에 번들되며 외부 이미지 서버나 추적 서비스를 추가하지 않았습니다. 생성 방식은 [이미지 기록](../mobile/assets/home/README.md)을 참조하세요. 읽는 중 내용이 바뀌지 않도록 자동 재생 없이 사용자가 넘깁니다.

## 데이터와 접근 범위

- 공고는 비회원 공개 API만 호출하며 회원 토큰을 전달하지 않습니다. 미공개 수집 원문의 검토 상태와 공개 범위를 변경하지 않았습니다. 실데이터가 없으면 빈 목록을 표시합니다.
- 공식 원문은 자격증명이 포함되지 않은 HTTP(S) 링크만 외부 브라우저로 엽니다. 이를 정부 도메인 인증이나 링크 목적지 전체의 안전 보장으로 해석하면 안 됩니다.
- 세션은 기기의 SecureStore에 토큰·API 주소·만료·로그아웃 대기 상태만 저장합니다. 브라우저 미리보기는 메모리만 사용합니다.
- 비밀번호·금융 원자료·계산 결과는 기기 영구 저장소에 쓰지 않습니다. 서버 저장은 별도 동의와 저장 버튼이 필요합니다. 세션 만료/계정 전환/로그아웃 시 금융 화면 상태를 초기화합니다.
- Android는 기본 평문 통신 차단, 시스템 CA 신뢰, 백업/기기 이전 차단, 최소 권한, FLAG_SECURE, 네이티브 리다이렉트 차단을 적용합니다. debug HTTP 예외는 localhost·127.0.0.1·10.0.2.2뿐입니다.

## 2026-10-01 재검토 결과

| 검사 | 결과 | 범위·한계 |
| --- | --- | --- |
| TypeScript / ESLint | 통과 | 모바일 전체 소스 |
| 모바일 단위·계약·보안 회귀 | 21개 통과 | 토큰 분리, 만료, 오프라인 복원, 로그아웃 실패, 동의, 응답 검증, 패치 호환성 |
| 서버 인증·금융 회귀 | 121개 통과 | 격리 DB, 기존 deprecation 경고 2건 |
| 홈·쉬운 화면·공고 브라우저 회귀 | 통과 | 320·390·430px, 배너 순환, 상세, 빈 목록, 오류·재시도, JS 오류 없음 |
| Android 배너 런타임 | 통과 | Android 14 에뮬레이터: 모드·다음 버튼·스와이프·계정 이동 |
| npm audit | 알려진 취약점 0건 | 개발 의존성 포함, 조회 시점 기준 |
| Maven OSV 재조회 | 187개, 알려진 취약점 0건 | 새 releaseRuntimeClasspath 출력 기준, 네이티브 바이너리 전체 분석은 아님 |
| Android·iOS Hermes export | 통과 | 최신 홈 이미지 포함, OS 실행/서명/배포 검증과 별개 |
| 기존 APK 백업·권한·XML 연결 | 통과 | 아래 SHA-256의 x86_64 debug 파일 |
| 기존 APK 비밀정보 검사 | 해당 검사 범위에서 미검출 | 개인키 표식·파일명과 제공한 로컬 비밀값 1개 대조, 완전한 탐지 보장 아님 |
| 커밋 대상·최신 Hermes 번들 비밀정보 검사 | 해당 검사 범위에서 미검출 | 커밋 대상 42개 파일·번들 2개, 선택한 키 패턴 및 로컬 비밀값 1개 대조 |
| 기존 APK 배포 검사 | **BLOCKED** | 디버그 서명·개발 런처·독립 JS 번들 없음·개발 HTTP 예외·승인 배포 서명 미설정 |

수정된 알려진 의존성은 decode-uri-component 0.5.0, xcode용 uuid 11.1.1, Gson 2.10.1 이상, Commons IO 2.17.0 이상입니다. 취약점 조회 결과 0건을 ‘보안 문제 없음’ 또는 MASVS 인증으로 표현하지 않습니다.

검사한 APK SHA-256: `bb6f41d9182e7a6d63942d0b09c55928539ffbea80dc59bf512b6e2863162308`. 이 파일은 이전 네이티브 보안 빌드와 동일하며 홈 변경은 Metro로 로드합니다. 최신 소스의 Hermes export를 별도로 확인했으며, 홈 변경이 포함된 독립 배포 APK를 새로 만들었다는 뜻은 아닙니다.

로컬 증거 파일(비공개 작업 산출물, Git 제외):

- `tmp/mobile-main-npm-audit.json`
- `tmp/mobile-main-maven-tree.txt`, `tmp/mobile-main-maven-audit.json`
- `tmp/mobile-main-apk-audit.json`
- `tmp/mobile-main-secret-scan.json` — 커밋 대상 범위·비밀값 대조 결과
- `tmp/mobile-main-export/` — Android/iOS Hermes 번들과 이미지
- `tmp/mobile-easy/` — 화면 크기별 브라우저 캡처

이전 Android 307 가짜 로그인 시험은 원본 POST 1회·리다이렉트 목적지 0회였으며, FLAG_SECURE와 캡처 차단도 확인했습니다. 이번에는 해당 네이티브 APK의 해시·정책을 재검사했으며 이 동적 시험을 재실행한 것으로 기록하지 않습니다.

## 재현 명령

저장소 루트에서 실행합니다. 브라우저 검사는 localhost:8081의 Metro 미리보기가 필요하고 Playwright/Edge는 기존 frontend/web 개발 환경을 사용합니다. 서버 회귀는 운영 DB를 사용하지 않습니다.

```powershell
Push-Location frontend/mobile
npm ci
npm run typecheck
npm run lint
npm test
npm audit
node tests/easy-layout-preview.mjs
node tests/policies-preview.mjs
npm run export:native
Pop-Location

Push-Location backend
.venv/Scripts/python.exe -m pytest tests/test_mobile_auth.py tests/test_auth.py tests/test_finance_api.py tests/test_finance_rules.py -q
Pop-Location
```

APK 검사 도구는 `JAVA_HOME`, `ANDROID_HOME` 설정이 필요합니다. 승인 서명 지문은 공개 인증서의 SHA-256이며 개인키가 아닙니다.

```powershell
backend/.venv/Scripts/python.exe frontend/mobile/scripts/audit-apk.py PATH_TO_APK --signer-sha256 APPROVED_CERT_SHA256 --report tmp/apk-security.json

Push-Location frontend/mobile/android
./gradlew.bat :app:dependencies --configuration releaseRuntimeClasspath --console=plain > ../../../tmp/android-runtime-dependencies.txt
Pop-Location
backend/.venv/Scripts/python.exe frontend/mobile/scripts/audit-android-deps.py tmp/android-runtime-dependencies.txt tmp/android-dependency-audit.json
```

APK 검사에서 종료 코드 1은 배포 조건 불충족, 2는 검사 미완료이며 둘 다 출시를 막습니다. OSV 검사도 네트워크/해석 오류를 정상 결과로 취급하지 않습니다.

## 배포 전 필수 조건

1. 팀 소유 앱 식별자·운영 HTTPS API·Android/iOS 서명을 확정합니다. 운영 API의 인증·접근 제어·TLS도 실제 환경에서 검사합니다.
2. 개발 런처 없는 독립 release APK/AAB를 만들고 승인 인증서 지문으로 완성 산출물을 다시 검사합니다. debug APK를 이름만 바꿔 배포하지 않습니다.
3. ARM64 실제 Android 기기에서 저장소·만료·오프라인 로그아웃·화면 보호·리다이렉트를 검사합니다.
4. iOS 기기에서 Keychain·백업·화면 보호·네이티브 리다이렉트 동작을 별도로 검증합니다. Android의 FLAG_SECURE 보호를 iOS에 적용했다고 간주하지 않습니다.
5. TalkBack/VoiceOver, 큰 시스템 글꼴, 개인정보/계정 삭제 안내 및 스토어 요구사항을 확인합니다.

검토 기준: [Android Network Security Configuration](https://developer.android.com/privacy-and-security/security-config), [Expo SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [OWASP MASVS](https://mas.owasp.org/MASVS/), [OSV 조회 API](https://google.github.io/osv.dev/post-v1-querybatch/).
