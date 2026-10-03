# 공고 저장소

2026-10-02 자동 승인 기본값: `PolicyRepository(engine, auto_publish=True)`는 검증된 새 needs_review 개정을 저장할 때 공개 상태와 감사 이력을 함께 커밋합니다. 파싱 원문/분석 JSON의 draft 표시는 보존하고 DB 공개 상태만 published로 전환합니다. `POLICY_AUTO_PUBLISH=true`가 기본이며 false는 수동 공개 방식입니다. 동일 결과 재사용으로 관리자가 비공개한 개정을 재공개하지 않습니다. 공고별 잠금으로 수동 변경·자동 저장을 직렬화하며 최신 개정만 자동 공개합니다.

`auto_publish_pending(repository) -> {published,skipped,enabled}`는 기존 공고별 최신 draft를 재검증해 공개하는 명시적 보완 작업입니다. reviewed/rejected와 이전 개정은 건너뜁니다. `python -m app.modules.storage auto-publish`로 실행하며 LLM·재수집 없이 원문을 유지합니다. 자동 승인 실패 시 새 개정 저장·항목 완료·감사 이력을 모두 롤백합니다. matching_enabled는 false를 유지합니다.

담당: 백엔드. 수집 원문 파일과 MySQL 공고·조건·개정·작업 기록을 관리한다.
처리 결과 기본 저장소는 MySQL이다. [실행·이관·오류·검증](../../../docs/policy-storage.md).

## 공개 진입점 (public.py)

- `list_publication_revisions(repository, limit=20, offset=0)` → 초안을 포함한 개정 목록·검증/누락 경고·total/nextCursor. 최고 관리자 API에서만 호출.
- `review_publication_revision(repository, revision_id)` → 카드 미리보기·수집 필드·최근 변경 이력, 없으면 None.
- `set_publication_status(repository, revision_id, action, expected_status, actor_id, note)` → 공개 상태. 검증된 needs_review 결과만 공개하며 AND/OR 미확정 항목은 검토 경고로 유지. 개정 원문·분석 JSON은 변경하지 않음.
- 같은 공고의 개정들을 행 잠금으로 보호. 다른 개정을 공개하면 이전 공개 개정은 reviewed로 전환. 비공개 후 과거 개정이 다시 노출되지 않음. 상태 충돌은 PublicationConflict, 없음은 LookupError.
- `006_policy_publication.sql`은 변경자·이전/이후 상태·메모·시각을 저장. 상태와 이력은 같은 트랜잭션. 공개가 matching_enabled를 활성화하지 않음. 요청 중 테이블 자동 생성 없음.

- initialize_policy_schema(engine) → 적용 SQL/지역 행 수. 명시적 초기화 전용.
- 마이그레이션 체크섬은 Git의 LF/CRLF 변환만 호환하며 기존 기록을 덮어쓰지 않는다. 새 기록은 LF 기준이고 SQL 내용·공백·주석 변경은 계속 거부한다.
- PolicyRepository(engine) → 기존 MySQL 스키마 조회. 자동 초기화하지 않는다.
- start_run(sources, processing) → run_id. 원문/pending 작업 커밋.
- save_result(run_id, draft) → policy_key/status/revision_id/reused/saved. 커밋 후 반환.
- finish_run(run_id, prepare_only=False) → run_id/storage/status/records.
- pending_items(run_id) → 재개할 pending/failed 원문·결과 목록.
- mark_failed(run_id, policy_key, error_code, draft=None) → 실패·체크포인트 저장.
- list_revisions(published_only=True, limit=20, offset=0, policy_key=None) → 개정 요약 목록.
- get_revision(revision_id, published_only=True) → 원문/전체 결과/검토 상태 또는 None.
- import_draft(payload), validate_draft(payload) → v1/v2 검증·명시적 v1 변환.
- backfill_legacy_policies(policy_keys=None) → 저장된 개정을 `policies`/`policy_requirements`에 반영.
- save_raw_document(document, storage_path), list_raw_documents(storage_path) → 기존 수집 원문 파일 저장/조회.

LLM 호출 없음. 검증 오류는 ValueError, DB 오류는 SQLAlchemyError 계열이다.
기본 조회는 공개 공고만 반환하고 로컬 검토에서만 published_only=False를 지정한다.
CLI: python -m app.modules.storage init|import-drafts|list|get (--help 참고).
MySQL 통합 테스트: BOKJI_TEST_MYSQL=1 python -m pytest tests/test_policy_database.py.
Windows 환경변수 지정법은 위 전체 안내를 따른다. 테스트 생성 데이터는 종료 시 정리한다.

run_processing(run_id)는 재개 시 원래 모델/추론 설정을 조회합니다. 규칙 버전이 바뀌면 새 실행이 필요합니다.
신규 `save_result`는 개정형 테이블과 001 호환 `policies`/`policy_requirements`를 같은
트랜잭션에서 저장합니다. `source_key` unique 키로 재실행 중복을 막고, 승인 상태는
원문이 바뀔 때만 draft로 되돌립니다. 기존 개정은 `backfill_legacy_policies`로 투영합니다.
기존 `storage.policy`는 001 테이블용 원문 어댑터로 유지합니다.
