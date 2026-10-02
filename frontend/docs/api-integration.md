# 백엔드 API 연동 현황

기준: 2026-10-01. 공통 주소/상태는 루트 [API 관리대장](../../api-management.md).

서버는 상태 점검·인증·금융 계산/저장 외에 `/v1/policies` 공고 조회와
`/v1/assistant/questions` 회원 공고 질문을 구현했습니다. 추천 서버는 후속입니다.
[실제 공고·질문 계약](../../backend/docs/policy-storage.md)을 우선 참고하세요.

- createPolicyRepository({mode,request}).list(filters,{cursor,limit,signal}) → {items,total,nextCursor,source}
- createRecommendationRepository({mode,request}).recommend(profile,{signal,financialProfile?}) → {items:[{policy,reason}],summary,source}
- api: GET /v1/policies, POST /v1/recommendations. HTTP 클라이언트가 /api 등 기준 주소 결합.
- demo 런타임 데이터는 제거했습니다. 테스트 대역은 tests/fixtures에서만 사용합니다.
- 공고 15초, 추천 30초 제한. 취소·이전 응답 무시·JSON/schema 검증·안전한 오류 표시.
- 질문은 회원 쿠키·X-Auth-Request를 사용하며 웹 요청 70초/서버 모델 60초 제한입니다. 공고별 답변·원문 근거를 표시하고 닫을 때 제거합니다.
- API 실패 시 예시 fallback 없음. 빈 결과, 404 준비 중, 기타 실패와 재시도 구분.
- checkHealth() 도구 함수는 유지하지만 현재 제품 UI에서 호출하지 않음.
- 로그인/가입은 `authApi.js`를 통해 실제 서버와 연결합니다. credentials=include, X-Auth-Request: 1, 15초 제한이며 HttpOnly 세션 쿠키를 사용합니다. 일반 가입은 전화번호 없이 진행하고, 카카오 설정이 완료되면 실제 카카오 로그인·가입을 제공합니다. [필드·오류·세션 계약](../../backend/app/modules/auth/readme.md).

## 소득·재산 계산과 회원 저장: 구현됨

| Method / 서버 경로 | 호출자 | 쿠키 | 동작 |
|---|---|---|---|
| GET /v1/finance/rules | financeApi.rules() | omit | 지원 연도·규칙 버전·공식 출처 조회. 현재 화면은 계산 응답의 출처 사용 |
| POST /v1/finance/calculate | financeApi.calculate(profile) | omit | 비회원도 원자료를 전송해 서버 산식으로 계산 |
| GET /v1/finance/profile | financeApi.getProfile() | include | 버튼으로 현재 회원의 저장 원자료와 재계산 결과 불러오기 |
| POST /v1/finance/profile | financeApi.saveProfile(profile,{consent:true}) | include | 별도 저장 동의와 함께 현재 회원에게 저장 |
| POST /v1/finance/profile/delete | financeApi.deleteProfile() | include | UI의 두 단계 삭제 확인 후 현재 회원의 금융 원자료 삭제 |

모든 finance 요청은 15초 제한과 AbortSignal을 지원하고, 회원 요청에는 X-Auth-Request: 1을 함께 보냅니다. 공개 계산은 로그인 상태와 관계없이 쿠키를 보내지 않습니다. 공고가 demo여도 계산·회원 저장은 실제 서버를 호출하며 오류 시 가짜 계산 결과를 만들지 않습니다.

입력 계약은 [FinancialProfile](../../backend/app/contracts/finance.py)입니다. 가구원 수·지역·수급 상태, 가구원별 소득·공제 유형, 소유 주택·임차보증금·일반·금융 재산, 부채, 차량 원자료를 보냅니다. 금액은 0 이상 정수 원이며 빈칸은 null입니다. 전송 필드를 제한하고 안전 정수·범위를 검증합니다. 기준 금액과 산식은 [서버 규칙](../../backend/app/modules/finance/rules.py)·[계산 코드](../../backend/app/modules/finance/public.py)가 관리하며 프론트에서 재계산하지 않습니다.

계산 응답은 `reference_year`, `rules_version`, `median`, `assets`, `assessments`, `sources`, `notes`로 구성됩니다. 사업별 결과는 `estimated` 또는 `needs_review`, 개별 비교는 `within`·`over`·`unknown`입니다. `unknown`은 통과·탈락이 아니며 자격 미확인 상태를 유지합니다. 결과의 공식 출처를 링크하고 수급자·차상위 여부·자동차 특례를 확정하지 않습니다.

회원 불러오기·저장 응답은 `{profile,calculation,updated_at}`입니다. 저장 정보가 없으면 세 필드가 null인 정상 응답이며 현재 입력을 덮어쓰지 않습니다. 불러오기는 자동 실행하지 않습니다. 원자료는 선택한 회원 계정에 저장하고 불러올 때 현재 서버 규칙으로 다시 계산합니다. 비회원 원자료는 실행 중 메모리에만 유지하며 브라우저 저장소에 쓰지 않습니다. [계산기 모듈](../web/src/features/finance/readme.md).

## 금융정보를 추천에 사용하는 후속 계약: 서버 미구현

사용자가 계산 결과의 ‘관련 공고 살펴보기’를 선택한 뒤에만 추천 호출자의 선택 본문 `financialProfile`을 활성화합니다. 금융정보 계산·저장·불러오기만으로 추천에 자동 전송하지 않습니다. 계산·회원 저장·불러오기·삭제로 상위 금융 메모리를 갱신하거나 계정을 전환하면 활성 상태를 해제합니다. 공고 demo에서는 이 정보로 실제 자격을 비교하거나 서버로 전송하지 않으며 홈 이동 후 준비 중 안내 토스트를 표시합니다.

선택된 금융 원자료는 기본 추천 프로필과 별도 필드로 전송하며 계산 결과를 원자료 대신 보내지 않습니다. 미래의 추천 서버는 검토된 공고 조건과 사업별 규칙을 연결해야 합니다. `/v1/recommendations` 서버와 실제 금융 맞춤 추천은 아직 없으며 호출자 확장만 완료된 상태입니다. [공고·추천 제안 계약](service-contract.md).

## 배포와 플랫폼

2026-10-02 최고 관리자 공개 관리: `/v1/admin/policies`는 개정 목록, `/{revision_id}`는 검토 미리보기와 원문, `/{revision_id}/publication`은 공개/비공개 전환입니다. 웹 쿠키와 서버 최고 관리자 권한을 확인하고 POST에 현재 상태·검토 메모·X-Auth-Request를 전달합니다. 공개 성공 후 관리자 목록을 갱신하며 전체공고는 서버에서 공개 개정만 재조회합니다. 상태 충돌은 재조회, 권한 회수는 검토 화면 제거. [화면 계약](../web/src/features/auth/readme.md).

2026-10-02 공유 사이트: 기존 웹 repository의 `/api/v1/policies` 요청을 Caddy가 공유 API 8001로 전달합니다. 공유 API는 `.env`의 공고 MySQL 및 암호화 회원 저장소에 연결합니다. 기존 공유 SQLite 회원은 서버를 중지한 상태에서 명시적으로 이관합니다. 연결 상태는 `/api/health/ready`, 목록은 `/api/v1/policies?limit=6&sort=recent`로 확인합니다. 정상 빈 목록은 공개 공고 0건이며 초안 공개는 별도 검토가 필요합니다. [공유 실행 설정](../web/deploy/readme.md).

Vite proxy는 개발 전용입니다. 운영 /api reverse proxy 또는 HTTPS 주소+CORS 구성은 [배포 문서](deployment.md).
현재 백엔드 CORS는 설정된 Origin에 GET/POST, credentials=true, Content-Type/X-Auth-Request 헤더를 허용합니다. 인증 쿠키는 SameSite=Lax이므로 같은 사이트의 reverse proxy를 사용합니다. 인증·개인정보 응답을 프록시에서 캐시하지 않습니다.
Android/iOS도 같은 공개 JSON 계약을 사용하며 백엔드 파일·DB·CLI를 직접 참조하지 않습니다.

## 모바일 앱 연동 (2026-10-01)

`frontend/mobile`의 React Native + Expo 앱은 절대 API 주소와 `/v1/mobile/auth`의 Bearer 세션을 사용합니다. 기존 웹 쿠키 계약을 유지하고 `/v1/finance/profile` 조회/저장/삭제에 모바일 Authorization을 추가했습니다. POST 헤더와 동의 계약은 동일합니다. CORS 허용 헤더에 Authorization을 추가했으며 잘못된 헤더는 쿠키 인증으로 대체하지 않습니다. 공통 입력 모델은 `frontend/packages/core`입니다. [실행/보안 저장/검증 범위](../mobile/readme.md), [이식 기록](mobile-migration.md).
