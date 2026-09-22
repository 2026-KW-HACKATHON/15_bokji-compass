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
- #login / #signup: 이메일·비밀번호·가입 확인 입력폼. 제출 비활성화, 인증·계정 저장·네트워크 요청 없음.
- 쉬운 화면: 20px 기준 글자, 주요 56px 타깃, 모션 제거, 3단계 입력, 한 개씩 공고 보기, 세부정보 접기. 설정 기억.
- 상세 dialog, Escape·초점 복귀, 해시 탐색, 로딩·빈 결과·오류·재시도, 취소·시간 초과·응답 검증.

실제 공고·LLM 추천 서버는 미구현입니다. 운영 API 실패 시 예시를 대신 표시하지 않습니다. 인증·푸시·동기화·실제 자격 판정·네이티브 앱도 후속 작업입니다.

## 구조
| 경로 | 책임 |
|---|---|
| src/app/ | 화면 조립, 경로, 상태, 서비스 주입, 반응형 스타일 |
| src/features/assistant/ | 추천 홈과 추천 repository |
| src/features/policies/ | 목록 repository, 모델 검증, 태그/검색/카드/상세 |
| src/features/profile/ | 정보 입력·검증·전송 필드 정규화 |
| src/features/auth/ | 인증 로직 없는 폼 |
| src/shared/ | HTTP, 공개 환경설정, 로컬 저장, DOM UI |

순수 모델/HTTP 계약과 웹 DOM을 분리합니다. Android Java/iOS에서는 같은 HTTP 계약을 사용하며 웹 CSS·localStorage를 직접 재사용하지 않습니다. [구조](../docs/architecture.md).

## 설정·배포
공개 설정 우선순위: public/app-config.js의 명시적 값 → VITE_* → 기본값.
`dataMode: auto`는 개발 demo / 운영 api. `VITE_DATA_MODE=api`로 개발 중 서버 연결을 시험할 수 있습니다.
기본 apiBaseUrl은 /api. 개발에서는 API_PROXY_TARGET(기본 http://127.0.0.1:8000)으로 전달하며 /api를 제거합니다.
운영에서는 reverse proxy가 필요합니다. [배포 절차](../docs/deployment.md), [Nginx 예시](deploy/nginx.conf), [서버 계약 제안](../docs/service-contract.md).
VITE_* 또는 app-config.js에 비밀키를 넣지 않습니다. LLM 호출·키는 서버 책임입니다. 폰트는 Fontsource로 자체 제공하며 PWA/오프라인 캐시는 미구현입니다.
