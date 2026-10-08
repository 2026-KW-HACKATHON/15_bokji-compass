# HTTP API 경계

2026-10-08 모바일 가입: `/v1/mobile/auth/email/request`, `/email/verify`, `/signup`은 쿠키 대신 명시적 이메일 인증 증명을 사용합니다. `/v1/mobile/auth/kakao/*`는 브라우저 결합 OAuth와 PKCE 일회용 코드 교환 후 모바일 Bearer 세션을 발급합니다. 기존 웹 콜백의 `mobile.` state 분기만 재사용하며 웹 쿠키로 앱 로그인하지 않습니다. [카카오 계약·설정](../../docs/kakao-login.md).

2026-10-07 생활 상담: `/v1/assistant/dialogue`는 계정별 임시 대화에서 부족한 정보를
한 항목씩 질문하고 공개 공고를 비교합니다. `/dialogue/profile`은 확인·동의한 본인
정보만 기존 지속 안내 프로필에 병합합니다. 외부 AI 호출 없이 작동하며 전체 질문
이력을 저장하지 않습니다. [입력·저장·만료·한계](../../docs/assistant-dialogue.md).

2026-10-07 지속 안내: `/v1/monitoring`은 웹 쿠키/모바일 Bearer로 본인의 생활 프로필,
자동 탐색 분야·지원 후보·진행 상태·앱 안 알림을 관리합니다. 저장 동의는 필수이며
전체 추적은 기본 꺼짐입니다. POST에는 `X-Auth-Request: 1`이 필요합니다.
운영 스키마 초기화와 정기 worker는 [모듈 계약](../modules/monitoring/readme.md),
동작·한계는 [구현 문서](../../docs/proactive-guidance.md)를 참고하세요.

2026-10-07 서버 관리자 공고 편집: GET `/v1/server-admin/policies`,
GET/PATCH `/v1/server-admin/policies/{policy_key}`. 최고 관리자·같은 출처·전용 쿠키를 요구합니다.
PATCH는 1MiB 본문, 엄격한 입력 검증·version 충돌 409를 적용합니다.
[편집 항목·공개 상태·개정 보존 계약](../../../api-management.md).

현재 상태: 상태 점검, 인증, 금융 계산·저장, 공개 공고 목록·상세·검색, 회원 공고 질문과
DB 프로필 기반 조건 비교 추천 API 구현.

## 백엔드 서버 관리자

`server_admin.pages`는 백엔드 `/`의 로그인·관리 화면과 제한된 정적 자산을 제공합니다.
`server_admin.router`의 `/v1/server-admin`은 기존 인증 저장소의 최고 관리자만 허용합니다.
전용 `bokji_server_admin` 쿠키를 발급하고 매 설정·상태 요청에서 권한을 새로 확인합니다.
일반 웹 쿠키·QR 관리자 등급으로 서버 관리 권한을 대신할 수 없습니다.

`GET /operations`는 최근 수동 작업, `POST /operations`는 DB 확인·제한 수집·기존 공고
인덱싱·Windows 자동 수집 등록/해제를 제공합니다. 명시적 POST만 실행하고 202로 접수한 뒤
백그라운드 상태를 조회합니다. 원문 모드는 모델과 검색을 차단하며 중복 실행/DB 재시작 대기는
409입니다. `GET /schedule`은 예약 작업 조회만 수행합니다. 임의 명령·경로·SQL 입력은 없습니다.

login/logout/session, 서버·자원·DB·수집 overview, 설정 GET/PATCH, 저장된 수집
status/changes/candidates GET이 구현되어 있습니다. POST/PATCH는 같은 출처·
`X-Auth-Request: 1`, 64KB 이하 JSON을 요구합니다. 페이지와 API는 no-store·CSP·프레임
차단을 적용하고 입력 오류에서 비밀번호·키를 반영하지 않습니다.

허용된 설정만 저장하고 DB 엔진·인증 저장소 변경은 재시작까지 대기합니다. 조회·설정 저장은
수집·모델·Windows 스케줄을 실행하지 않습니다. 임의 SQL·서버 파일·프로세스 관리 API는
제공하지 않습니다. [함수 계약](../modules/server_admin/readme.md),
[운영 순서](../../docs/server-admin.md), [HTTP 관리대장](../../../api-management.md).
검증은 `tests/test_server_admin.py`, `tests/test_server_settings.py`의 오프라인 대역을 사용합니다.

`GET/POST /v1/server-admin/processes`는 프로젝트 백엔드·프론트의 상태 조회와 종료·재시작을
제공합니다. 변경 입력은 target/action의 고정 선택값만 허용하며 최고 관리자·같은 출처 요청을
검증한 뒤 202 작업을 접수합니다. `GET /processes/{job_id}`는 UUID에 해당하는 영속 결과를
조회합니다. 제어·수집 충돌은 409, 관리되지 않는 실행 환경·기동 장애는 503으로 안내합니다.

`policies.router`는 MySQL의 공개된 최신 공고 목록·상세·검색을 제공합니다.
목록·캘린더는 `search_scope=all|organization|content`(기본 `all`)로 게시기관과
제목·본문 검색을 구분합니다. 잘못된 범위는 422이며 대학 약칭·정식 명칭을 함께
검색합니다. [검색 필드·호출 예시](../../docs/policy-search.md).
GET `/v1/policies`의 `sort`는 `popular|recent|name`이며 기본값은 `popular`입니다.
필터를 적용한 전체 공고를 공급자 누적 조회수 내림차순으로 정렬한 뒤 페이지를 반환합니다.
목록·상세·캘린더 공고는 `popularity: {views,source,basis,asOf} | null`을 포함합니다.
조회수가 같으면 공개 개정 생성일 내림차순·정책 ID 오름차순을 사용하며, 조회수 미확인
공고는 확인된 0회 뒤에 최신순으로 표시합니다. [상세 계약](../../docs/policy-popularity.md).
`assistant.router`는 로그인 회원의 공고 질문을 받으며 최소 프로필과 공개 원문으로 답변합니다.
`members.get_member`는 금융/질문 API의 웹 쿠키·모바일 Bearer 검증을 공유합니다.
[공고/질문 계약과 제한](../../docs/policy-storage.md), `test_policy_api.py`를 참고하세요.

`health.router`는 입력 없는 동기 GET `/health`, `/health/ready`를 제공합니다. 반복 호출은 DB 데이터를 변경하지 않습니다. 준비 상태는 내부 풀로 `SELECT 1`을 실행하며 미설정·실패 시 503을 반환합니다. 드라이버 오류나 비밀정보는 응답하지 않습니다.

예: `/health`는 `{"status":"ok","service":"bokji-compass-backend"}`, DB 미설정 readiness는 `{"status":"not_ready","database":"disabled"}`입니다.

`auth.router`는 `/v1/auth`의 인증 API를 제공합니다. [인증 계약](../modules/auth/readme.md)을 참고하세요.

`finance.router`는 `/v1/finance`의 공개 규칙 조회·계산과 로그인 계정별 금융정보 조회·저장·삭제를 제공합니다. 공개 계산은 인증·DB 설정 없이 실행하며, 회원 경로는 검증한 세션의 계정 ID만 사용합니다. 금융 응답은 오류를 포함해 `no-store`이며 검증 오류에 원입력을 포함하지 않습니다. [금융 모듈·초기화](../modules/finance/readme.md), [공식 산정 규칙·계산 한계](../../docs/financial-rules.md)를 참고하세요. 공고 전체의 신청 자격 확정은 제공하지 않으며 조건 비교 추천은 recommendations.router에서 제공합니다.

[API 문서](../../docs/api/readme.md)를 참고하고 backend에서 `.venv/Scripts/python.exe -m pytest tests/test_bootstrap.py tests/test_auth.py tests/test_finance_api.py`로 검증합니다.

## 모바일 인증

`mobile_auth.router`는 `/v1/mobile/auth`의 login/me/logout을 제공합니다. login 입력은 기존 LoginInput이고 토큰·사용자·만료 초를 반환합니다. me/logout은 HTTP Bearer 토큰을 받습니다. 웹 쿠키와 모바일 토큰은 해시 영역을 분리하며 쿠키를 발급하지 않습니다. 금융 회원 API는 Authorization이 있으면 모바일 토큰만, 없으면 기존 쿠키를 검증합니다. 공개 계산은 기존처럼 비회원 사용이 가능합니다.

계약은 [API 관리대장](../../../api-management.md)의 모바일 인증 절, 검증은 `tests/test_mobile_auth.py`와 기존 인증/금융 테스트를 참고하세요.
# 2026-10-06 추천 API 연결

`recommendations.router`의 `POST /v1/recommendations`는 인증 회원의 저장 나이·성별·지역과
최신 공개 공고 조건을 비교합니다. 비회원 요청 프로필도 지원합니다. 금융정보는 명시적으로
전달하거나 본인 저장 정보 사용을 선택할 때에만 읽습니다. 자격 확정/LLM 호출/저장은 없습니다.
[계약·검증 범위](../../docs/member-policy-matching.md).

2026-10-07: 비회원도 `{}`로 공개 추천 안내를 요청할 수 있습니다. 프로필 유무와 모든
필드의 완성 여부 대신, 각 공고의 실제 필수 조건을 비교할 수 있는지 확인합니다.
정보가 부족하면 원문상 일반 대상이며 현재 신청 가능한 공고만 보여주고, 그런 공고가
없으면 정보 입력을 안내합니다. 응답에 `mode`, `profile_sufficient`, `guidance`,
`missing_fields`를 추가합니다. `popular`는 실제 공급자 누적 조회수가 있는 일반 공고를
선택했을 때만 사용합니다. [추천 안전 기준](../../docs/recommendation-safety.md),
[누적 조회수 연결](../../docs/policy-popularity.md).
