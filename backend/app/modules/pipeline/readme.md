# 원문 처리 파이프라인

담당: 백엔드. 원문 → 코드/LLM 추출 → 근거 검증 → MySQL 저장.

- parse_raw_files(paths, settings=None, output_root=None, prepare_only=False, storage="mysql")
  → 기본 (None, manifest). manifest에는 run_id/storage/status/records가 들어간다.
- persist_sources(sources, settings, repository, prepare_only=False) → DB 작업 생성 후 manifest.
- resume_run(run_id, settings, repository) → DB 대기/실패 항목만 재개 후 manifest.
  검증된 결과 체크포인트가 있으면 모델을 재호출하지 않는다.
- parse_policy(source, settings, output, prepare_only=False) → 단일 공고 결과 dict.
  이 하위 함수만 직접 호출하면 DB에 쓰지 않는다.
- storage="json"만 명시적 오프라인 내보내기 (Path, manifest)를 반환한다.

DB_ENABLED=true와 python -m app.modules.storage init이 필요하다. DB 오류를 파일로 우회하지 않는다.
prepare_only는 원문/pending 작업만 DB에 저장하고 모델을 호출하지 않는다.
요약/6개 분야 분류는 별도 LLM 호출이며 미해결 조건에만 조건 추출 LLM을 추가 호출한다.
overview/analysis/canonical/부분 코드 결과와 근거를 보존한다. 모델 호출 중 트랜잭션을 잡지 않는다.
전송용 임시 파일은 사용 후 제거한다. 중복 입력 ID는 거부하고 부분 실패는 실패로 보고한다.

CLI: python -m app.modules.pipeline --input <JSON/XML> 또는 --resume <run_id>.
Windows scripts/parse-raw.ps1, macOS/Linux scripts/parse-raw.sh도 기본 MySQL을 사용한다.
[전체 실행·기존 JSON 이관·검증](../../../docs/policy-storage.md).
