# MySQL 공고 저장 스키마

공고 저장 스키마는 `backend`에서 `python -m app.modules.storage init`으로 초기화한다.
DB 접속 정보는 `backend/.env`에서 읽으며 API 요청이나 파싱 중에는 DDL을 실행하지 않는다.
실행·이관·재개 방법은 [저장소 운영 안내](../docs/policy-storage.md)를 참고한다.

## 마이그레이션

초기화기는 004부터 008까지 아래 순서로 SQL을 적용한다.

| 파일 | 역할 | 주요 테이블·객체 |
|---|---|---|
| `001_schema.sql` | 기존 개발용 기본 스키마 초안. 새 저장소 초기화에는 사용하지 않음 | `regions`, `users`, `user_profiles`, `policies`, `policy_requirements` |
| `002_seed.sql` | 삭제된 개발용 더미 데이터. 재생성하거나 적재하지 않음 | 없음 |
| `003_queries.sql` | 기존 스키마 확인용 읽기 전용 쿼리 예제 | 조회 예제 |
| `004_condition_schema.sql` | canonical v2 조건 및 공식 지역 스냅샷 | `condition_region_snapshots`, `condition_regions`, `condition_documents`, `condition_entries` |
| `005_policy_ingestion.sql` | 수집 실행·항목 상태, 재시도 체크포인트, revision 상세 | `policy_ingestion_runs`, `policy_ingestion_items`, `policy_revision_details` |
| `006_policy_publication.sql` | 관리자 공개·비공개 변경 감사 이력 | `policy_publication_events` |
| `007_policy_collection.sql` | 서버 수집 작업, 체크포인트, 원문 변경 이력, 호출량 및 외부 공고 후보 | 수집 관련 테이블 |
| `008_legacy_policy_projection.sql` | 기존 조회 계약과의 호환 테이블 | `policies`, `policy_requirements` |

적용 SQL 파일명과 체크섬은 `policy_schema_versions`에 기록한다. 초기화기는 공식 지역 스냅샷의
무결성을 확인하고 약 63,000개 지역 행을 설치한다. 재실행 시 적용된 체크섬을 검증하며 기존
계정 테이블과 데이터를 삭제하거나 덮어쓰지 않는다. `001_schema.sql`과 `003_queries.sql`은
기존 개발 초안으로 보존하며 새 revision 저장소의 마이그레이션과 구분한다.

## 저장 구조

### 정규화 공고와 수집 이력

`condition_documents`는 공고 revision별 원천 식별자·해시·추출 결과·canonical JSON과 검토 상태를
보존한다. `condition_entries`에는 조건 ID, 대상, 상태, 연산자·값, 역할, 그룹 및 원문 근거를
저장한다. 지역 정보는 버전이 고정된 공식 스냅샷을 참조하며 `matching_enabled`는 공개 전에
활성화할 수 없다.

`policy_ingestion_runs`는 실행 상태·건수·모델 설정을 기록하고, `policy_ingestion_items`는
공고별 원문 체크포인트·결과·오류·revision 연결을 관리해 pending/failed 작업의 재개를 지원한다.
검증된 전체 결과는 `policy_revision_details.draft_json`에 보존한다.

### 기존 조회 계약

`policies`와 `policy_requirements`는 기존 조회 계약을 위한 호환 투영이다. 성공한 추출 결과는
revision 저장과 같은 트랜잭션에서 이 테이블에도 반영된다. `source_key`는 공급자 식별자
(`gov24:<서비스ID>`, `bokjiro:<servId>`)이며 재수집 중복 방지에 사용한다.

`policy_requirements`는 `overview.policy_requirements`를 조건별 행으로 저장한다. 각 행은
`condition_type`, `information_state`, 원문 `evidence_text`를 가지며 `policy_id`로 공고에 연결된다.
재수집 시 공고 정보와 요건 행을 최신 추출 결과로 갱신한다. 과거 revision은
`PolicyRepository.backfill_legacy_policies()`로 최신 revision 기준 재투영할 수 있다.
호환 테이블은 파생 데이터이므로 직접 편집하지 않는다.

`policies.source_text`에는 파이프라인이 추출에 사용한 정규화 입력 JSON을 저장한다. 이는 공급자
응답의 원본 JSON/XML 전체를 의미하지 않는다. 원본 payload는 별도로 수집·보관한 경우에만 조회할 수 있다.

## 초기화와 안전성

`python -m app.modules.storage init`은 004, 005, `006_policy_publication`,
`007_policy_collection`, `008_legacy_policy_projection`을 순서대로 체크섬과 함께 적용한 뒤
공식 지역 스냅샷을 설치한다.
`condition_*` 테이블이 적용 기록 없이 이미 존재하거나 부분 DDL이 발견되면 초기화를 중단한다.
자동 삭제나 덮어쓰기는 수행하지 않는다. MySQL DDL은 암묵적으로 커밋될 수 있으므로 초기화가
중간에 실패하면 스키마와 적용 기록을 점검해야 한다.

## 테스트와 수집

MySQL 통합 테스트는 격리된 `bokji_compass_test`만 사용하며 테스트가 만든 행만 정리한다.

```sh
BOKJI_TEST_MYSQL=1 python -m pytest tests/test_policy_database.py
```

독립 DDL 검증에는 `scripts/check-condition-schema.py`를 사용한다. 007의 서버 수집 경로는
`ingestion.repository.IngestionRepository`이며 기존 공고 revision 테이블을 덮어쓰지 않는다.
수집 worker는 스키마만 확인하고 DDL을 실행하지 않는다. 현재 수집 변경은 격리 SQLite 모의
테스트로 검증했으며 실제 MySQL 적용·수집은 별도 확인이 필요하다.
[서버 설정·소량 검증·스케줄 등록 안내](../docs/server-ingestion.md)를 참고한다.
