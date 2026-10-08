# ingestion

2026-10-07: 광운대학교 등록/장학 목록·전용 상세를 자동 수집에 연결했습니다.
`INGESTION_KWANGWOON_ENABLED=true`가 기본이며 API 키·외부 검색 없이 확인합니다.
`repository.observe_notice_listing(connection, row, now, recheck_seconds) -> int`는
목록과 기존 URL 식별자를 보존하고 상세 작업을 같은 트랜잭션에 등록하며 새 등록 건수를
반환합니다. 고정 공지 중복·수정일 변경·cursor 재개를 처리합니다.
[설정·원문 모드·실제 검증](../../../docs/kwangwoon-auto-collection.md).

2026-10-06: `INGESTION_PROFILE=bootstrap|steady|custom`과 관리자 자동 수집 프리셋 추가.
bootstrap은 원문·상세 우선 확보 후 묶음 AI 처리, 완료 다음 회차부터 steady 예산 전환.
steady는 원문 확인 후 분석한다. 공급자별로 여러 페이지를 순환하며 회차 페이지 예산을 사용한다.
`seed-existing --all` 및 관리 화면 전체 연결은 100건 커밋·lease 갱신을 끝까지 반복한다.
[프리셋 수치·Codex 모델·토큰 최적화 근거](../../../docs/ingestion-tuning.md).

담당: Codex. 서버에서 제한된 목록 수집·상세 확인·변경 감지·모델 처리와 재개를 관리합니다.
FastAPI와 분리된 CLI이며 import나 API 서버 시작만으로 외부 요청을 하지 않습니다.
기존 정책 개정과 공개 계약을 유지합니다. 기본 `POLICY_AUTO_PUBLISH=true`로 검증된 새 수집 결과는 저장 시 자동 공개합니다. false이면 초안으로 유지합니다. 원문·분석 JSON은 보존하며 자격 판정을 자동 활성화하지 않습니다.

구현 계약: `public.run_tick(settings, store, ...) -> dict`는 건수·HTTP·시간·모델
예산 내에서 한 회차를 처리합니다. `python -m app.modules.ingestion tick`은 기본 비활성
점검이며 `--live`를 명시해야 실제 공급자/모델을 호출합니다. DB 초기화는 기존 storage init을
명시적으로 실행합니다. 실제 운영 계정 한도와 서버 검증은 오프라인 테스트와 구분합니다.

Windows 노트북은 작업 스케줄러가 회차를 실행합니다. 꺼져 있던 시간의 실행을 모두 재생하지
않으며 마지막 커밋된 페이지부터 소량씩 재개합니다. 작업 잠금·중간 결과·일일 예산은 MySQL에
저장하고 HTTP/모델 실행 중 DB 트랜잭션을 유지하지 않습니다.

수집 시각/조회수는 내용 해시에서 제외합니다. 기존 `source_hash` 의미와 004~006 SQL을
변경하지 않고 별도 007 마이그레이션을 추가합니다. 웹 탐색 결과는 후보 목록이며
공식 원문을 확인하고 수집 대상으로 선택하는 단계가 필요합니다.

## 공개 함수와 저장소

`popularity.listing_popularity(provider, listing) -> {views,source,basis,asOf} | None`은 저장된
Gov24·복지로 목록의 누적 조회수를 검증하는 순수 함수입니다.
`popularity.view_count_expression(table, dialect="mysql")`는 같은 검증의 SQL 표현식을
반환하며 전체 공고의 인기순 정렬을 페이지 분할 전에 처리합니다. 외부 호출·DB 변경이 없고
`public.load_popularity(repository, policy_keys)`도 같은 파서를 사용합니다.
[자료형·범위·관측 시각·검증 방법](../../../docs/policy-popularity.md).

`run_tick(settings, store, policy_repository, *, adapters=None, parser=None,
discovery_fn=None, notice_fetcher=None, raw_root=None) -> dict`는 기존 대기 작업을 먼저 처리하고
독립 공급자 페이지를 조회한 뒤 남은 예산으로 작업과 선택적 검색을 수행합니다. `adapters`,
`parser`, `discovery_fn`, `notice_fetcher`는 오프라인 대역을 주입하는 인수입니다. 실제 실행은
HTTP·원본 파일 저장·MySQL 읽기/쓰기·설정 Codex CLI를 사용합니다.

반환값은 `status`, `pages`, `jobs_completed`, `new`, `changed`, `unchanged`, `errors`와
`http_calls`, `model_calls`, `tokens`, `elapsed_seconds`입니다. 잠금이 겹치면 `busy`와
`another_worker`를 반환합니다. `budget_reached`, `paused`는 후속 회차가 필요한 상태입니다.
DB/lease 오류는 실패로 전달하며 성공이나 파일 우회로 바꾸지 않습니다.

모델 호출·일일 모델 호출·토큰 예산이 소진되면 분석 작업은 체크포인트를 유지해 대기시키고,
남은 회차의 페이지·작업·HTTP·시간 예산으로 목록과 원문 수집을 계속합니다. 반환값은 분석이
남았음을 표시하도록 `budget_reached`와 해당 모델 예산 사유를 유지합니다. HTTP나 시간 예산이
소진되면 원문 수집도 중단하며, 소진된 모델을 같은 회차에서 다시 호출하지 않습니다.

`IngestionRepository(engine)`는 MySQL만 허용합니다. 테스트에서만
`allow_sqlite_for_tests=True`로 격리 SQLite를 사용할 수 있습니다. `check_schema()`는 테이블을
조회하며 생성하지 않습니다. 007 수집 테이블은 `python -m app.modules.storage init`으로
명시적으로 적용합니다.

## CLI 계약

명령은 backend 디렉터리 기준이며 `--help`는 DB/외부 호출 없이 확인할 수 있습니다.

| 명령 | 입력/반환과 부작용 |
| --- | --- |
| `doctor` | 설정 유무만 확인. DB·API·모델 호출 없음 |
| `doctor --check-db` | 실제 MySQL 수집/정책 스키마 조회. 공급자·CLI 검증은 별도 |
| `tick` | `disabled` 반환. DB 연결·작업 생성·외부 호출 없음 |
| `tick --live` | 제한된 한 회차 실행. 아래 회차 인수 override 가능 |
| `status` | MySQL 작업 상태·오류·cursor·최근 worker 결과·사용량 조회 |
| `changes --limit 20` | 변경 snapshot의 원천 ID·이전 snapshot·변경 필드 조회 |
| `candidates --limit 20` | 검색 후보·가능한 제목 중복 조회 |
| `queue-candidate <candidate_id>` | 선택 후보의 원문 수집 작업을 DB에 대기시킴 |
| `retry-job <job_id>` | pending/dead 작업의 재시도 상태 갱신. 완료 체크포인트 보존 |
| `retry-job <job_id> --restart-failed-models` | 실패 모델 시도 이력을 명시적으로 제거하고 재대기. 검증된 개요·원문·signature 보존 |
| `seed-existing --limit 100` | 기존 공고별 최신 개정을 수집 인덱스에 기록. 외부/모델 호출 없음 |
| `seed-existing --adopt-legacy-results` | signature 없는 검증된 이전 결과의 재사용을 명시적으로 선택 |

`candidates/changes/seed-existing`의 `--limit`은 1~100입니다. 회차 옵션은 `--page-size`,
`--max-pages`, `--max-jobs`,
`--max-seconds`, `--max-http-calls`, `--max-model-calls`, `--max-tokens`입니다. 전체 운영 절차와
정확한 기본값은 [서버 수집 안내](../../../docs/server-ingestion.md)에 있습니다.

## 중복과 재개 범위

페이지 cursor와 관측/대기 작업은 같은 트랜잭션으로 커밋합니다. worker/작업 lease가 만료되면
다음 회차에서 실행 중 항목을 회수합니다. 같은 원천 ID·내용 hash·처리 signature의 작업은
유니크 키로 재사용합니다. 변경 내용은 별도 snapshot과 검토용 개정으로 저장합니다.
원본은 `data/collection/raw`에 내용 hash별로 보존합니다.
부분 스캔에서 페이지 크기를 바꾸면 page 1로 재시작하고 내용 중복을 재사용합니다. 공급자
effective 페이지 크기가 요청과 다르면 `page_size_mismatch`로 거절해 cursor를 보존합니다.
원천의 삭제/정렬 변화에 따른 offset 누락은 다음 전체 재스캔으로 보완하고 부재 삭제는 하지
않습니다.

이미 검증된 개요/최종 결과가 DB checkpoint에 있으면 모델을 다시 호출하지 않습니다.
품질 검증에 실패한 모델 시도도 보존하므로 양쪽 모델 실패 뒤 단순 retry가 반복 호출을
만들지 않습니다. 필요할 때 `--restart-failed-models`로 다시 호출하는 선택을 명시합니다.
DB/전원 장애가 checkpoint 커밋 전에 발생하면 해당 모델 작업이 다시 실행될 수 있습니다.

`seed-existing` CLI도 worker 잠금을 공유하고 쓰기 직전에 소유권을 확인합니다. 동시에 수집이
실행 중이면 `busy`로 반환합니다. 저장 cursor 이후의 최신 공고를 한 번에 최대 100개씩 검증합니다. 같은
signature만 기본 재사용하고 signature 없는 이전 결과 채택은 첫 인덱싱에서 명시합니다.
이미 관측한 레코드는 덮어쓰지 않으며 기존 정책 개정·공개 상태는 바꾸지 않습니다.

## 제한과 후속 작업

회차 600초·HTTP 10회·모델 4회·5작업, 일일 복지로 60/Gov24 200/추가 공고 20/모델 20은
내부 기본 예산입니다. 계정 쿼터와 실제 노트북 부하로 검증된 값은 아닙니다. 일일 예산은
Asia/Seoul 날짜로 영속 저장합니다. token/search 제한은 event를 관찰해 후속 호출을 멈추는
soft limit이며 이미 실행 중인 요청의 비용을 엄격하게 제한하지 못합니다.

discovery는 기본 비활성이고 후보 선택 후에만 원문을 수집합니다. 후보 제목 비교는 DB가
반환한 최대 1,000개와의 단순 제목 일치이며 전국/전체 DB 중복 검증이 아닙니다. HTML 공고와
첨부 링크를 보존하고 PDF/HWP/HWPX 본문은 후속입니다. Gov24 JA 코드를 자격으로 추론하거나
목록 누락을 삭제로 확정하지 않습니다. 모든 새 결과는 미공개 초안입니다.

오프라인 검증: `python -m pytest -p no:cacheprovider app/modules/ingestion/tests`.
이번 작업의 실제 수집·MySQL 적용/접속·CLI 모델/검색·스케줄 등록은 미실행입니다.

## 출처 누적 조회수

`public.load_popularity(repository, policy_keys)`는 현재 수집 목록의 Gov24 `조회수`·복지로
`inqNum`을 검증해 `{policy_key: {views, source, basis, asOf}}`로 반환합니다. 기존 목록 수집은
DB용 복사본에 `_views_observed_at`을 기록하며 원본 행은 수정하지 않습니다. 조회수·관측 시각
변경은 정책 내용 해시와 분석 작업을 바꾸지 않습니다. 관측 시각이 없는 기존 목록은
`asOf=null`이며 최근 관심량으로 표시하지 않습니다.
[표시 의미·예산 데이터의 한계·검증](../../../docs/policy-popularity.md).
