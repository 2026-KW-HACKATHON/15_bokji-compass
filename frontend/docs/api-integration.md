# 백엔드 API 연동 현황

기준: 2026-09-25. 공통 주소/상태는 루트 [API 관리대장](../../api-management.md).

현재 서버 구현은 GET /health, GET /health/ready, `/v1/auth` 인증 API와 `/v1/finance` 계산·회원 금융정보 API입니다. 공고·추천 서버는 없습니다.
웹에는 [업무 계약 제안](service-contract.md)에 대한 호출자를 구현했습니다. 서버 구현 완료를 의미하지 않습니다.

- createPolicyRepository({mode,request}).list(filters,{cursor,limit,signal}) → {items,total,nextCursor,source}
- createRecommendationRepository({mode,request}).recommend(profile,{signal,financialProfile?}) → {items:[{policy,reason}],summary,source}
- api: GET /v1/policies, POST /v1/recommendations. HTTP 클라이언트가 /api 등 기준 주소 결합.
- demo: 합성 공고와 결정적 관심 분야 우선 정렬, 네트워크 없음. 실제 LLM 추론 아님.
- 공고 15초, 추천 30초 제한. 취소·이전 응답 무시·JSON/schema 검증·안전한 오류 표시.
- API 실패 시 예시 fallback 없음. 빈 결과, 404 준비 중, 기타 실패와 재시도 구분.
- checkHealth() 도구 함수는 유지하지만 현재 제품 UI에서 호출하지 않음.
- 로그인/가입은 `authApi.js`를 통해 실제 서버와 연결합니다. credentials=include, X-Auth-Request: 1, 15초 제한이며 HttpOnly 세션 쿠키를 사용합니다. 개발용 전화번호 인증번호는 화면에 표시되며 실제 SMS는 미연결입니다. [필드·오류·세션 계약](../../backend/app/modules/auth/readme.md).

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

Vite proxy는 개발 전용입니다. 운영 /api reverse proxy 또는 HTTPS 주소+CORS 구성은 [배포 문서](deployment.md).
현재 백엔드 CORS는 설정된 Origin에 GET/POST, credentials=true, Content-Type/X-Auth-Request 헤더를 허용합니다. 인증 쿠키는 SameSite=Lax이므로 같은 사이트의 reverse proxy를 사용합니다. 인증·개인정보 응답을 프록시에서 캐시하지 않습니다.
Android/iOS도 같은 공개 JSON 계약을 사용하며 백엔드 파일·DB·CLI를 직접 참조하지 않습니다.
