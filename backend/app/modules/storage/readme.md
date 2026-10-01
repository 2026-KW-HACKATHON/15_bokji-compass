# 공고 저장소

담당: 백엔드. 수집 원문 파일과 MySQL 공고·조건·개정·작업 기록을 관리한다.
처리 결과 기본 저장소는 MySQL이다. [실행·이관·오류·검증](../../../docs/policy-storage.md).

## 공개 진입점 (public.py)

- initialize_policy_schema(engine) → 적용 SQL/지역 행 수. 명시적 초기화 전용.
- PolicyRepository(engine) → 기존 MySQL 스키마 조회. 자동 초기화하지 않는다.
- start_run(sources, processing) → run_id. 원문/pending 작업 커밋.
- save_result(run_id, draft) → policy_key/status/revision_id/reused/saved. 커밋 후 반환.
- finish_run(run_id, prepare_only=False) → run_id/storage/status/records.
- pending_items(run_id) → 재개할 pending/failed 원문·결과 목록.
- mark_failed(run_id, policy_key, error_code, draft=None) → 실패·체크포인트 저장.
- list_revisions(published_only=True, limit=20, offset=0, policy_key=None) → 개정 요약 목록.
- get_revision(revision_id, published_only=True) → 원문/전체 결과/검토 상태 또는 None.
- import_draft(payload), validate_draft(payload) → v1/v2 검증·명시적 v1 변환.
- save_raw_document(document, storage_path), list_raw_documents(storage_path) → 기존 수집 원문 파일 저장/조회.

LLM 호출 없음. 검증 오류는 ValueError, DB 오류는 SQLAlchemyError 계열이다.
기본 조회는 공개 공고만 반환하고 로컬 검토에서만 published_only=False를 지정한다.
CLI: python -m app.modules.storage init|import-drafts|list|get (--help 참고).
MySQL 통합 테스트: BOKJI_TEST_MYSQL=1 python -m pytest tests/test_policy_database.py.
Windows 환경변수 지정법은 위 전체 안내를 따른다. 테스트 생성 데이터는 종료 시 정리한다.

run_processing(run_id)는 재개 시 원래 모델/추론 설정을 조회합니다. 규칙 버전이 바뀌면 새 실행이 필요합니다.
legacy storage.policy는 001용 Gov24/Bokjiro 원문 행 어댑터이며 신규 파이프라인에는 사용하지 않습니다.
