# MySQL 공고 저장 스키마

담당: 백엔드. 실제 공고 저장은 backend에서 `python -m app.modules.storage init`으로 초기화한다.
접속 설정은 .env를 사용하며 API 요청/파싱에서 DDL을 자동 실행하지 않는다.
[실행·이관·재개·검증](../docs/policy-storage.md).

- 004_condition_schema.sql: 공식 지역 스냅샷/마스터, 공고 개정, 조건 행과 CHECK/FK 제약.
- 005_policy_ingestion.sql: 실행/항목 상태, 중복 해시, 전체 결과/요약/처리 설정.
- 006_policy_publication.sql: 최고 관리자 공고 공개·비공개 변경 이력. 원문을 변경하지 않으며 명시적 init으로 적용.
- 007_policy_collection.sql: 서버 수집 위치·작업/체크포인트·원문 변경 이력·일일 호출량·외부 공고 후보.
- policy_schema_versions: 초기화기가 관리하는 적용 SQL/체크섬 기록.
- 001_schema.sql / 003_queries.sql: 기존 개발 초안. 신규 저장소와 다른 계약이며 보존한다.
- 002_seed.sql: 더미 데이터 제거 요청에 따라 삭제. 다시 실행하거나 재적재하지 않는다.

초기화기는 004~007을 순서대로 적용하고 해시 검증된 공식 지역 63,000행을 적재한다.
반복 초기화는 이미 적용한 체크섬을 확인한다. 기존 001/계정 테이블과 데이터는 보존한다.
기록 없이 condition_* 테이블이 존재하거나 부분 DDL이 발견되면 중단한다. 삭제/덮어쓰기는 없다.
MySQL DDL의 암묵적 커밋으로 중간 오류 후에는 기존 적용 상태를 직접 점검해야 한다.

저장 경로는 storage.public.PolicyRepository이며 기존 storage.policy의 001용 Gov24/Bokjiro
어댑터와 구분한다. 새 파이프라인은 canonical v2 및 원문 근거를 보존한다.
개정/조건/완료 상태를 한 트랜잭션으로 저장하고 검토 전에는 공개/자동 판정하지 않는다.

MySQL 8.0.44에서 초기화·실제 공고 저장·중복·롤백·동시 저장을 검증했다.
테스트는 BOKJI_TEST_MYSQL=1 환경변수와 tests/test_policy_database.py를 사용한다.
프로젝트의 별도 bokji_compass_test DB만 사용하며 생성한 테스트 ID를 종료 시 정리한다.
과거 독립 DDL 검증 도구 scripts/check-condition-schema.py도 유지한다.

007 추가 수집 경로는 ingestion.repository.IngestionRepository이며 기존 공고 개정 테이블을
덮어쓰지 않는다. 수집 worker는 스키마를 점검만 하고 DDL을 실행하지 않는다.
이번 수집 변경은 격리 SQLite 모의 테스트로 검증했으며 실제 MySQL 적용·수집은 실행하지 않았다.
[서버 설정·소량 검증·스케줄 등록](../docs/server-ingestion.md)을 따른다.
