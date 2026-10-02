# 실제 공고 MySQL 저장과 DB 기반 개인 안내

2026-10-01 구현. 처리 결과의 기본 저장소는 MySQL이다. JSON은 명시적인 오프라인 내보내기만
지원하며 DB 장애 시 파일로 자동 대체하지 않는다.

## 실행

backend 디렉터리에서 실행한다. .env의 DB_ENABLED=true와 MySQL 접속 설정이 필요하다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.storage init
.\.venv\Scripts\python.exe -m app.modules.pipeline --input data/실제공고.xml
.\.venv\Scripts\python.exe -m app.modules.storage list --include-drafts
.\.venv\Scripts\python.exe -m app.modules.storage get <revision_id> --include-drafts
```

루트에서는 `backend/scripts/parse-raw.ps1 -InputPath data/실제공고.xml`을 사용한다.
macOS/Linux는 동일 모듈 또는 parse-raw.sh를 사용한다.
`--prepare-only`는 모델 호출 없이 원문과 pending 작업을 DB에 저장한다.
`python -m app.modules.pipeline --resume <run_id>`는 pending/failed 항목만 재개한다.
저장된 검증 결과가 있으면 LLM을 재호출하지 않는다. 이미 완료된 항목은 건너뛴다.
DB 전체 장애 시 결과 체크포인트도 저장하지 못할 수 있으며 성공으로 응답하지 않는다.
기존 pending 원문으로 재개할 수 있다. `--storage json`은 명시적 오프라인 내보내기다.

## 기존 JSON 이관

`python -m app.modules.storage import-drafts data/parsed_policies/<실행>/<공고>/draft.json`

명시한 파일만 원문·조건·근거를 재검증한다. v1은 현재 정규화기로 v2 canonical을 생성하되
논리 그룹은 자동 승인하지 않고 UNKNOWN을 유지한다. 원본 파일은 보존하며 LLM을 호출하지 않는다.
실패/대기 자료는 작업 기록으로만 저장하고 정상 공고 개정을 만들지 않는다.

## 저장 구조와 실패 처리

| 테이블 | 내용 |
|---|---|
| policy_schema_versions | 적용 SQL과 체크섬 |
| condition_region_snapshots / condition_regions | 공식 지역 스냅샷과 63,000행 |
| condition_documents | 원문 필드·해시·추출 결과·조건 논리·검토 상태 |
| condition_entries | 조건별 주체·값·단위·근거·필드 인덱스 |
| policy_revision_details | 제목·기관·분야·전체 처리 결과·설정·중복 방지 해시 |
| policy_ingestion_runs / policy_ingestion_items | 작업 상태·원문·결과·오류·개정 참조 |
| policies / policy_requirements | 001 호환 공고 원문·LLM 조건 근거 투영, source_key 기준 중복 방지 |

004/005/006 SQL은 명시적 초기화로 적용한다. 파싱/API 요청에서 테이블을 만들지 않는다.
초기화는 MySQL advisory lock과 체크섬을 사용한다. 기존 001 초안·계정 테이블은 수정하지 않는다.
적용 기록 없이 같은 이름의 테이블이 있거나 DDL 적용이 중간에 끊긴 경우 자동 삭제/덮어쓰기
없이 점검을 요구한다. MySQL DDL은 암묵적으로 커밋되므로 부분 적용은 관리자가 확인해야 한다.
지역 스냅샷 적재는 원자적 트랜잭션으로 처리한다.

source_json은 정규화된 원문 필드이며 원래 JSON/XML 전체 바이트는 수집 파일에 남긴다.
DB 결과 조회는 수집 파일에 의존하지 않는다. source_hash는 기존 수집 레코드 해시다.
Decimal 문자열을 보존하고 미기재 값은 SQL NULL로 저장하며 0으로 바꾸지 않는다.
원문·검증 결과·처리 설정이 같으면 개정을 재사용한다. 내용이 바뀌면 불변 개정을 추가한다.
개정·조건·항목 완료 상태를 함께 커밋하며 동시 중복은 유니크 제약과 SAVEPOINT로 처리한다.
모델 호출 중 트랜잭션을 잡지 않는다. 공개 목록은 공고별 최신 published 개정 한 건을 선택한다.
공개 승인 서비스는 후속이며 HTTP 요청에서 초안을 자동 공개하지 않는다.

모든 결과는 draft, matching_enabled=false다. 저장 성공은 공개 승인이나 자격 확정이 아니다.
기본 조회는 published_only=True이며 로컬 검토에서만 include-drafts를 사용한다.

기존 welfare-overview-v1 요약에는 policy_requirements가 없을 수 있다. 저장/이관 검증은
구형 계약으로 기존 인용을 검증하고 그대로 보존한다. 새 LLM 출력은 welfare-overview-v2의
policy_requirements를 필수로 받으며, 기존 자료에 요건을 추정해서 채우지 않는다.

## 개인 LLM 첫 연결

`python -m app.modules.assistant <revision_id> "지원 대상과 확인할 조건을 알려주세요" --include-drafts`

DB의 명시적인 공고 개정에서 원문을 읽는다. `--region 서울 --age-band "19~34세"`로 선택 정보를
전달할 수 있다. 질문/선택 프로필은 설정된 모델에 전달하며 매번 새 문맥을 사용한다.
답변 인용을 원문과 대조한다. 공통 공고 DB에 프로필/대화를 저장하지 않는다.
초안은 preview=true이고 자격 판정은 수행하지 않는다. 모델 전송 임시 파일은 사용 후 제거한다.
회원 HTTP API와 웹 공고별 질문 화면도 연결했다. 대화 이력·추천·알림은 후속이다.

## 공고·회원 질문 HTTP API

- `GET /v1/policies`: `items/total/nextCursor`. limit 1~100, cursor는 0~999999의 오프셋.
  q(공백으로 구분한 검색어 모두 포함), category/tag, region/audience, sort(recent/name).
  SQL에서 공개 개정별 최신 한 건을 선택한 후 필터·정렬·페이지를 적용한다.
  recent/date는 수집 개정 생성일이며 원문 게시일로 추정하지 않는다.
- `GET /v1/policies/{policy_key}`: 같은 공개 선택 기준의 공고 한 건, 없으면 404.
  웹 카드 계약의 `id`는 안정적인 policy_key이며 `revisionId`는 질문할 개정이다.
- `POST /v1/assistant/questions`: `{ "revision_id": "UUID", "question": "질문" }`.
  `X-Auth-Request: 1`과 웹 세션 쿠키 또는 모바일 Bearer 토큰이 필요하다.
  명시한 Authorization이 잘못되면 정상 쿠키가 있어도 401이다.
  서버가 계정의 지역과 10년 단위 연령대만 모델 프로필로 전달한다.
  사용자 지정 profile/account_id/include_drafts는 422로 거절한다.
  답변은 원문 인용을 재검증하고, 생성 중 비공개된 개정의 답변도 반환하지 않는다.

지역/대상 필터는 검증된 개요의 명시적 텍스트 검색이며 자격 판정이 아니다.
불명확한 지역은 전국으로 간주하지 않는다. 원문 링크가 없으면 null을 유지한다.
DB 미설정/장애는 503, 정상 DB에 공개 공고가 없으면 200 빈 목록이다.
실제 수집 공고는 검토 전 draft 상태를 유지하므로 현재 회원 목록은 비어 있을 수 있다.

질문은 2,000자, 회원당 분당 6회, 서버 프로세스당 동시 2개, 모델 60초로 제한한다.
수집용 모델 제한과 독립적이다. 프록시 응답 제한은 75초 이상을 권장한다.
응답은 no-store이며 질문과 답변은 공통 DB나 브라우저 저장소에 저장하지 않는다.
웹은 공고/회원 전환·화면 종료 시 요청을 취소하고 이전 답변을 제거한다.
브라우저 취소가 서버 추론을 즉시 중단시키지는 않으며 서버는 제한 시간 안에 종료한다.
운영 큐·다중 프로세스 전체 동시성 제어·감사 가능한 공개 승인 절차는 후속이다.
DB를 끈 개발 공유 터널은 회원 공고/질문 서비스를 제공하지 않는다.

## 더미 데이터 정리

웹 런타임의 demoPolicies/예시 추천과 개발 DB용 002_seed.sql을 제거했다.
개발/운영 모두 API를 사용하며 기존 demo 설정도 API로 전환한다. 다음 앱 실행 시 알려진 demo
저장 키와 demo- ID 항목을 제거한다. 테스트 응답 대역은 tests/fixtures에서만 사용한다.
서비스 DB에는 실제 공고만 적재한다. 미공개 공고만 있거나 추천 API 연결 전에는 웹이 빈/오류 상태를 표시하며
예시 공고로 대체하지 않는다.

## 검증

기본 `python -m pytest`는 외부 DB/LLM을 호출하지 않는다.
Windows에서 `$env:BOKJI_TEST_MYSQL='1'` 설정 후
`python -m pytest tests/test_policy_database.py`로 실제 MySQL 검증을 수행한다.
프로젝트 로컬 MySQL data 경로와 bokji_compass_test를 확인하며 다른 DB에서는 중단한다.
테스트가 생성한 실행/개정 ID만 종료 시 삭제한다. 중복·개정·공개 경계·롤백·동시 입력·NULL·
부분 실패·체크포인트 재개를 검증한다. 실제 공고/LLM 실증은 worklog.md에 기록한다.
