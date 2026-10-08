# 공개 공고 내용의 다국어 번역

웹/앱의 한국어 원문 공고를 영어·중국어 간체·베트남어·일본어로 제공한다.
정책/조건의 정식 데이터는 한국어 원본을 유지하고, 표시용 번역을 별도 저장한다.

## 실행 준비

기존 MySQL 설정과 Codex CLI 로그인·모델 설정을 사용한다. 신규 외부 서비스 키는 필요 없다.
백엔드 디렉터리에서 기존 명시적 초기화 명령을 실행하면 011 마이그레이션이
`policy_translations`·`policy_translation_usage`를 추가한다. 기존 공고와 회원 행은 변경하지 않는다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.storage init
```

| 설정 | 기본 | 역할 |
| --- | --- | --- |
| `POLICY_TRANSLATION_ENABLED` | true | false이면 외국어 요청 503, 한국어 원문은 조회 가능 |
| `POLICY_TRANSLATION_DAILY_CALLS` | 100 | 정책 DB 전체의 UTC 날짜별 생성 시도 한도; 0은 새 생성만 중지 |
| `POLICY_TRANSLATION_MAX_INPUT_CHARS` | 120000 | 공개 표시 데이터 문자 한도; 초과 시 원문 절단 없이 503 |
| `CODEX_EXECUTABLE`, `CODEX_MODEL`, `CODEX_REASONING_EFFORT` | 기존 설정 | 기존 CLI와 모델 사용 |
| `CODEX_TIMEOUT_SECONDS` | 300 | 공고 번역에서는 최대 60초로 제한; 자동 재시도 없음 |

생성 슬롯은 프로세스당 1건이다. 일일 호출 수는 DB의 원자적 예약으로 재시작·여러 프로세스에
유지되며 실패·시간 초과·출력 거절도 차감한다. 캐시 조회에는 생성 한도가 적용되지 않는다.

## HTTP 계약

공개 `GET /v1/policies/{policy_key}/translation?language=en`.
`language`는 `ko/en/zh/vi/ja` 중 필수 1개다. 다른 쿼리·중복 언어·GET 본문은 422로 거절한다.
로그인이나 개인정보를 받지 않는다. `ko`는 LLM·번역 캐시를 사용하지 않는다.

성공 응답은 `policy_id`, `revision_id`, `language`, `source_language:"ko"`,
`source_hash`, `translation`, `cached`다. `source_hash`는 현재 공개 표시 데이터의 SHA-256이다.
`translation`은 다음 표시 필드를 모두 포함하고 원문에서 없는 값은 빈 문자열/null을 유지한다.

```text
title, summary, audience, organization, benefit, applicationPeriod,
paymentSchedule, content, gender, contact, applicationMethod,
otherConditions:string[], sourceFields:Record<string,string>, budgetNotice
```

`paymentSchedule`·`budgetNotice`는 null일 수 있다. `sourceFields` 키와 `otherConditions` 순서/
개수는 원문과 같다. ID·분야/지역/태그·신청 시작/종료 기계 날짜·출처/신청 URL·조회수·예산
수치·자격 조건 모델은 번역 대상에 포함하지 않는다. 클라이언트는 응답의 공고 ID·개정 ID를
현재 원문과 대조하고 표시 필드만 적용해야 한다. 번역 성공 전에는 원문을 유지한다.

| 상태 | `detail.code` | 의미 |
| --- | --- | --- |
| 404 | `policy_not_found` | 공개 공고 없음, 생성 중 개정 변경 또는 공개 취소 |
| 422 | `translation_invalid_request` | 언어/ID 형식·쿼리·본문 입력 거절 |
| 429 | `translation_busy` | 슬롯 또는 일일 생성 한도 소진; `Retry-After` 참고 |
| 503 | `translation_unavailable` | 비활성·미초기화 DB·CLI/인증·시간 초과·크기/출력 검증 실패 |

오류는 원문·입력·CLI 메시지를 반영하지 않는다. 모든 응답은 HTTP `Cache-Control: no-store`이며
DB 캐시만 재사용한다. 공개 취소 여부를 요청마다 확인하므로 이전 HTTP 응답을 재사용하지 않는다.
변경 감지는 개정 ID·내용 해시·언어·`policy-display-translation-v1` 프롬프트 버전으로 수행한다.

숫자·숫자 날짜·URL·이메일, 원문 필드 키·조건 개수·null·빈 값 보존을 검증한다. 번역의 모든
의미·누락을 자동 판정하는 기능은 아니며 자격 판정이나 신청 승인으로 사용하지 않는다.
문장 괄호·한국어 조사와 링크를 구분할 때는 ASCII URL 뒤에 붙은 알려진 조사만 분리한다.
일반 한국어 경로/쿼리 값과 URL 안의 균형 잡힌 괄호는 그대로 비교한다. 실제 URL 끝이
ASCII+조사 형태인 경우에는 문장 조사와 구분이 모호하므로 이 휴리스틱의 한계로 남는다.

검증은 [모듈 안내](../app/modules/policy_translation/readme.md)와
`tests/test_policy_translation.py`를 따른다. 외부 모델을 호출하지 않는 SQLite/API 테스트와
실제 MySQL/CLI 운영 확인을 구분한다. API 명세는 실행 서버의 `/openapi.json`에서 생성한다.
