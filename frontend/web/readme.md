# 복지나침반 웹

담당: 프론트엔드. React/JavaScript/Vite 기반 개인비서 추천 웹입니다.

## 실행과 검증

Node.js 22.12 이상. 저장소 루트 PowerShell:
```powershell
cd frontend/web
npm.cmd ci
npm.cmd run dev
npm.cmd test
npm.cmd run build
npm.cmd run format:check
```
개발 주소 http://127.0.0.1:5173. build 산출물은 dist/. preview는 4173에서 운영 모드 산출물을 확인하며 현재 Vite 설정의 proxy를 상속합니다. preview는 로컬 점검용이고 실제 정적 배포에는 proxy가 포함되지 않습니다.
`npm.cmd run test:e2e`는 Microsoft Edge/Chromium의 데스크톱·모바일 시나리오입니다. Edge가 없다면 Chromium을 설치하고 playwright.config.js의 channel을 조정합니다. 실제 iOS/Android 기기 테스트와 다릅니다.

## 구현 범위

- #home: 내 정보 → 개인비서 추천 공고·추천 이유. 개발 예시는 결정적인 정렬 결과임을 표시하며 LLM 결과로 가장하지 않음.
- #explore: 검색어 AND 검색, 분야·지역·대상·정렬, 서버 cursor 페이지. 태그 클릭은 #explore?tag=인코딩된값으로 이동.
- #saved: 현재 브라우저의 공고 스냅샷. 모드별 분리, 최신 내용은 원문 확인.
- #profile: 지역·연령대·상황·가구·관심 분야. 기본 메모리 보관, 기억하기 선택 시에만 브라우저에 저장.
- #calculator: 비회원도 소득·재산 원자료를 서버에 보내 계산. 가구별 소득·재산·부채·차량, 중위소득 단순 비교와 사업별 추정·추가 확인, 공식 출처 표시. 로그인한 회원은 별도 동의 후 저장·명시적 불러오기·삭제 가능.
- #login / #signup: 아이디·비밀번호 로그인. 가입은 이름·비밀번호 확인·만 나이·성별·시도·전화번호 인증. 개발 환경에서는 화면에 인증번호 표시, 실제 문자 발송은 미연결. [설정·서버 계약](../../backend/app/modules/auth/readme.md).
- 쉬운 화면: 20px 기준 글자, 주요 56px 타깃, 모션 제거, 추천 정보·회원가입·계산기 각각 3단계, 한 개씩 공고 보기, 세부정보 접기. 설정 기억.
- 모드 전환 시 작성 중인 폼·검색어·필터 유지. 1024px 이하 하단 탐색 메뉴, 가용 폭에 따른 공고 1~3열, 줄바꿈과 입력·계정 메뉴 재배치.
- 상세 dialog, Escape·초점 복귀, 해시 탐색, 로딩·빈 결과·오류·재시도, 취소·시간 초과·응답 검증.

실제 공고·LLM 추천 서버는 미구현입니다. 공고 demo와 별개로 인증·소득재산 계산·회원 금융정보 저장은 실제 서버에 연결하며 API 실패 시 예시를 대신 표시하지 않습니다. 실제 SMS·푸시·기본 추천 프로필/저장 공고의 계정 동기화·최종 자격 판정·네이티브 앱은 후속 작업입니다.

## 금융정보와 추천 연결

계산기는 서버의 2026년 공식 자료 기반 규칙으로 중위소득 단순 비율, 생계급여 기본 산식, 차상위 확인사업 기본 산식, 국민임대 일반 소득·자산 항목을 구분해 보여줍니다. 모르는 금액은 null, 없는 금액은 명시한 0으로 전송하고 미확인 조건은 별도 검토로 남깁니다. 결과가 수급자·차상위 여부나 최종 신청 자격을 확정하지 않습니다.

기본 추천 프로필의 ‘이 브라우저에 내 정보 저장’과 계산기의 ‘이 정보를 내 계정에 저장’은 다른 기능입니다. 금융정보는 localStorage/sessionStorage에 기록하지 않습니다. 비회원은 현재 실행 중 메모리만 사용하고, 회원 서버 저장은 체크 동의와 저장 버튼이 필요합니다. 계정 정보는 자동으로 불러와 작성 중 입력을 덮어쓰지 않습니다. 로그아웃·다른 계정으로 전환하면 이전 계정의 금융 메모리를 지웁니다.

‘관련 공고 살펴보기’를 선택한 뒤에만 추천 호출자의 `financialProfile` 선택 필드를 활성화합니다. 계산이나 계정 저장만으로 금융정보를 추천에 자동 전송하지 않습니다. 이 선택은 실행 중 메모리에서만 유지되며 금융정보 변경·계정 전환 시 해제합니다. 추천 API는 미구현이므로 현재 demo에서는 금융 맞춤 추천을 제공하지 않습니다. [구현 API와 제안 계약의 구분](../docs/api-integration.md).

## 구조

| 경로 | 책임 |
|---|---|
| src/app/ | 화면 조립, 경로, 상태, 서비스 주입, 반응형 스타일 |
| src/features/assistant/ | 추천 홈과 추천 repository |
| src/features/policies/ | 목록 repository, 모델 검증, 태그/검색/카드/상세 |
| src/features/profile/ | 정보 입력·검증·전송 필드 정규화 |
| src/features/auth/ | 전화번호 인증·회원가입·로그인 폼과 인증 API 클라이언트 |
| src/features/finance/ | 금융 원자료 입력·검증, 실제 서버 계산, 회원 저장과 결과 표시 |
| src/shared/ | HTTP, 공개 환경설정, 로컬 저장, DOM UI |

순수 모델/HTTP 계약과 웹 DOM을 분리합니다. Android Java/iOS에서는 같은 HTTP 계약을 사용하며 웹 CSS·localStorage를 직접 재사용하지 않습니다. [구조](../docs/architecture.md).

## 설정·배포

공개 설정 우선순위: public/app-config.js의 명시적 값 → VITE_* → 기본값.
`dataMode: auto`는 개발 demo / 운영 api. `VITE_DATA_MODE=api`로 개발 중 서버 연결을 시험할 수 있습니다.
이 설정은 공고·추천에 적용되며 인증과 금융 계산을 로컬 가짜 데이터로 바꾸지 않습니다.
기본 apiBaseUrl은 /api. 개발에서는 API_PROXY_TARGET(기본 http://127.0.0.1:8000)으로 전달하며 /api를 제거합니다.
운영에서는 reverse proxy가 필요합니다. [배포 절차](../docs/deployment.md), [Nginx 예시](deploy/nginx.conf), [서버 계약 제안](../docs/service-contract.md).
VITE_* 또는 app-config.js에 비밀키를 넣지 않습니다. LLM 호출·키는 서버 책임입니다. 폰트는 Fontsource로 자체 제공하며 PWA/오프라인 캐시는 미구현입니다.
