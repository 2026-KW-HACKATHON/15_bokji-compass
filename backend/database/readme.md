# MySQL 공고 저장 스키마

실제 공고 저장은 `backend`에서 `python -m app.modules.storage init`으로 준비한다.
접속 정보는 `backend/.env`에서 읽으며 API 요청이나 파싱 도중 DDL을 자동 실행하지 않는다.
[실행·이관·재개·검증 안내](../docs/policy-storage.md)를 함께 참고한다.

## SQL 파일 요약

| 파일 | 역할 | 주요 테이블·객체 |
|---|---|---|
| `001_schema.sql` | 개발용 기본 스키마 초안. 빈 `bokji_compass_dev`에서 수동으로 최초 구성할 때 사용 | `regions`, `users`, `user_profiles`, `policies`, `policy_requirements` |
| `002_seed.sql` | 삭제됨. 과거 개발용 더미 데이터였으며 다시 만들거나 적재하지 않음 | 없음 |
| `003_queries.sql` | 스키마 확인용 읽기 전용 예제. 생성·수정 쿼리는 없음 | 행 수, 사용자 프로필 LEFT JOIN, 공고 요건 JOIN, 공개 필터 |
| `004_condition_schema.sql` | canonical v2 조건 저장과 공식 지역 스냅샷 스키마 | `condition_region_snapshots`, `condition_regions`, `condition_documents`, `condition_entries` |
| `005_policy_ingestion.sql` | 수집 run·공고별 처리 상태와 revision 상세·재시도 체크포인트 | `policy_ingestion_runs`, `policy_ingestion_items`, `policy_revision_details` |
| `006_legacy_policy_projection.sql` | 구형 조회 계약을 위한 호환 테이블을 보장 | `policies`, `policy_requirements` |

### 001 개발 기본 스키마

`regions`는 지역 계층, `users`와 `user_profiles`는 개발용 사용자·선택 프로필,
`policies`는 공고 원문과 공개 상태, `policy_requirements`는 공고별 조건 근거 행을 담는다.
현재 `policies.source_key`는 공급자 식별자(`gov24:<서비스ID>`, `bokjiro:<servId>`)이며
재수집 중복 방지를 위해 unique다. 001은 현재 revision 저장소를 대체하지 않는 개발 초안이다.

### 004 정규화 공고 스키마

`condition_documents`는 revision마다 원천 식별자·해시·정규화 원문·추출 JSON·canonical JSON과
검토/공개 상태를 보존한다. `condition_entries`는 revision의 조건을 조건 ID, 대상, 상태,
연산자·값, 역할, 그룹 및 원문 근거 단위로 저장한다. 지역 테이블은 버전이 고정된 공식
스냅샷을 보관한다. `matching_enabled`는 공개 전에 활성화할 수 없도록 제약된다.

### 005 적재 이력과 전체 결과

`policy_ingestion_runs`는 실행 상태·건수·모델 설정을 기록한다. `policy_ingestion_items`는
공고별 원문 체크포인트, 결과, 오류와 revision 연결을 기록해 pending/failed 작업을 재개한다.
`policy_revision_details.draft_json`에는 검증된 전체 초안이 있어 요약·분류와
`overview.policy_requirements`도 확인할 수 있다. 이 테이블은 revision에 종속된다.

## 현재 저장 흐름

현재 파이프라인의 정본은 revision을 보존하는 004/005다. 앱 공개 조회도 이 구조를 사용한다.
성공한 LLM 추출은 `condition_documents`/`condition_entries`/`policy_revision_details`에
저장되고, 006 호환 계층은 같은 트랜잭션에서 결과를 001의 `policies`/
`policy_requirements`로 투영한다. `policies.source_text`는 파이프라인이 추출에 사용한
정규화 입력 JSON이며 공급자 응답의 원본 JSON/XML 전체를 의미하지 않는다. 원본 payload를
별도로 수집·보관한 경우에만 그 전체 응답을 조회할 수 있다.

`policy_requirements`는 LLM의 `overview.policy_requirements`를 조건당 한 행으로 저장한다.
`condition_type`은 age, birth_region, residence_region, gender, other이며 각 행은
`information_state`와 원문 `evidence_text`를 가진다. `policy_id`로 `policies`에 연결된다.
같은 `source_key`를 재수집하면 공고 행을 갱신하고 요건 행을 최신 추출 결과로 교체한다.
기존 revision의 호환 테이블 반영은 `PolicyRepository.backfill_legacy_policies()`가
공고별 최신 revision을 기준으로 수행한다. 호환 테이블은 파생 데이터이므로 직접 편집하지 않는다.

## 초기화와 안전성

`python -m app.modules.storage init`은 004/005/006을 순서대로 체크섬 기록과 함께 적용하고
공식 지역 스냅샷을 설치한다. 반복 실행은 적용 상태를 확인하며 기존 테이블과 데이터를
삭제하거나 덮어쓰지 않는다. 001의 사용자·기본 테이블을 자동 설치하거나 변환하지 않는다.
기록되지 않은 condition 테이블이나 부분 DDL이 발견되면 초기화를 중단한다. MySQL DDL은
암묵적으로 커밋될 수 있으므로 중간 실패 후에는 스키마 상태를 점검해야 한다.

테스트는 `BOKJI_TEST_MYSQL=1 python -m pytest tests/test_policy_database.py`로 실행한다.
통합 테스트는 격리된 `bokji_compass_test`만 사용하고 테스트가 만든 행만 정리한다.
