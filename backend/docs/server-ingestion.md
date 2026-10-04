# 노트북 서버의 제한된 공고 수집과 재개

2026-10-02 구현. 같은 Windows 노트북에서 API와 MySQL을 운영하는 환경을 대상으로 합니다.
별도 CLI worker가 깨어 있는 동안 소량씩 처리하며 FastAPI 시작이나 HTTP 요청에서 수집을
자동 실행하지 않습니다. 검증된 새 개정의 공개 여부는 `POLICY_AUTO_PUBLISH`를 따릅니다.
현재 기본값 true는 자동 공개, false는 draft 저장이며 `matching_enabled=false`는 유지합니다.
기존 결과 재사용으로 수동 비공개 상태를 되돌리지 않습니다.

백엔드 `/`의 [서버 관리자 화면](server-admin.md)에서도 처리량·일일 한도·모델·검색·API 키를
설정하고 저장된 수집 현황·공고 변경·검색 후보를 확인할 수 있습니다. 화면 조회와 설정 저장은
worker나 Windows 스케줄을 실행하지 않습니다.

이번 작업에서는 실제 공고 수집, 실제 MySQL 연결/마이그레이션, Codex CLI 모델/검색 호출,
Windows 스케줄 등록을 실행하지 않았습니다. 아래 명령은 운영자가 서버에서 수행할 절차이며
오프라인 테스트 통과를 실제 서버·공급자·계정 검증으로 해석하지 않습니다.

## 서버에서 처음 확인할 순서

명령은 `backend` 디렉터리 기준입니다. 해당 노트북에 Python 환경, 실행 사용자 본인의
Codex 로그인, 별도로 실행 중인 MySQL이 필요합니다. API 키와 DB 비밀번호는 기존 `.env`에
설정하고 출력이나 작업 스케줄러 명령줄에 넣지 않습니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.ingestion --help
.\.venv\Scripts\python.exe -m app.modules.ingestion doctor
.\.venv\Scripts\python.exe -m app.modules.ingestion tick
```

`doctor`는 설정 유무만 출력하며 DB/외부 API/모델에 연결하지 않습니다. `tick`도 `--live`가
없으면 `disabled/explicit_live_flag_required`를 반환하며 DB 작업을 생성하지 않습니다.
설정 파일 자체가 잘못되면 이 단계에서도 실패할 수 있습니다.

`INGESTION_ENABLED=true`가 기본이며 실제 회차에는 별도로 `--live`가 필요합니다.
서버 관리 화면에서 **새 공고 수집 회차 허용**을 끄거나 파일에 `INGESTION_ENABLED=false`를
저장하면 이후 `tick --live`도 DB·HTTP·모델 작업 전에 `disabled/collection_disabled`로 종료합니다.
진행 중인 회차를 강제 종료하지 않으며 스위치를 다시 켜도 스케줄이 자동 등록되지는 않습니다.
환경변수로 지정한 값이 `.env`보다 우선하므로 화면에서는 그런 필드를 읽기 전용으로 표시합니다.

수집 스키마는 기존 저장소의 명시적 초기화 명령으로 적용합니다. 새
`database/007_policy_collection.sql`은 수집 상태·관측 원문·작업·호출 사용량·검색 후보를
추가하며 기존 정책/회원 테이블을 삭제하거나 초기화하지 않습니다. 초기화와 DB 검증은
실제 DB를 사용합니다. 자세한 기존 마이그레이션 규칙은 [공고 저장 안내](policy-storage.md)를
따릅니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.storage init
.\.venv\Scripts\python.exe -m app.modules.ingestion doctor --check-db
.\.venv\Scripts\python.exe -m app.modules.ingestion status
```

`doctor --check-db`의 `database_ready`는 필요한 테이블 조회 성공입니다. 공급자 응답,
실행 계정의 CLI 로그인, 모델 접근권한까지 확인한 결과는 아닙니다. DB 설정/스키마/접속이
없으면 실패하며 파일 저장소로 자동 우회하지 않습니다.

## 기존 공고부터 인덱싱

기존 MySQL 공고를 수집 기록에 연결하면 다음 수집에서 동일 내용을 비교할 수 있습니다.
`seed-existing`은 공고별 최신 개정을 최대 100개씩 읽고 원문·결과를 재검증해 수집 인덱스에
기록합니다. 외부 API나 모델은 호출하지 않습니다. 페이지 cursor를 저장하므로 `complete=true`가
될 때까지 같은 명령을 반복할 수 있습니다. 이미 관측한 수집 레코드는 덮어쓰지 않습니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.ingestion seed-existing --limit 100
```

이 명령도 worker 잠금을 사용합니다. 수집 worker가 실행 중이면 `busy/another_worker`를
반환하며 인덱스를 쓰지 않습니다. 저장 직전에 잠금 소유권을 다시 확인합니다.

저장 결과의 처리 signature가 현재 설정과 같으면 결과를 재사용합니다. signature가 없거나
다르면 기본적으로 추출 작업을 대기시킵니다. 예전 모델 결과를 다시 호출하지 않고 사용하려면
처음 인덱싱할 때 다음 선택을 명시합니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.ingestion seed-existing --limit 100 --adopt-legacy-results
```

`--adopt-legacy-results`는 signature가 없는 검증된 이전 결과의 사용을 명시적으로 선택합니다.
새 설정으로 재추출하지 않으므로 이전 모델·근거의 한계가 남습니다. 이미 다른 signature가
기록된 결과를 채택하거나 이전에 인덱싱한 대기 작업을 소급해서 완료시키는 옵션은 아닙니다.
기존 정책 개정과 공개 상태는 보존합니다. 반환값은 `indexed`, `reused`, `scanned`,
`complete`, `legacy_adoption`입니다.

## 제한된 서버 파일럿

실제 계정의 일일 허용량은 아직 확인하지 않았습니다. 내부 예산은 계정 쿼터를 늘리지 않으며
운영자가 다른 프로그램에서 사용한 호출량도 포함하지 않습니다. 최초에는 다음과 같이
대기 작업과 검색을 건너뛰고 공급자 페이지를 소량 확인한 뒤 API 응답시간을 기록합니다.

```powershell
$env:INGESTION_DISCOVERY_ENABLED = 'false'
.\.venv\Scripts\python.exe -m app.modules.ingestion tick --live --page-size 5 --max-pages 1 --max-jobs 0 --max-seconds 120 --max-http-calls 2 --max-model-calls 0 --max-tokens 0
.\.venv\Scripts\python.exe -m app.modules.ingestion status
```

이 환경변수는 현재 PowerShell 실행 환경에서 검색을 끄며 `.env`를 수정하지 않습니다.
`--max-jobs 0`이면 대기한 상세/추출 작업을 실행하지 않고 페이지만 확인합니다. 모델 예산
0만 지정하면 기존 추출 작업을 우선 처리하다 HTTP 요청 전에 예산에 걸릴 수 있습니다.
지원대상·기간·신청방법과 실제 CLI 접근을 확인한 후 작업/모델 한 번부터 검증합니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.ingestion tick --live --page-size 5 --max-pages 1 --max-jobs 1 --max-seconds 180 --max-http-calls 2 --max-model-calls 1 --max-tokens 20000
```

이 값은 출발용 제한이며 해당 노트북과 실제 계정에서 검증된 처리량은 아닙니다. API 요청
응답시간, worker의 `elapsed_seconds/http_calls/model_calls/tokens`, 작업 대기량, 메모리와
디스크 여유를 기록한 뒤 늘립니다. 페이지 크기와 상세·모델 처리 건수는 서로 다른 예산입니다.
API 응답이 느려지거나 실패가 늘면 회차 한도를 낮춥니다. 자동 부하 측정·적응형 배치 조절은
현재 구현에 포함하지 않습니다.

## 기본 예산과 스케줄

환경변수는 `core/config.py`의 `ingestion_*` 설정에 대응합니다. CLI의 회차 override는 해당
실행에만 적용하며 `.env`를 수정하지 않습니다.

| 항목 | 기본값 | 적용 범위 |
| --- | --- | --- |
| `INGESTION_ENABLED` | true | 다음 실제 수집 회차 허용. false는 이후 tick을 중지하며 진행 중인 회차는 유지 |
| 페이지 크기 | 50행 | 요청한 한 페이지, 설정 최대 100행 |
| `--max-pages` | 3 | 회차의 전체 공급자 페이지 합계 |
| `--max-jobs` | 5 | 상세·공고 원문·추출 작업 합계 |
| `--max-seconds` | 600초 | 회차 deadline, 모델 timeout도 남은 시간으로 축소 |
| `--max-http-calls` | 10 | 회차 HTTP 요청 합계 |
| `--max-model-calls` | 4 | 개요·조건·대체 모델·검색 CLI 시도 합계 |
| `--max-tokens` | 100,000 | 완료 event 사용량으로 후속 모델 호출을 중단 |
| 복지로/Gov24/추가 공고 일일 HTTP 예산 | 60 / 200 / 20 | 공급자별 서버 내부 한도 |
| 일일 모델 예산 | 20 | 검색을 포함한 모델 시도 |
| HTTP 간격 / 응답 상한 | 2초 / 2,000,000바이트 | 요청 간격과 단일 응답 제한 |
| 재스캔 / 상세·추가 공고 재확인 | 각 86,400초 | 성공한 전체 스캔 이후 또는 재확인 시점 |
| 대기열 / 실패 시도 한도 | 200작업 / 3회 | 대기열이 차면 추가 목록 스캔을 쉬고 실패 작업은 `dead` |
| 사용 가능 RAM / 빈 디스크 최소값 | 각 512MB | RAM은 Windows에서 확인, 부족하면 `paused` |

대기열 한도는 페이지 크기 이상이어야 합니다. 일일 사용량은 `Asia/Seoul` 날짜로 MySQL에
저장하고 호출 전에 예약합니다. 실패/중단한 시도도 예약분을 소비할 수 있어 노트북 재시작으로
예산이 초기화되지 않습니다. 실제 공급자의 쿼터 갱신 기준과 비용은 별도로 확인해야 합니다.
소스 키가 없는 공급자는 건너뜁니다.

Windows 스케줄러 명령은 저장소 루트에서 실행합니다.

```powershell
.\backend\scripts\ingestion-schedule.ps1 -Action Status
.\backend\scripts\ingestion-schedule.ps1 -Action Install
```

기본 Install은 **비활성 작업**을 등록하고 명령에도 `--live`를 넣지 않습니다. 서버 파일럿과
계정 한도를 확인한 뒤 활성 작업을 등록할 때만 다음 인수를 사용합니다. 같은 이름의 기존
작업은 자동 덮어쓰지 않으므로 변경할 때 Status로 확인하고 Remove 후 등록합니다.

```powershell
.\backend\scripts\ingestion-schedule.ps1 -Action Remove
.\backend\scripts\ingestion-schedule.ps1 -Action Install -EnableLiveCollection
```

스케줄러의 실행 상한은 11분으로 고정되어 있으므로 이 스크립트를 사용할 때
`INGESTION_MAX_SECONDS`는 기본 600초 이하로 유지합니다. 더 긴 수집은 스케줄의 실행 상한도
함께 조정해야 하며 강제 종료 후에는 기존 worker lease 만료를 기다립니다.

10분 간격, `IgnoreNew`, `StartWhenAvailable`, 최대 11분, 현재 로그인 사용자·일반 권한으로
실행합니다. AC 전원에서 시작하고 배터리로 전환하면 중단하는 Windows 기본 조건을 사용합니다.
API나 MySQL을 켜 주지 않으며 로그아웃·절전·종료 중에는 24시간 가동을 보장하지 않습니다.
다시 실행되면 마지막 저장 cursor와 작업 상태에서 이어가며 놓친 회차를 한꺼번에 처리하지
않습니다. 스크립트는 작업 stdout 파일을 별도로 보관하지 않습니다. LastTaskResult만으로
수집 품질을 판정하지 말고 CLI `status`의 저장된 worker 결과와 실패 목록을 함께 봅니다.

## 중복 방지·변경·중단 복구

원천 ID는 `(provider, external_id)`로 유지합니다. 의미 있는 제목·기관·URL·원문 필드의
`content_hash`는 수집시각·조회수를 제외하며, 모델/대체 모델·prompt·규칙·스키마·소스 코드·
지역 snapshot으로 처리 signature를 계산합니다. 동일 원천 ID/내용/signature의 작업은
유니크 `work_key`로 재사용하므로 모델 호출 전에 완료·대기 작업을 확인합니다. 역사적인
`source_hash` 계약은 유지합니다.

변경된 원문은 불변 snapshot과 `changed_fields`로 기록하고 새 추출 작업을 우선 배치합니다.
원본 응답은 `backend/data/collection/raw/`에 내용 hash별 파일로 저장합니다. 같은 내용의
재확인은 관측 시각만 갱신합니다. 목록 수정시각은 상세 재확인의 힌트이고, 목록이 같아도
재확인 시점이 되면 복지로 상세를 다시 조회합니다. Gov24는 상세/목록/지원조건을 독립 페이지로
스캔하고 `서비스ID`로 연결합니다. `JA*` 코드의 의미는 아직 확정하지 않아 자격을 추론하지
않습니다. 부분 실패나 목록에서 한 번 빠진 공고를 삭제·종료·미지원으로 확정하지 않습니다.

추가 공고 후보를 승인해 원문을 가져오면, 실제 페이지의 제목·URL·본문을 공통 `SourcePolicy`
형식으로 매핑합니다. 기관명은 검색 후보 값을 그대로 신뢰하지 않고 가져온 본문에 포함된 경우만
사용합니다. 공지 HTML에서 처음 20개의 HTTP(S) 링크(각 URL 최대 512자)와 인식 가능한
게시·수정 메타데이터를 함께 수집하고, 분석 프롬프트는
신청 기간·방법·신청 URL·문의처·게시일·수정일을 원문 인용과 함께 추출해 개정 overview에
보존합니다. 날짜 형식이 명확한 신청 시작·종료일만 기존 `policies.application_start/application_end`에
저장합니다. 복수 기간, 해석 불가한 일정, 상시 접수는 날짜 칼럼을 비워 두며 본문 원문은 그대로 보존합니다.
지원 조건과 요약은 원문을 분석·검증한 뒤 `condition_documents`/`condition_entries` 및
`policy_requirements`에 저장합니다. 첨부파일은 현재 URL/상태 메타데이터만 저장하고 본문은
가져오지 않습니다.

페이지의 원문/대기 작업과 다음 cursor는 함께 커밋합니다. worker와 각 작업의 lease를 MySQL에
저장하고, 다른 worker가 살아 있으면 `busy`를 반환합니다. 만료된 `running` 작업은 이후
회차에서 회수합니다. HTTP/모델 실행 동안 DB 트랜잭션을 유지하지 않습니다.

부분 스캔 중 페이지 크기를 바꾸면 page 1부터 다시 확인하고 같은 내용의 작업은 중복 제거로
재사용합니다. 공급자가 요청과 다른 effective `per_page`를 반환하면 `page_size_mismatch`로
거절해 cursor를 진행하지 않습니다. 실제 지원 크기를 확인해 `--page-size`를 명시적으로
조정합니다. 고정 크기의 offset 페이지도 원천 데이터 삭제·정렬 변경 중에는 누락될 수 있어
완료 후 기본 하루 간격의 전체 스캔으로 보완합니다. 누락만으로 공고를 삭제하지 않습니다.

검증된 개요, 실패한 모델 시도, 최종 검증 결과를 단계별 체크포인트에 기록합니다. 모델 결과가
저장돼 있으면 재호출을 생략하고 개정 저장을 재개합니다. DB 장애나 전원 종료가 체크포인트
커밋 전에 발생한 경우 해당 모델 호출의 재실행 가능성은 남습니다. 처리 signature가 바뀐
대기 작업은 자동으로 새 버전으로 바꾸지 않고 `processing_version_changed`로 분리합니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.ingestion changes --limit 20
.\.venv\Scripts\python.exe -m app.modules.ingestion retry-job <job_id>
```

`retry-job`은 `pending/dead` 작업만 다시 대기시키며 실행 중·완료 작업은 거절합니다.
완료 체크포인트와 모델 시도 이력을 보존하므로 두 모델이 모두 근거 검증에 실패한 작업은
단순 retry로 같은 모델을 계속 호출하지 않습니다. 입력/설정을 점검한 뒤 실패한 모델 시도를
의도적으로 다시 실행하려면 다음 선택을 명시합니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.ingestion retry-job <job_id> --restart-failed-models
```

이 옵션은 parse 작업에만 사용할 수 있으며 실패한 모델 시도 이력을 제거하고 검증된
개요·원문·signature를 유지합니다. 최종 검증된 초안 checkpoint가 있으면 모델 재시작을
거절하므로 기본 `retry-job`으로 저장을 재개합니다.
추가 모델 호출은 다음 `tick --live`의 예산 안에서 실행합니다. 승인/공개 상태를 변경하지
않습니다. `status`는 작업별 오류 코드·시도 수·다음 재시도 시각과 공급자별 사용량을 반환합니다.
비재시도 업무 오류/키 거절과 복지로 한도 오류는 공급자를 하루 차단하고 429 등은 backoff와
Retry-After를 반영합니다. worker 결과의 `budget_reached/paused/busy`는 처리 완료와 구분합니다.

## 복지로·Gov24 밖의 공고 검색

`INGESTION_DISCOVERY_ENABLED=false`가 기본값입니다. 켜면 기존 설정의 작은 Codex CLI 모델로
공식 사이트 후보를 하루 한 번 검색하고 DB에 `needs_review` 후보로 저장합니다. 기본 범위는
서울청년포털 `youth.seoul.go.kr`과 노원구 `www.nowon.kr`이며 정확한 호스트 허용 목록과 검색어를
설정에서 조정합니다. 현재 후보 검색은 이 범위의 발견을 돕는 기능이며 전국 공고가 누락되지
않았음을 검증하는 기능은 아닙니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.ingestion candidates --limit 20
.\.venv\Scripts\python.exe -m app.modules.ingestion queue-candidate <candidate_id>
```

URL 후보 중복은 정규 URL로 제거합니다. 기존 원문이 있는 레코드 중 DB가 반환한 첫 최대
1,000개와 공백/문장부호를 제거한 제목의 일치만 비교해 `possible_matches`를 표시합니다.
전체 DB의 의미적 중복 비교가 아니며 다른 제목의 동일 사업이나 비교 범위 밖 중복을 놓칠 수
있습니다. 제목 일치로 공고를 자동 병합하거나 API에 없다는 사실을 확정하지 않습니다.

후보를 확인하고 `queue-candidate`로 선택한 후에만 다음 worker가 원문을 수집합니다. 후보
검색 근거는 검색 요약 수준일 수 있으며 정책 근거는 다시 수집한 HTML에서 추출·검증합니다.
원문 요청은 HTTPS, 허용 호스트, 공개 DNS/IP, 고정 연결을 확인하고 각 redirect에서 허용 목록과
요청 예산을 다시 확인합니다. HTML 본문을 추출하며 PDF/HWP/HWPX는 링크와 `not_parsed` 상태만
보존합니다. 첨부에만 있는 자격·기간·서류는 아직 검증할 수 없어 첨부 파싱/기관별 어댑터가
후속입니다. `none_detected`도 현재 HTML 파서가 링크를 찾지 못했다는 의미입니다.

추출 CLI는 기존처럼 웹/도구를 차단하고 검색 CLI만 별도로 웹 검색을 허용합니다. 검색은
후보 최대 10개, 웹 도구 작업 최대 3개를 지시하고 event에서 초과가 관찰되면 프로세스를
종료합니다. 검색 요청이 이미 전송됐거나 event가 늦으면 비용의 엄격한 사전 상한이 되지
않습니다. token 예산도 완료 event의 사용량을 보고 다음 호출을 중단하는 soft limit입니다.
진행 중인 한 호출이 한도를 넘을 수 있고 실패/timeout 호출의 사용량이 보고되지 않을 수
있습니다. 엄격한 비용 제한에는 공급자 측 비용 한도나 별도 검색 API의 서버 한도가 필요합니다.

## 오프라인 검증과 남은 실서버 검증

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider app/modules/ingestion/tests app/modules/collectors/tests app/modules/discovery/tests app/modules/normalization/tests/test_raw.py tests/test_raw_parsing.py
```

격리 SQLite/HTTP·subprocess 대역으로 cursor 원자성, 동일 내용 재사용, 변경 snapshot,
호출 예산, lease/중단 복구, 체크포인트 재개, URL/DNS·첨부 경계를 검증합니다. SQLite는 이
테스트의 명시적 대역이며 서버 저장소는 MySQL만 허용합니다.

API의 HTTP timeout은 운영체제 DNS 조회 시간을 엄격하게 제한하지 못할 수 있습니다.
Windows 스케줄의 실행 상한이 추가 종료 경계입니다. 추가 공고 fetch의 DNS는 별도 제한합니다.

007의 실제 MySQL JSON/중복/행 잠금 검증은 아래 선택 테스트로 수행할 수 있습니다.
프로젝트 로컬 `bokji_compass_test`와 MySQL data 경로를 확인하며 생성한 테스트 ID만 정리합니다.
API/모델은 사용하지 않습니다. 이번 작업에서는 이 테스트를 실행하지 않았습니다.

```powershell
$env:BOKJI_TEST_MYSQL = '1'
.\.venv\Scripts\python.exe -m pytest tests/test_policy_database.py -k server_collection_mysql
Remove-Item Env:BOKJI_TEST_MYSQL
```

실제 노트북에서는 초기화/접속, 계정 쿼터, CLI 로그인·모델/검색 지원, 소량 실제 페이지와
상세의 ID 일치, API 동시 부하, 절전 후 재개를 파일럿 순서로 확인해야 합니다. 원문 삭제 정책,
첨부 본문 파싱, 전국 공식 출처 확대, 전체 DB 중복 검색, 변경 검토·공개 승인 화면은 후속입니다.
실제 MySQL 수집 통합 테스트는 별도 opt-in이며 기본 실행에서는 건너뜁니다. 이번 작업에서는
그 테스트를 포함한 실제 DB 실행을 하지 않았습니다.
