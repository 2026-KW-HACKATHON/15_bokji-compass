# 사용자 저장 구조와 공고 매칭

2026-10-06. 기준은 ORM 모델·실제 저장 코드·설정된 MySQL의 메타데이터입니다.
회원 원문과 인증정보는 조회/기록하지 않았습니다. 다른 서버 설정이나 SQLite에 있는 회원까지
확인한 결과로 일반화하지 않습니다.

## 실제 DB 확인 및 보완

현재 `.env`는 DB_ENABLED=true로 MySQL 회원 저장을 사용합니다. 최초 확인에서 auth_accounts는
0행이며 age/region/phone이 NOT NULL인 이전 스키마였고 username_lookup/profile_ciphertext 및
account_financial_profiles가 없었습니다. 기존 `python -m app.modules.auth init`을 실행해
필요 열·인증 관련 테이블·금융 테이블을 추가하고 선택 정보의 NULL을 허용했습니다.
회원·공고를 삭제하거나 예시 계정을 생성하지 않았습니다. 복원/가져오기 행 수는 모두 0입니다.
재확인에서도 회원·금융 0행이며 공고 3개 개정(공개 2, 초안 1), 조건 74행입니다.
모든 개정은 matching_enabled=false입니다. 공개/매칭 상태를 변경하지 않았습니다.

실제 추천 조회 시 기존 저장소가 요구하는 policies/policy_requirements 호환 테이블도 없었습니다.
`python -m app.modules.storage init`으로 미적용 007/008/010 마이그레이션을 적용했습니다.
기존 개정·조건·지역 스냅샷은 유지했고 새 공고·예시 회원·실행 작업을 만들지 않았습니다.

## 저장 경로

| 데이터 | 실제 위치 | 저장·조회 방식 |
| --- | --- | --- |
| 회원 기본정보 | auth_accounts | id PK, username UNIQUE, name/age/gender/region/phone, created_at. 가입·프로필 수정 시 저장 |
| 비밀번호 | auth_accounts.password_hash | scrypt 해시, 매칭에 사용하지 않음 |
| 로그인 | auth_sessions | token_hash PK, account_id, expires_at. 쿠키/앱 토큰의 검증된 계정으로 조회 |
| 소득·재산 원입력 | account_financial_profiles | account_id PK/FK → auth_accounts.id, profile_json TEXT, updated_at. 계정당 1개, 명시적 저장 동의 |
| 금융 계산 결과 | 영구 저장 없음 | 저장한 FinancialProfile을 읽을 때 서버 규칙으로 재계산 |
| 추천 선호값 | 웹 메모리 또는 사용자가 선택한 localStorage | 지역/연령대/직업/가구 형태/관심 분야. 서버 DB 저장과 구분 |
| 공고 정규화 조건 | condition_documents, condition_entries | revision_id별 source_json/canonical_json, 공식 지역 스냅샷, 근거 인용, 조건 논리 |
| 화면용 공고 | policy_revision_details | 제목·분야·요약·draft_json. 최신 공개 개정만 후보로 사용 |

과거 001_schema.sql의 users/user_profiles는 현재 로그인 테이블이 아니며 확인한 MySQL에는 없습니다.
DB_ENABLED=false에서는 동일 회원 모델을 AUTH_SQLITE_PATH에 저장합니다. SQLite 계정이 MySQL로
자동 이동하지는 않습니다. 기존 데이터 이동은 별도 `--import-sqlite` 명령으로 처리합니다.

회원 프로필과 금융 JSON은 현재 일반 저장이며 비밀번호·세션은 해시입니다.
금융 JSON에는 기준연도, 가구원 수/심사범위 확인, 가구원별 소득과 소득기준,
주택·보증금·일반/금융재산, 부채, 차량 정보, 추가 검토 여부 등이 들어갑니다.
빈 금액은 null이며 0원과 구분합니다. 가구원 목록에는 신청자 식별자가 없으므로 첫 가구원을
회원 본인으로 간주하지 않습니다. 금융 region은 공제용 권역이며 거주지 지역코드와 다릅니다.

## 매칭 대응표

| 공고 조건 | 사용자 입력 | 현재 처리 |
| --- | --- | --- |
| age | 회원 age / 비회원 ageBand | 정확한 수치 또는 범위 비교. 기준일 지정이면 추가 확인 |
| gender | 회원 gender | 공개한 남/여만 비교 |
| residence_region | 회원 region / 비회원 region | 공식 명칭으로 정규화 후 같은 코드 체계의 계층 비교 |
| registered/actual_residence_region | 별도 구분 없음 | unknown. 시·도 정보로 구/동을 확정하지 않음 |
| employment_status | 요청 occupation | 직장인/자영업자만 명시적으로 연결. 학생·은퇴를 미취업으로 추정하지 않음 |
| household_size | 선택한 금융정보 | 심사 가구원 범위를 확인한 경우에만 비교 |
| income/assets/recognized_income 등 | 선택한 금융정보 | 사업별 산정 기준을 연결하기 전에는 unknown |
| 자녀/부모/배우자·장애·주택소유·거주기간 | 현재 대응 정보 부족 | unknown. 금융재산이나 소득공제 선택으로 대신 확정하지 않음 |

회원의 지역·나이·성별은 세션으로 읽으며 요청 profile이 덮어쓰지 못합니다. 회원값이 null이어도
클라이언트 값으로 확정하지 않습니다. 관심 분야·직업은 요청 선호값이며 DB 사실과 구분합니다.
추가 정보가 필요한 필드는 신규 사용자 사실 계약/동의·저장 화면을 설계해 확장할 수 있습니다.

## API와 적용

`POST /v1/recommendations`에 웹 쿠키 또는 앱 Bearer를 보냅니다. 회원은 `{}`만 보내도 기본
DB 프로필을 사용합니다. 기존 웹 요청 `{profile,limit:3,financialProfile?}`도 지원합니다.
`use_saved_financial_profile:true`는 로그인한 본인의 저장 JSON만 읽습니다. 기본 요청은 저장된
금융정보를 읽지 않습니다. 추천 데이터·프로필·답변을 별도 학습 로그에 저장하지 않습니다.

응답은 `{items:[{policy,reason,matching}],summary,profile_source,financial_source,
eligibility_decided:false,truncated}`입니다. matching에는 조건별 state(match/mismatch/unknown),
근거 인용, 확인사항과 검토 상태를 포함합니다. 회원 ID·이름·전화번호·금액 원입력은 응답에 없습니다.
원문/공식 스냅샷 검증, 최신 공개 개정, 기간, AND/OR/NOT, partial과 비활성 상태를 보존합니다.

2026-10-07: 비회원도 `{}`로 일반 추천을 요청할 수 있습니다. 메인 추천은 미확인 특수 자격,
부분/비활성 조건, 기간 미확인 공고로 채우지 않습니다. 공고마다 실제 필수 정보를 확인해
`mode`, `profile_sufficient`, `guidance`, `missing_fields`를 함께 반환합니다. 정보가 부족하면
명시적으로 일반 대상인 신청 중 공고만 안내하며, 없으면 입력 안내를 반환합니다.
실제 공급자 누적 조회수와 출처에 적힌 예산 소진율·마감 안내는 선택적으로 전달합니다.
[추천 안전 기준](recommendation-safety.md), [출처 누적 조회수](policy-popularity.md).

웹 추천 요청은 credentials=include와 X-Auth-Request:1을 사용합니다. 계정 변경 시 진행 중인
추천을 취소하고 재조회합니다. 앱도 같은 Bearer API를 호출할 수 있으며 앱 추천 화면 연결은 별도입니다.
LLM 답변 튜닝은 이 비교 결과와 공개 원문을 설명하는 후속 단계입니다.

## 검증 범위

`tests/test_matching.py`: 실제 SQL 후보 선택을 격리 SQLite에서 검증하고 쿠키/Bearer 계정 격리,
저장 금융정보 사용 선택, 요청 변조·실패 응답, 수치 경계·지역 계층·논리·기간·인용을 검사합니다.
설정 MySQL의 스키마 재조회와 합성 요청의 공개 공고 추천은 읽기 전용으로 확인합니다.
실제 회원은 0명이므로 실사용 회원 저장/로그인 및 앱 화면의 종단 검증과 구분합니다.

관련 백엔드 회귀 51개, 웹 Node 테스트 43개, 변경 Python Ruff 검사와 웹 빌드 통과.
실제 MySQL 공고를 사용하는 합성 서울/부산 요청 모두 200/no-store이며 2개 최신 공개 공고를
반환했습니다. 각 개정의 22개 조건 비교와 needs_review 상태, 금융정보 미사용을 확인했습니다.
OpenAPI에 RecommendationInput을 사용하는 POST 경로가 생성되는 것도 확인했습니다.
브라우저 추천·계정 전환 회귀 5개 통과. 이 검사는 테스트 전용 응답을 사용했으며 실제 공고
조회 확인과 구분합니다. 기존 테스트 결과·Vite 캐시의 접근 제한은 별도 tmp 경로에서 검증했습니다.

[모듈 호출·반환·제한](../app/modules/matching/readme.md), [회원 저장](member-privacy.md).
