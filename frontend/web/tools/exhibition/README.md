# 전시 QR 관리 화면

2026-10-02. Android 설치와 웹 접속 QR을 만드는 **사이트 관리자 전용 화면**입니다. 최고 관리자와 QR 관리자가 이용할 수 있고 일반 회원은 접근할 수 없습니다. iPhone에는 웹 QR을 안내합니다. QR 서버 파일은 `dist`에 포함하지 않고 인증 게이트웨이에서 제공합니다.

## 실행

공유 사이트에서 관리자 계정으로 로그인한 뒤 상단 **전시 QR 관리**를 선택합니다. 주소는 `/admin/exhibition/`입니다. `backend/scripts/share.ps1 start`는 API·QR 게이트웨이·Caddy를 함께 실행합니다. 이미 공유 중이면 `reload`로 터널 프로세스와 주소를 유지한 채 적용할 수 있습니다. 최고 관리자는 상단 **관리자 관리**에서 하위 QR 관리자를 생성합니다. [계정 초기 설정·권한표](../../../../backend/app/modules/admin/readme.md).

개별 개발 시 `frontend/web`에서 `npm ci`, `npm run exhibition`을 실행합니다. 게이트웨이는 항상 `127.0.0.1:5181`에 바인딩하며, Vite/Caddy의 `/admin/exhibition/` 경로를 통해 같은 사이트 쿠키를 사용합니다. `EXHIBITION_AUTH_API_URL`은 신뢰한 loopback 인증 서버만 허용하며 기본값은 `http://127.0.0.1:8001`입니다. 공개 사이트 쿠키는 localhost에 전달되지 않으므로 5181을 직접 열어 로그인하려 하지 마세요.

- 기본 모드: 고정 주소 `https://bokji.commitnaru.com`을 사용합니다. 공유 서버를 다시 실행하거나 임시 터널 기록이 바뀌어도 QR 주소는 유지됩니다. 5초마다 관리자 권한과 APK 파일 등록 여부를 확인합니다.
- 직접 입력: 공개 HTTPS 도메인을 입력하고 ‘QR 주소 적용’. 별도 APK 주소도 지정할 수 있습니다. 입력값은 브라우저 메모리에만 유지하며 새로고침하면 자동 모드로 돌아갑니다.
- 다른 고정 주소로 실행: `EXHIBITION_PUBLIC_URL` 환경 변수로 기본 주소를 변경할 수 있습니다. 주소 등록/DNS/Tunnel 설정을 대신하지 않습니다.
- 포트 충돌 시 `EXHIBITION_PORT`로 다른 1024~65535 포트를 지정합니다. 바인딩 주소는 변경할 수 없으며 항상 `127.0.0.1`입니다.
- 두 QR은 서비스 소개 `/#guide`와 `/downloads/bokji-compass.apk`를 가리킵니다. 기본 웹 접속 주소는 `https://bokji.commitnaru.com/#guide`입니다. 화면에 적용된 URL로 1024px PNG 저장 및 안내판 인쇄/PDF 저장이 가능합니다.

기존 메인 페이지나 임시 주소로 저장·인쇄한 웹 QR은 서비스 소개로 연결되는 새 PNG로 교체합니다. 이미 출력한 QR 이미지의 주소는 자동으로 바뀌지 않습니다.

## APK 파일 연결

2026-10-06: 고정 HTTPS API 주소와 서버 연결 장애 안내를 포함한 서명 release APK를 등록했습니다. 공개 다운로드 주소는 `https://bokji.commitnaru.com/downloads/bokji-compass.apk`이며 독립 JS 번들을 포함합니다. QR 페이지에 **APK 다운로드** 버튼과 휴대폰 설치 순서를 추가했습니다. APK가 없거나 관리자 권한이 만료되면 버튼을 비활성화하고 다운로드 주소를 제거합니다.

2026-10-08 현재 등록된 앱은 **0.4.0 (versionCode 4)**, 84,695,836바이트(80.8 MiB), SHA-256 `2c56799fddf8fb00a5a6e84a5806c729e4513d06c5120f9b118a8cf7ca285bb7`입니다. 기존 배포 인증서 일치와 APK 정적 검사 21개 PASS, 공개 HTTPS 전체 다운로드 해시 일치와 APK MIME·attachment·no-store를 확인했습니다. `public/downloads`와 운영 `dist/downloads`에 동일한 파일을 등록했으며 기존 고정 QR을 그대로 사용합니다. 이번 작업에서 실제 Android 휴대폰 설치·실행은 검사하지 않았습니다. QR 관리 화면은 관리자 로그인, QR의 APK 다운로드 대상은 로그인 없이 이용할 수 있습니다.

후속 APK 갱신 절차:

1. 검증한 APK를 `frontend/web/public/downloads/bokji-compass.apk`로 복사합니다. 디렉터리가 없으면 생성합니다. APK는 `.gitignore`로 제외되어 Git에 올라가지 않습니다.
2. 일반 웹 빌드 `npm run build`를 실행하면 `dist/downloads/bokji-compass.apk`에 복사됩니다. 실행 중인 서버의 APK만 교체하려면 동일한 검증 파일을 `dist/downloads/bokji-compass.apk`에도 복사합니다. 이번에는 웹의 다른 변경을 재배포하지 않고 이 파일만 등록했습니다. 별도 파일 호스트를 쓰면 직접 다운로드되는 HTTPS `.apk` 주소를 관리 화면에 입력합니다.
3. Caddy/Nginx 예제의 다운로드 경로는 APK MIME·attachment·no-store를 적용하고 파일이 없으면 404로 응답합니다. 설정 변경 후 공유 서버는 `share.ps1 reload`, 다른 배포는 해당 운영 절차로 반영합니다.
4. 관람객의 네트워크에서 다운로드하고 서명·파일 해시·설치를 확인합니다. 로컬 파일 존재 표시는 배포/서명/외부 다운로드 검사 완료를 의미하지 않습니다.

파일이 없어도 QR 대상 주소는 미리 생성하되 화면과 인쇄물에 **APK 미등록** 표시를 유지합니다. APK를 실제로 빌드·서명·업로드하거나 임시 터널의 공개 범위를 자동 확장하는 도구는 아닙니다.

## 접근 제한과 역할

2026-10-08 HTTPS 전송 보완: 공개 HTTP QR 요청은 Caddy에서 HTTPS로 전환하고 쓰기는
거부합니다. QR 게이트웨이가 생성하는 별도의 관리자 권한 확인은 고정 루프백 주소에만
전송하며 `X-Forwarded-Proto: https`를 명시해 production API의 전송 요구와 호환됩니다.
방문자의 전달 헤더를 내부 인증 호출에 복사하지 않습니다. Uvicorn은 루프백 프록시만
신뢰해야 하며 모든 호출에서 기존 쿠키·관리자 권한을 다시 검사합니다.
`tests/exhibition.test.js`의 인증 대역도 HTTPS 전달 정보와 쿠키를 함께 요구합니다.

- `server.mjs`: loopback 전용 HTTP 서버, 정해진 HTML/CSS/JS/로고만 제공. 모든 화면·자산·API·QR 요청에서 `bokji_session`을 고정된 로컬 `/v1/admin/session`에 검증합니다. 비로그인 401, 일반 회원 403, 인증 서버 장애 503. Host·Origin·교차 사이트 검사, no-store/CSP/frame 차단, GET만 허용. 사용자 입력 URL로 외부 서버에 접속하지 않습니다.
- `urls.mjs`: 공개 HTTPS 주소 검증, 서비스 소개 URL 및 APK URL 생성. 입력의 인증정보·쿼리·fragment·임의 포트·로컬 주소 차단. `destinations(origin, apkOverride?)`는 검증한 도메인에 `/#guide`를 붙여 `{web, android, temporary}`를 반환합니다.
- `page.js`: 자동 상태 갱신, 적용된 주소와 QR 일치, APK 다운로드 버튼·등록 상태 연동, 주소 오류/권한 만료 시 링크 제거, PNG 저장·복사·인쇄.
- `/api/status`: `{detectedUrl, source, recordedAt, apkPresent, apkBytes}`. 내부 프로세스 경로/키/로그를 응답하지 않습니다.
- `/api/targets?origin=...&apk=...`: 검증된 `{web, android, temporary}`.
- `/api/qr?origin=...&apk=...&kind=web|android`: 로컬 PNG 생성. `download=1`은 파일 다운로드입니다. 외부 QR 서비스 호출 없음.

**`tools` 폴더를 정적 공개 디렉터리에 복사하지 마세요.** 제공된 인증 게이트웨이를 통해서만 연결합니다. 관리자 권한 회수·로그아웃은 다음 요청부터 차단되며 열린 화면도 5초 상태 갱신에서 QR을 지우고 로그인 만료를 표시합니다. QR 관리자는 다른 관리자 생성·목록 조회·직접 DB 관리 권한을 갖지 않습니다.

## 검증

```powershell
node --test tests/exhibition.test.js
node tests/exhibition-preview.mjs
npm test
npm run build
```

단위 검사는 새 QR을 실제 디코더로 판독해 기본 고정 URL을 비교하고 주소 검증·접근 차단·오류 응답을 확인합니다. 미리보기 검사는 임시 인증 서버로 파일 미등록/등록 전환과 APK/PNG 다운로드, 기본 주소·직접 입력·저장·인쇄·모바일 표시를 확인하며 실제 공유 서버 주소를 변경하지 않습니다. 화면/QR/PDF 결과는 저장소의 `tmp/exhibition-preview`에 둡니다. `download-fixture.apk`는 브라우저 검사용 가짜 파일이며 설치하거나 배포하지 않습니다.

고정 주소와 전시 운영 절차: [전시용 Android·웹 배포](../../../docs/exhibition.md).
