# 현재 구현 상태와 DB 연결 범위

기준: 2026-09-23 저장소 코드. **MySQL 접속 설정·연결 점검은 구현, 파싱 결과의 MySQL 저장은 미구현.** 현재 파싱 결과는 검토용 JSON 파일로 저장.

이 문서는 현재 기능의 기준이며 [구현 계획](implementation-plan.md)은 후속 설계, [작업 기록](worklog.md)은 시점별 검증 이력.

## 구현 상태

| 영역 | 현재 상태 | 범위 |
|---|---|---|
| Windows 개발환경 | 구현 | requirements 설치·FastAPI 진입점·설정 로더·테스트 |
| macOS 개발환경 | 호환 코드·스크립트 구현 | 설치·서버·파싱·테스트용 Bash, Codex PATH·로그인 HOME·프로세스 그룹 종료 지원. 실기기 검증 필요 |
| MySQL 접속 설정 | 구현 | `.env`의 DB_HOST/PORT/NAME/USER/PASSWORD, SQLAlchemy/PyMySQL 풀 |
| 독립 개발 DB 구성 | 구현·로컬 구성 이력 있음 | 전용 데이터 폴더·포트·개발/테스트 계정. 팀원 PC는 별도 설정 필요 |
| DB 연결 점검 | 구현 | `/health/ready`에서 SELECT 1. 현재 실행 여부는 해당 PC에서 확인 |
| 기존 개발 SQL | 초안·별도 테스트 검증 | 001_schema/002_seed/003_queries. 서버 설치·시작에서 자동 적용 없음 |
| 신규 조건 스키마 | 제안·파일 계약 구현 | 상태/값·주체·단위·근거·조건 그룹. MySQL 테이블·마이그레이션 미적용 |
| 수집 | 구현 | Gov24·복지로 조회, 공고·광운대 공지 수집. 자동 전체 수집·스케줄러 미구현 |
| API 정책 행 변환 | 구현 | Gov24·복지로 public 진입점, 원문·상세 URL·서비스 ID 중복 검증. 기존 SQL용 행 반환만 수행 |
| Rawdata 파싱 | 구현 | Gov24 JSON·복지로 XML/JSON·RawDocument → 공통 입력 → CLI 추출 → 검증 |
| 모델 설정 | 구현 | 기본 Luna medium, 검증 실패 시 설정된 Terra로 1회 재시도. `.env`에서 변경 |
| 파싱 결과 저장 | 로컬 파일만 구현 | data/parsed_policies 아래 manifest·draft·시도별 진단 파일 |
| 정책 DB 저장·조회 | 미구현 | INSERT/UPDATE·중복 처리·개정 이력·조회 저장소·트랜잭션 연결 필요 |
| 사용자 자격 판정·추천 | 미구현 | 실행 가능한 조건 논리·프로필 대조·후보 검색 필요 |
| 계정 인증 | 구현·개발용 문자 인증 | `/v1/auth` 가입·로그인·세션·로그아웃·인증번호. 실제 문자 공급자 미연결. [계약](../app/modules/auth/readme.md) |
| 정책·추천 업무 HTTP API | 미구현 | health/readiness와 인증 외 업무 라우트 미구현 |

## 현재 데이터 흐름

```text
backend/.env의 DB 설정 → FastAPI 연결 풀 → /health/ready → SELECT 1

저장된 공개 원문 파일 → parse-raw.ps1 → 공통 입력 변환 → Codex CLI
                    → 자료형·근거 검증 → data/parsed_policies/.../draft.json
```

두 흐름은 정책 저장 코드로 연결되지 않은 상태. `parse_raw_files`는 DB 엔진을 생성하거나 SQL을 실행하지 않음. 파서는 공통 설정 로더를 사용하므로 DB_ENABLED=true이면 DB 필수 설정 검증은 수행하지만, 파싱 중 DB에 접속하지 않음. DB 없이 파싱만 실행할 때는 DB_ENABLED=false로 사용 가능.

## 혼동하기 쉬운 구분

- `.env`에 DB 접속 정보가 있음 ≠ 파싱 결과가 DB에 저장됨.
- `/health/ready`의 HTTP 200 ≠ 정책 테이블 생성·마이그레이션·데이터 적재 완료.
- SQL 파일 존재 또는 SQL 테스트 통과 ≠ 모든 팀원의 개발 DB에 적용 완료.
- `normalize_api_service(s)`·`normalize_gov24_service`·`normalize_bokjiro_service`는 기존 SQL용 행을 반환하며 직접 INSERT하지 않음.
- `needs_review`는 파일 초안 검토 필요 상태. DB 커밋·공개 승인·사용자 적격 판정을 뜻하지 않음.
- Git에 포함된 `.env.example`은 설정 예시. 실제 `.env`·계정·DB 파일·파싱 결과는 팀원 간 자동 공유되지 않음.

모든 파싱 결과는 `review_status=draft`, `matching_enabled=false`. 구조·원문 인용 검증 통과 후에도 주체·숫자·단위·예외 해석 검토 필요.

## 기존 SQL과 새 계약

기존 SQL의 `regions`, `users`, `user_profiles`, `policies`, `policy_requirements`는 개발용 초안. seed의 지역 코드는 합성 DEMO 코드이며 실제 행정코드로 사용 불가.

새 파싱 계약 `welfare-parsing-v1`은 조건 상태 0=명시적 제한 없음, 1=값 있음, 9=정보 없음과 실제 값을 분리. 미처리는 결과의 processing_state=8로 구분. 기존 SQL의 specified/unrestricted/unknown/not_stated와 자동 변환·저장 연결 없음.

공식 대한민국 행정코드·법정동/행정동 구분·유효기간을 갖는 지역 마스터는 후속 구현. 현재 지역 이름은 TEXT로 보존하고 임의 코드를 만들지 않음. 기존 SQL에 새 JSON을 그대로 넣어 운영 가능한 구조로 간주하지 않음.

## DB 연동 후속 순서

1. 각 환경의 기존 테이블·데이터를 확인하고 신규 계약·테이블·필드 표준 확정. 기존 개발 초안을 이미 적용한 팀원도 고려.
2. 버전 관리 마이그레이션과 공식 지역 마스터·변경 이력 도입. 기존 데이터 보존·이관 경로 검증.
3. 검증된 초안의 정책·조건·그룹·근거·모델/처리 버전을 저장하는 저장소 구현. 원천 ID·해시 기준 중복과 개정 구분.
4. 트랜잭션·실패 롤백·재시도·동시 갱신·파일 참조 일관성 구현. 현재 파싱 숫자는 float 계약이므로 금액의 정수/Decimal·MySQL BIGINT/DECIMAL 변환과 정밀도 검증 추가.
5. 별도 테스트 DB에서 저장·조회·재처리·장애 복구 검증. DB 커밋 후에만 저장 완료 상태 반환.
6. 검토/공개 승인과 HTTP API·인증·검색·자격 판정을 별도로 연결.

이 순서는 계획이며 이번 문서 정리에서 DB 생성·스키마 변경·데이터 적재를 수행하지 않음.

## 팀원 확인 순서

- 서버·DB 설치: [개발환경](development.md), [기존 SQL 사용법](../database/readme.md).
- 원문 파싱·모델 설정: [rawdata 파싱](raw-parsing.md). 현재 입력·출력: [데이터 계약](data-contracts.md).
- API 연동: [현재 HTTP 계약](api/readme.md). CLI 결과 폴더를 프론트엔드 API처럼 사용하지 않음.
- 검증: `backend/scripts/test.ps1`은 실제 DB·LLM 호출 없는 테스트. 실제 모델 호출·MySQL 테스트 이력은 [작업 기록](worklog.md)과 각 보고서 참조.
