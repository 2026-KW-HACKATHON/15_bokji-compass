# 현재 구현 상태와 DB 연결 범위

기준: 2026-10-01 저장소 코드. **코드 우선 파싱·조건 v2·공식 지역 분류, 소득·재산 참고 계산과 회원 금융정보 저장 구현. 정책 MySQL 저장·조회·개정·재개 구현, 추천 API는 후속.** 기본 결과 저장소는 MySQL. [DB 저장 안내](policy-storage.md). [조건·지역 사용법](condition-classification.md), [금융 계산·저장 모듈](../app/modules/finance/readme.md).

이 문서는 현재 기능의 기준이며 [구현 계획](implementation-plan.md)은 후속 설계, [작업 기록](worklog.md)은 시점별 검증 이력.

## 구현 상태

| 영역 | 현재 상태 | 범위 |
|---|---|---|
| Windows 개발환경 | 구현 | requirements 설치·FastAPI 진입점·설정 로더·테스트 |
| macOS 개발환경 | 호환 코드·스크립트 구현 | 설치·서버·파싱·테스트용 Bash, Codex PATH·로그인 HOME·프로세스 그룹 종료 지원. 실기기 검증 필요 |
| MySQL 접속 설정 | 구현 | `.env`의 DB_HOST/PORT/NAME/USER/PASSWORD, SQLAlchemy/PyMySQL 풀 |
| 독립 개발 DB 구성 | 구현·로컬 구성 이력 있음 | 전용 데이터 폴더·포트·개발/테스트 계정. 팀원 PC는 별도 설정 필요 |
| DB 연결 점검 | 구현 | `/health/ready`에서 SELECT 1. 현재 실행 여부는 해당 PC에서 확인 |
| 기존 개발 SQL | 초안·별도 테스트 검증 | 001_schema/003_queries 보존. 002 더미 seed 제거. 자동 적용 없음 |
| 신규 조건 스키마 | v2 계약·DDL 구현 | 표준 필드·Decimal 문자열·조건 논리·생성 JSON Schema. 004/005 명시적 마이그레이션·저장 연결 적용 |
| 공식 지역 분류 | 구현 | 행안부 ADMIN/LEGAL 63,000행·생성/말소일·출처 해시. 유일한 현행 이름만 코드화, 중복/폐지/체계 모호성은 UNKNOWN |
| 수집 | 구현 | Gov24·복지로 조회, 공고·광운대 공지 수집. 자동 전체 수집·스케줄러 미구현 |
| API 정책 행 변환 | 구현 | Gov24·복지로 public 진입점, 원문·상세 URL·서비스 ID 중복 검증. 기존 SQL용 행 반환만 수행 |
| Rawdata 파싱 | 코드 우선 경로 구현 | 공통 입력 → 코드 분류 → 미해결 원문은 CLI → 근거 검사·v2 정규화. 별도 LLM 호출로 요약·6개 분야·근거 인용을 초안에 기록. 부분 코드 결과 보존 |
| 모델 설정 | 구현 | 기본 Luna medium, 검증 실패 시 설정된 Terra로 1회 재시도. `.env`에서 변경 |
| 파싱 결과 저장 | MySQL 기본 | 원문·조건·개정·작업 기록. 명시적 --storage json만 오프라인 파일 내보내기 |
| 정책 DB 저장·조회 | 구현·실제 MySQL 검증 | 중복 방지·불변 개정·원자적 저장·실패/재개·초안 이관. 공개 검토 서비스는 후속 |
| DB 기반 개인 LLM | 로컬 1차 연결 구현 | 지정 개정 원문 질의응답·인용 검증. 계정/API/챗봇 화면은 후속 |
| 조건 논리 조합 | 구현 | all/any/not/unknown AST·참조/누락 검증·3상태 조합. LLM 평면 그룹은 검토 전 UNKNOWN |
| 사용자 자격 판정·추천 | 전체 판정·추천 미구현 | 금융조건 비교 함수는 별도 구현. 정책 저장소·검토 승인·다른 조건·추천과의 연결 필요 |
| 계정 인증 | 구현·개발용 문자 인증 | `/v1/auth` 가입·로그인·세션·로그아웃·인증번호. 실제 문자 공급자 미연결. [계약](../app/modules/auth/readme.md) |
| 모바일 인증 (2026-10-01) | 구현·격리 SQLite 검증 | `/v1/mobile/auth` Bearer 로그인/조회/폐기. 금융 회원 API 연동, 기존 웹 쿠키와 분리. [앱 이식](../../frontend/docs/mobile-migration.md) |
| 소득·재산 참고 계산 | 구현 | `/v1/finance/rules`, `/calculate`. 비회원도 가능. 2026 기본 산식·미확정 항목 표시. [산정 규칙](financial-rules.md) |
| 회원 금융정보 저장 | 구현·격리 SQLite 검증 | `/v1/finance/profile` 조회·동의 후 저장·삭제. 원입력만 저장하고 계산 결과는 재계산. MySQL 명시 초기화·실제 MySQL 저장 검증 후속 |
| 정책·추천 업무 HTTP API | 미구현 | 정책 목록·상세·검색·개인비서 추천 경로 미구현. 금융 계산 API와 구분 |

## 현재 데이터 흐름

```text
backend/.env의 DB 설정 → FastAPI 연결 풀 → /health/ready → SELECT 1

저장된 공개 원문 파일 → parse-raw.ps1/sh → 공통 입력 → 코드 규칙
                    → 미해결 시 Codex CLI → 근거·필드·공식 지역 검증
                    → MySQL condition_documents/entries + policy_ingestion_* (기본)

비회원·회원의 금융 원입력 → /v1/finance/calculate → 참고 계산 (저장 없음)
회원 세션 + 명시적 저장 동의 → /v1/finance/profile → 계정별 원입력 저장
회원 금융정보 조회 → 저장 원입력 + 현재 규칙으로 재계산한 결과
```

파싱은 DB_ENABLED=true와 storage init을 필요로 하며 결과를 MySQL에 저장합니다.
DB 장애 시 파일로 우회하지 않습니다. --storage json을 명시하면 오프라인 내보내기를 수행합니다.

금융정보 저장은 기존 인증 계정의 ID와 같은 DB 엔진을 사용하지만 정책 파이프라인과 독립적입니다. 개발 SQLite는 로그인된 회원의 첫 금융정보 요청에서 별도 `account_financial_profiles` 테이블을 추가합니다. MySQL은 backend에서 `python -m app.modules.finance`를 명시적으로 실행해야 하며 서버 요청에서 테이블을 자동 생성하지 않습니다. 기존 001 SQL의 `users/user_profiles`와 연결하지 않습니다. 금융 초기화는 신규 테이블 생성이며 기존 금융 스키마 변경·원입력 버전 이관은 아직 구현하지 않았습니다.

금융 저장소는 계정별 최신 원입력 한 건과 저장 시각만 보관합니다. 결과·입력 이력은 보관하지 않으며 로그인 만료나 로그아웃이 저장값을 지우지는 않습니다. 금융정보 삭제 경로는 현재 로그인한 계정의 입력만 삭제합니다. 자동 보관기간 만료·계정 탈퇴는 후속 작업입니다.

## 혼동하기 쉬운 구분

- `.env`에 DB 접속 정보가 있음 ≠ 파싱 결과가 DB에 저장됨.
- `/health/ready`의 HTTP 200 ≠ 정책 테이블 생성·마이그레이션·데이터 적재 완료.
- SQL 파일 존재 또는 SQL 테스트 통과 ≠ 모든 팀원의 개발 DB에 적용 완료.
- `normalize_api_service(s)`·`normalize_gov24_service`·`normalize_bokjiro_service`는 기존 SQL용 행을 반환하며 직접 INSERT하지 않음.
- `needs_review`는 파일 초안 검토 필요 상태. DB 커밋·공개 승인·사용자 적격 판정을 뜻하지 않음.
- 금융 계산의 `estimated`·`within`은 입력 정보로 계산한 참고 결과이며 공고 전체의 자격 확정이 아님. `needs_review`·`unknown`은 입력 또는 적용 기준의 추가 확인이 필요하다는 뜻.
- 회원 금융정보 저장 성공은 정책 DB 적재·추천 프로필/저장 공고의 계정 동기화 완료가 아님.
- 웹의 명시적인 금융정보 추천 반영은 미구현 추천 API에 선택적 원입력을 보내는 호출자 준비 상태. 실제 공고와 `evaluate_policy`가 연결되었거나 LLM 추천이 실행되었다는 뜻이 아님.
- Git에 포함된 `.env.example`은 설정 예시. 실제 `.env`·계정·DB 파일·파싱 결과는 팀원 간 자동 공유되지 않음.

모든 파싱 결과는 `review_status=draft`, `matching_enabled=false`. 구조·원문 인용 검증 통과 후에도 주체·숫자·단위·예외 해석 검토 필요.

## 기존 SQL과 새 계약

기존 SQL의 `regions`, `users`, `user_profiles`, `policies`, `policy_requirements`는 개발용 초안. seed의 지역 코드는 합성 DEMO 코드이며 실제 행정코드로 사용 불가.

새 처리 결과 계약 `welfare-parsing-v2`의 `canonical`은 `welfare-conditions-v2`. 상태 0=명시적 제한 없음, 1=값 있음, 9=정보 없음과 실제 값을 분리. 미처리는 결과의 processing_state=8로 구분. 기존 SQL의 specified/unrestricted/unknown/not_stated와 자동 변환·저장 연결 없음.

공식 지역 마스터는 `reference/regions`에 구현. 추출 `analysis`의 TEXT 원문을 유지하고 `canonical`에서만 검증된 REGION 값으로 변환. 새 `004_condition_schema.sql`은 별도 condition_* 테이블 계약이며 기존 001 테이블을 자동 이관하지 않습니다. 004/005 저장 경로는 구현했습니다.

## DB 연동 현황과 다음 단계

004/005 초기화·공식 지역 적재·개정/조건 저장·중복/동시성/롤백·실제 공고 적재를 검증했습니다.
이 PC의 개발 DB에는 실제 공고 2종과 분석 개정 3건이 있습니다. 모두 draft 상태입니다.
다른 환경은 기존 테이블을 확인하고 [명시적 초기화와 이관](policy-storage.md)을 수행해야 합니다.
공개 검토·현재 개정 선택·HTTP 공고 API·사용자 자격 판정·회원별 챗봇 연결은 다음 단계입니다.

## 팀원 확인 순서

- 서버·DB 설치: [개발환경](development.md), [기존 SQL 사용법](../database/readme.md).
- 원문 파싱·모델 설정: [rawdata 파싱](raw-parsing.md). 현재 입력·출력: [데이터 계약](data-contracts.md).
- API 연동: [현재 HTTP 계약](api/readme.md). CLI 결과 폴더를 프론트엔드 API처럼 사용하지 않음.
- 금융 계산·계정 저장: [모듈 사용법](../app/modules/finance/readme.md), [공식 산정 규칙과 한계](financial-rules.md). `evaluate_policy`는 서버 내부 연결 함수이며 공고 기준을 받는 공개 HTTP 경로는 없음.
- 검증: `backend/scripts/test.ps1`은 실제 DB·LLM 호출 없는 테스트. 실제 모델 호출·MySQL 테스트 이력은 [작업 기록](worklog.md)과 각 보고서 참조.
