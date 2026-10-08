<p align="center">
  <img src="frontend/web/public/brand-logo.png" alt="복지나침반 로고" width="120" />
</p>

<h1 align="center">복지나침반</h1>

<p align="center">
  <strong>나에게 필요한 복지를 찾는 길잡이</strong><br />
  공고 탐색부터 조건 확인, 신청 준비와 지속 안내까지 연결하는 개인 복지 비서
</p>

<p align="center">
  2026 광운대학교 KW 해커톤 · 팀 복지나침반<br />
  <a href="https://bokji.commitnaru.com/">웹 서비스</a> ·
  <a href="https://bokji.commitnaru.com/#guide?easy=0">서비스 소개</a> ·
  <a href="https://bokji.commitnaru.com/downloads/bokji-compass.apk">Android APK</a>
</p>

<p align="center">
  <a href="#프로젝트-소개">소개</a> ·
  <a href="#주요-기능">주요 기능</a> ·
  <a href="#사용-흐름">사용 흐름</a> ·
  <a href="#회원과-데이터-보호">회원·보안</a> ·
  <a href="#시작하기">시작하기</a> ·
  <a href="#프로젝트-문서">문서</a>
</p>

> **2026-10-09 기준.** 실제 공개 공고를 사용하는 웹과 React Native 모바일 앱을 개발하고 있습니다. 웹은 맞춤 추천·대화형 탐색·지속 안내·신청 준비를 제공하며, Android 앱은 별도 빌드·배포합니다. 웹과 앱의 기능 범위 및 배포 시점은 다를 수 있습니다.

## 프로젝트 소개

복지 공고를 찾아도 내 나이와 거주지, 생활 상황에 맞는 지원인지 다시 확인해야 합니다. 복지나침반은 공식 공고의 조건과 근거를 정리하고, 사용자가 필요한 정보를 찾고 신청을 준비하도록 돕습니다.

월계1동의 지역 문제에서 출발해 복잡한 화면이 부담스러운 어르신, 주소지와 생활지역이 다른 청년, 자격 조건이 낯선 유학생의 이용 상황을 고려했습니다. 일반·쉬운 화면과 모바일 메뉴, 다섯 언어의 UI·공고 번역을 제공합니다.

## 주요 기능

| 기능 | 현재 제공하는 내용 |
| --- | --- |
| **공고 탐색·맞춤 추천** | 실제 공개 공고의 검색·분야·지역·모집 상태 필터, 회원 조건에 따른 추천과 원문 근거, 관심 공고 저장 |
| **대화형 검색·복지 비서** | 자연어로 공고를 찾는 대화 전용 화면, 이어지는 질문과 공고 선택, 생활 상황을 단계별로 확인하는 상담 |
| **지속 안내·알림함** | 별도 동의로 저장한 생활정보에 따른 지원 후보 재탐색, 새 후보·공고 변경의 앱 내 알림, 개인별 추천 제외·복원 |
| **신청 안내·서류 준비** | 원문에서 확인한 신청 주소·전화·방문 안내, 필요한 서류와 계정별 준비 체크, 준비·신청 진행 상태 관리 |
| **같은 사업의 단계별 공고** | 같은 기관·사업·연도·회차의 신청·기간 연장·결과를 묶어 표시하고 개별 원문과 첨부 파일 보존 |
| **공고 첨부 파일** | 검토한 공식 첨부 파일의 열람·다운로드와 원문 연결 |
| **복지 캘린더** | 공고의 신청 기간·마감일·반복 일정 표시, 저장 공고 중심 일정 확인 |
| **우리 동네 복지** | 검토된 공식기관 자료로 지역별 이동·건강·돌봄·문화 생활서비스 안내 |
| **소득·재산 계산** | 가구·소득·재산·부채·차량 입력의 서버 규칙 계산, 부족한 정보·계산 근거·근사 계산 한계 안내, 동의한 입력 저장 |
| **쉬운 화면·다국어** | 큰 글씨·단계별 입력·명확한 조작 영역, 좁은 화면의 전체 메뉴, 한국어·영어·중국어 간체·베트남어·일본어 UI와 공고 번역 |
| **웹·Android 앱** | 웹과 앱의 금융 모델·번역 자원을 공유하고 모바일 앱에 로그인·공고·계산·AI 비서·알림 설정 화면 제공 |

추천과 계산 결과는 확인을 돕는 참고 정보입니다. 지원 자격·수급 여부를 확정하거나 정부기관에 신청을 대신 제출하지 않습니다. 실제 신청 조건과 모집 상태는 공식 원문에서 확인하세요.

## 사용 흐름

1. **공고 찾기:** 검색·분야·지역 필터 또는 대화 화면에서 필요한 지원을 찾습니다.
2. **내 상황 확인:** 회원 정보와 선택한 생활정보를 바탕으로 추천 이유·확인할 조건을 살펴봅니다.
3. **신청 준비:** 상세 화면에서 공식 출처·신청 경로·첨부 파일·서류를 확인하고 준비 상태를 기록합니다.
4. **이어보기:** 원하는 경우 지속 안내를 켜 새 후보·공고 변경을 알림함에서 확인합니다. 불필요한 추천은 제외하고 나중에 복원할 수 있습니다.

비회원도 공개 공고 탐색·대화형 검색·소득/재산 계산을 사용할 수 있습니다. 계정별 생활정보 저장·지속 안내·서류 준비 기록은 로그인과 해당 기능의 동의가 필요합니다.

## 회원과 데이터 보호

- **가입·로그인:** 일반 가입은 SMTP 이메일 인증을 사용합니다. 카카오 가입·로그인은 서버의 앱 설정이 필요하며, 최초 가입 시 이메일과 개인정보 안내 동의를 받습니다. 같은 이름·이메일이라는 이유로 계정을 자동 연결하지 않습니다.
- **계정 관리:** 내 정보 수정·비밀번호 재설정·회원 탈퇴를 지원합니다. 금융 입력과 지속 안내의 저장·삭제는 계정별로 처리합니다.
- **인증:** 비밀번호는 scrypt 해시, 서비스 세션과 카카오 식별자는 해시로 저장합니다. 웹은 HttpOnly 쿠키와 운영 환경의 Secure 속성, 모바일은 별도 Bearer 인증을 사용합니다.
- **저장 구조:** 회원 저장소는 SQLite 또는 MySQL을 사용합니다. 회원 프로필은 일반 DB 열, 동의한 금융 입력은 JSON으로 저장하며 현재 버전은 프로필 AES 암호화·아이디 HMAC 키 생성을 요구하지 않습니다. 이전 암호화 DB의 복원은 별도 절차를 따릅니다.
- **전송·접근 방어:** 운영 API의 HTTPS 요구, 출처·브라우저 요청 검사, 요청 본문 제한, CSP·HSTS 등 보안 헤더, 계정 소유권·관리자 권한 검사를 적용합니다. 원격 운영 회원 MySQL은 검증된 TLS 연결을 요구합니다.
- **AI 처리 구분:** 생활 상황 상담과 자유 대화 검색은 공개 공고·조건 비교 경로를 사용합니다. 외부 AI를 이용하는 공고 질문은 처리 안내 설정과 동의가 필요합니다. 금융 원입력과 정확한 주소를 모델 문맥에 자동으로 첨부하지 않습니다.

서버 키·DB 비밀번호·SMTP 비밀번호·터널 토큰·앱 서명키와 실제 회원 데이터는 Git에 넣지 않습니다. 서버의 `.env`와 로컬 저장 경로에서 관리합니다.

[회원 저장·기존 데이터 복원](backend/docs/member-privacy.md) · [동의·AI 데이터 흐름](backend/docs/privacy-consent.md) · [웹·전송 보안](backend/docs/web-security.md) · [모바일 보안](frontend/docs/mobile-security-review.md)

## 공고를 정리하는 방식

공공 API와 기관 공고의 원문을 수집하고, 조건을 주체·값·단위와 공식 지역 정보로 정리합니다. 명확한 조건은 코드로 처리하고 복합 문장은 설정된 Codex CLI로 조건 후보를 추출합니다. 원문·인용·개정 정보를 보존하고, 현재 공개 상태인 공고를 검색·추천·상담에 사용합니다.

같은 사업의 후속 공고는 기관·연도·회차를 확인해 묶으며, 서로 다른 모집 차수를 단순히 제목이 비슷하다는 이유로 합치지 않습니다. 원문 첨부 파일과 신청 경로도 별도로 확인합니다. 공개 카탈로그 캐시는 현재 공개 개정·목록 변경을 확인하며 요청 중복과 메모리 사용을 제한합니다.

## 기술 구성

| 영역 | 구성 |
| --- | --- |
| 웹 | React · JavaScript · Vite · 반응형 일반/쉬운 화면 |
| 모바일 | TypeScript · React Native · Expo SDK 57 · Expo Router |
| 서버 | Python 3.13 · FastAPI · SQLAlchemy |
| 데이터 | 공고 MySQL · 회원 SQLite/MySQL · 개정·공개 상태·원문 근거 관리 |
| 분석·번역 | 코드 기반 조건·자연어 해석 · 설정된 Codex CLI 분석·질문·공고 번역 |
| 배포 | Windows 운영 스크립트 · Caddy · Cloudflare Tunnel · HTTPS 고정 주소 |
| 검증 | pytest · Ruff · Node 테스트 · Playwright · TypeScript · ESLint |

```text
15_bokji-compass/
├── backend/                 # API, 공고 수집·저장·검색·추천·상담·인증
│   ├── app/modules/         # 기능별 모듈
│   ├── reference/           # 공식 지역·생활서비스·첨부 파일 참고 자료
│   ├── scripts/             # 환경 준비·DB·운영·수집·부하 검사 도구
│   └── docs/                # 서버 계약·설정·검증 기록
├── frontend/
│   ├── web/                 # 사용자 웹·전시 QR 관리·배포 설정
│   ├── mobile/              # React Native + Expo 앱
│   ├── packages/core/       # 웹·앱 공통 금융 모델·번역 자원
│   └── docs/                # 화면·앱·배포·검증 기록
├── api-management.md        # 공통 API 관리대장
└── start-server-*.bat       # Windows 개발·운영 실행 진입점
```

## 시작하기

Node.js **22.13 이상**을 사용하세요. Windows 백엔드 준비에는 Python **3.10 이상**의 설치 진입점이 필요하며, 설치 스크립트가 프로젝트 안에 Python **3.13** 가상환경을 준비합니다. 실제 공고 기능은 MySQL 설정과 공개 공고 데이터가 필요합니다.

### 웹과 백엔드 개발 실행

저장소를 내려받습니다.

```bash
git clone https://github.com/2026-KW-HACKATHON/15_bokji-compass.git
cd 15_bokji-compass
```

첫 번째 PowerShell 터미널에서 백엔드와 프로젝트용 MySQL을 준비합니다. MySQL 실행 파일이 필요하며, `setup-mysql.ps1`은 프로젝트용 별도 데이터 폴더·포트·계정을 사용합니다. 기존 `.env`는 보존합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/setup-mysql.ps1

cd backend
.\.venv\Scripts\python.exe -m app.modules.storage init
.\.venv\Scripts\python.exe -m app.modules.auth init
.\.venv\Scripts\python.exe -m app.modules.monitoring --init
.\.venv\Scripts\python.exe server.py --reload
```

두 번째 터미널에서 웹을 실행합니다.

```bash
cd frontend/web
npm ci
npm run dev
```

웹은 기본 `http://127.0.0.1:5173`, 개발 API는 `http://127.0.0.1:8000`입니다. 웹의 `/api` 요청은 Vite가 개발 API로 전달합니다. `/health`는 서버 실행 상태, `/health/ready`는 DB 준비 상태를 확인합니다. API 문서는 개발 서버의 `/docs`에서 볼 수 있습니다.

`storage init`은 스키마 준비 후 번들에 있는 공식 광운대 공고·지역 서비스의 누락 데이터를 보충하고 필수 검색을 확인합니다. 기존 개정·수동 비공개는 덮어쓰지 않습니다. [필수 데이터 보충](backend/docs/focus-search-data.md), [공고 저장·적재](backend/docs/policy-storage.md), [수집 운영](backend/app/modules/ingestion/readme.md)을 참고하세요. 지속 안내의 주기적 재탐색은 [별도 작업자 설정](backend/app/modules/monitoring/readme.md)이 필요합니다. 실제 이메일 발송은 [SMTP 설정](backend/docs/email-signup.md), 카카오 로그인은 [앱 설정](backend/docs/kakao-login.md), 외부 모델 기능은 해당 서버 설정을 준비해야 합니다.

MySQL 없이 회원 API만 개발할 때는 `DB_ENABLED=false`의 기본 SQLite를 사용할 수 있습니다. 공고 조회와 지속 안내의 전체 기능 준비와는 구분합니다. macOS는 [설치·개발 안내](backend/docs/macos-development.md)를 따르세요.

### 모바일 앱

새 PowerShell 터미널을 저장소 루트에서 열고 실행합니다. 기존 모바일 `.env`는 유지합니다.

```powershell
cd frontend/mobile
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm start
```

앱의 기본 API 설정은 `https://bokji.commitnaru.com/api`이며 `.env.example`과 배포 프로필에서 관리합니다. `npm ci`는 의존성 보안 패치를 적용하고 주요 실행 명령은 패치 상태를 확인합니다. Android 개발 빌드·독립 APK·서명 설정은 [모바일 실행 안내](frontend/mobile/readme.md)와 [Android 릴리스 안내](frontend/docs/android-release.md)를 따르세요. iOS 네이티브 배포는 현재 전시 범위에서 제외하며 iPhone은 웹으로 안내합니다.

### 운영 실행

팀의 고정 도메인·터널 토큰·DB·웹 의존성을 준비한 Windows 환경에서는 루트의 `start-server-prod.bat`를 사용합니다. 이 명령은 웹을 빌드하고 MySQL·API·웹·QR·터널을 관리합니다. 일반 개발 실행과 구분해 사용하세요.

[고정 도메인·터널 설정](backend/docs/fixed-domain.md) · [웹 배포](frontend/web/deploy/readme.md) · [전시·QR·APK 운영](frontend/docs/exhibition.md)

## 검증과 현재 범위

기능별 테스트와 검증 기록은 각각의 실행 시점·데이터·도구·제외 조건을 함께 남깁니다. [2026-10-08 프로젝트 QA](frontend/docs/qa-2026-10-08.md), [백엔드 테스트 안내](backend/tests/readme.md), [웹 테스트 안내](frontend/web/tests/readme.md)를 참고하세요. 과거 실행 기록은 최신 전체 소스의 재검사 결과와 구분합니다.

실제 SMTP·카카오 공급자·외부 모델·운영 DB·Android/iOS 실기기는 자동 테스트 대역의 통과만으로 동작을 확정하지 않습니다. 모바일 자동 푸시 발송·기기 간 저장 공고 동기화와 웹/앱 기능 일치는 추가 확인 범위입니다. 신청 제출·공식 자격 확정은 서비스가 수행하지 않습니다.

## 프로젝트 문서

| 내용 | 문서 |
| --- | --- |
| API·영역별 문서 | [API 관리대장](api-management.md) · [백엔드](backend/docs/readme.md) · [프론트엔드](frontend/docs/readme.md) |
| 검색·추천·대화 | [검색](backend/docs/policy-search.md) · [자유 대화](backend/docs/free-conversation.md) · [생활 상황 상담](backend/docs/assistant-dialogue.md) |
| 지속 안내·신청 준비 | [지속 안내](backend/app/modules/monitoring/readme.md) · [신청 안내](backend/docs/notice-source-fields.md) · [알림함](frontend/docs/notification-inbox.md) |
| 공고·첨부·지역 정보 | [단계별 공고](backend/docs/notice-series.md) · [첨부 파일](backend/docs/policy-attachments.md) · [우리 동네 복지](backend/docs/local-services.md) |
| 금융·번역 | [계산 규칙·한계](backend/docs/financial-rules.md) · [공고 번역](backend/docs/policy-translation.md) |
| 화면·접근성 | [쉬운 화면](frontend/docs/easy-mode-accessibility.md) · [모바일 메뉴](frontend/docs/mobile-header.md) · [색상 구성](frontend/docs/ui-color-refresh.md) |
| 실행·협업 | [백엔드 실행](backend/readme.md) · [웹 실행](frontend/web/readme.md) · [모바일 실행](frontend/mobile/readme.md) · [협업 안내](CONTRIBUTING.md) |
| 발표·작업 기록 | [중간발표 자료](중간발표_자료/readme.md) · [백엔드 기록](backend/docs/worklog.md) · [프론트엔드 기록](frontend/docs/worklog.md) |
