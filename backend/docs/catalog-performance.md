# 공고 상세 필터 성능·정확성 점검

2026-10-08. 기존 작업을 유지하면서 공개 공고 조회 경로를 수정했습니다.

## 변경

- `catalog.list_policies`의 자연어 순위 계산이 없는 상세 필터 경로는 전체 결과를
  리스트로 쌓지 않고, 전체 건수를 계산하면서 요청한 페이지의 행만 보관합니다.
  SQL의 정렬, 전체 건수, offset, nextCursor와 공개 개정 선택은 그대로 유지됩니다.
  DB 드라이버의 100행 스트리밍 버퍼는 별도로 사용합니다. 자연어 검색은 전체 결과의
  관련도 정렬이 필요하므로 기존 경로를 유지합니다.
- `explorer_filters.filter_records`는 나이 조건을 먼저 적용하고, 상태 필터를 위해
  전체 카드의 문구·금액·출처를 가공하던 작업을 일정 계산으로 대체합니다.
  일정의 반복 기준은 같은 요청의 한국 시간 날짜를 사용합니다.
- `notice_status(policy, record, today)`는 `applicationWindows`의 개별 회차를
  확인합니다. 10월 2~4일과 10~12일에만 접수하면 8일은 `upcoming`입니다.
  전체 기간 2~12일을 하나의 접수 기간으로 판단하던 오류를 수정했습니다.
  경계일은 포함하며, 원문의 명시적 선정·지급 상태는 계속 우선합니다.

## 측정

실제 회원·공고 데이터 없이 SQLite 메모리 DB에 합성 공고 1,500개를 넣었습니다.
각 원문에는 `지원 설명 `을 800회 반복하고, 모두 상시 접수로 설정했습니다.
`status='open', limit=6, offset=700`의 응답은 수정 전후 동일했습니다.

| 지표 | 수정 전 | 수정 후 |
| --- | ---: | ---: |
| tracemalloc 최대 Python 할당량 | 17.13 MiB | 2.26 MiB |
| 계측 실행 시간 | 7.022초 | 2.823초 |

Python 할당량은 약 87% 감소했습니다. tracemalloc 계측 및 다른 테스트가 실행 중인
로컬 환경에서 한 번 비교한 결과입니다. MySQL 서버·드라이버의 전체 메모리나 운영
응답 지연을 측정한 값은 아니며, 운영 성능 수치로 일반화하지 않습니다.

## 검증

- 추가 회귀 검사에서 수정 전 회차 공백을 `open`으로 판단하는 문제를 재현했습니다.
- 첫 페이지·중간 페이지·마지막 페이지·범위를 벗어난 페이지의 건수와 커서를 확인합니다.
- 상태 필터가 전체 카드 가공을 호출하지 않는지 확인합니다.
- 관련 검색·매칭·캘린더 테스트: 90개 통과, MySQL 선택 검사 1개 건너뜀.
- 변경 Python 파일 Ruff 통과.
- 전체 백엔드 검사: 2,070개 통과, 선택 검사 57개 건너뜀. 기존 비회원 대화 API
  `/v1/assistant/chat/dialogue`가 OpenAPI 경로 목록 테스트에 빠져 1개 실패했습니다.
  현재 구현된 경로를 기대 목록에 반영한 뒤 `tests/test_bootstrap.py`의 8개를
  재실행하여 모두 통과했습니다. 제품 API는 수정하지 않았고 전체 검사를 반복하지는
  않았습니다. 선택 검사에 필요한 실제 MySQL·외부 서비스 검증은 포함하지 않습니다.

재실행 명령(backend 폴더):

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_explorer_filters.py tests/test_policy_search.py tests/test_matching.py app/modules/storage/tests/test_calendar_months.py -q
.\.venv\Scripts\python.exe -m ruff check app/modules/storage/catalog.py app/modules/storage/explorer_filters.py tests/test_explorer_filters.py
```

웹의 인증 전달 수정과 화면 분할은 [프런트엔드 기록](../../frontend/docs/performance-review.md)을 참고합니다.
