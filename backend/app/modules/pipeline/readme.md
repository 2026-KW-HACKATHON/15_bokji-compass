# 원문 처리 파이프라인

2026-10-06: 서버 수집 프리셋은 `batching.parse_policy_batch`로 최대 4건의 요약+조건을
한 호출로 처리한다. 코드로 조건을 완료한 공고는 요약만 요청하며 검증 실패 공고만 상위
모델로 재처리한다. 공고별 checkpoint/근거 검증과 shared usage 1회 집계를 유지한다.
기존 단건 parse_policy 계약은 유지한다. [모드·예산·근거](../../../docs/ingestion-tuning.md).

2026-10-02: MySQL 저장 시 `POLICY_AUTO_PUBLISH=true` 기본값에 따라 검증된 새 개정은 자동 공개합니다. 순수 parse_policy/JSON 내보내기의 결과는 기존 draft 형식을 유지합니다. false는 수동 승인 방식이며 미검증 failed/pending은 공개하지 않습니다.

담당: 백엔드. 원문 → 코드/LLM 추출 → 근거 검증 → MySQL 저장.

- parse_raw_files(paths, settings=None, output_root=None, prepare_only=False, storage="mysql")
  → 기본 (None, manifest). manifest에는 run_id/storage/status/records가 들어간다.
- persist_sources(sources, settings, repository, prepare_only=False) → DB 작업 생성 후 manifest.
- resume_run(run_id, settings, repository, max_items=None, budget=None)
  → DB 대기/실패 항목만 재개 후 manifest. max_items는 DB 조회 시 한도를 적용한다.
  검증된 결과 체크포인트가 있으면 모델을 재호출하지 않는다.
- parse_policy(source, settings, output, prepare_only=False, budget=None,
  checkpoint=None, save_checkpoint=None) → 단일 공고 결과 dict.
  이 하위 함수만 직접 호출하면 DB에 쓰지 않는다.
  save_checkpoint(full_draft)는 단계별 실패 시도·검증된 요약·완료 결과를 즉시 전달한다.
  중간 결과는 pending이며 요약 검증 후 overview_status=validated이다.
  성공한 완료 결과는 needs_review이며 모델 실패 결과는 failed이다.
  검증 실패 시 attempts/overview_attempts의 error에 최대 300자 진단을 추가합니다.
  Pydantic 필드 경로·기본 오류 문구만 남기고 입력값·context·사용자 정의 예외 문구는 제외합니다.
  일반 ValueError는 예외 유형만 기록합니다. 반환 상태와 fallback/예산 동작은 유지합니다.
  같은 원문과 처리 signature인 checkpoint를 다시 검증한 후 재사용한다.
- processing_signature(settings) → 모델/추론/프롬프트/코드/스키마/정규화/지역
  스냅샷과 hash를 포함하는 dict. 실행 ID·timeout·실행 파일 경로는 제외한다.
- storage="json"만 명시적 오프라인 내보내기 (Path, manifest)를 반환한다.

DB_ENABLED=true와 python -m app.modules.storage init이 필요하다. DB 오류를 파일로 우회하지 않는다.
prepare_only는 원문/pending 작업만 DB에 저장하고 모델을 호출하지 않는다.
요약/8개 분야 분류는 별도 LLM 호출이며 미해결 조건에만 조건 추출 LLM을 추가 호출한다.
overview/analysis/canonical/부분 코드 결과와 근거를 보존한다. 모델 호출 중 트랜잭션을 잡지 않는다.
전송용 임시 파일은 사용 후 제거한다. 중복 입력 ID는 거부하고 부분 실패는 실패로 보고한다.

CLI: python -m app.modules.pipeline --input <JSON/XML> 또는 --resume <run_id>.
Windows scripts/parse-raw.ps1, macOS/Linux scripts/parse-raw.sh도 기본 MySQL을 사용한다.
[전체 실행·기존 JSON 이관·검증](../../../docs/policy-storage.md).

## 서버에서 한정량 재개

작업 스케줄러나 수집 worker에서 MySQL 작업을 다음처럼 재개할 수 있다.

```powershell
python -m app.modules.pipeline --resume <run_id> --max-items 1 --max-seconds 600 --max-model-calls 4 --max-tokens 100000
```

`--max-items`는 1~10000, `--max-seconds`는 최소 10초이다. 전체 마감까지 남은 시간을
각 CLI 모델 호출의 timeout에 반영한다. 모델 수에는 요약·조건·검증 fallback 시도가
모두 포함된다. 예산 소진은 분석 실패로 저장하지 않고 pending 상태로 다음 실행을 기다린다.
manifest의 `budget_exhausted`는 deadline/model_calls/tokens 중 중단 사유다.
`--input`에도 같은 한도를 적용할 수 있으며 제한 실행은 MySQL 저장만 지원한다.

`WorkBudget(deadline, max_model_calls=4, max_tokens=100000)`의 deadline은
`time.monotonic()` 기준 절대 시각이다. `before_model(settings)`는 호출 슬롯을 예약하고
timeout을 줄인 Settings를 반환하며 `record(metadata)`는 보고된 입력/출력 토큰을 누적한다.
호출/토큰 한도 0은 모델 실행을 막는다. `BudgetExhausted`는 worker 재대기 신호다.
토큰은 완료된 호출의 사용량을 집계해 다음 호출을 막는 한도이며 단일 응답의 토큰 수를
강제로 제한하지 않는다. CLI 종료·로컬 검증·DB 저장 시간은 모델 deadline 외 추가 시간이
필요할 수 있으므로 스케줄러 종료 제한에는 여유를 둔다.

기존 무제한 재개는 기존 호환 동작을 유지한다. 제한 재개는 요약 checkpoint를 MySQL에
즉시 저장하므로 조건 추출 전 예산이 끝나도 요약을 반복하지 않는다. 작업 lease와 중복
실행 방지는 상위 수집 worker가 담당한다.

품질 검증에 실패한 모델 시도도 checkpoint에 보존한다. 다음 실행에서는 해당 모델을
반복하지 않고 다음 fallback 모델부터 이어간다. 모든 모델이 검증에 실패하면 failed로
종료하므로 작은 호출 예산에서 같은 모델의 검증 실패를 끝없이 반복하지 않는다.
전송·인증 실패와 실제 CLI timeout은 같은 모델로 다음 실행에서 재시도할 수 있으며
서버 worker의 최대 시도 횟수를 따른다. 남은 시간으로 줄인 timeout도 실제 호출을
시작했다면 실패 시도에 포함한다. 호출 전 예산 부족만 실패 횟수 없이 다음 실행을
기다린다. 제한/서버 흐름에서는 필수 요약 실패도 공고 실패로 기록한다.
기존 무제한 수동 호출에서는 요약이 없어도 조건 결과가 검토용 needs_review가 될 수
있는 이전 계약을 유지한다. 어느 경우에도 공개 승인이나 자격 판정은 하지 않는다.

검증: `python -m pytest tests/test_pipeline_budget.py tests/test_raw_parsing.py`.
합성 대역으로 timeout 축소·fallback 호출 집계·토큰 집계·단계 재사용·잘못된 근거·예산
소진의 대기 상태를 확인한다. 실제 서버/DB/모델 수집 검증과는 구분한다.
