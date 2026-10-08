# 신청 기간 해석과 공식 근거 보강

2026-10-08. 원문과 CLI 추출의 신청 기간이 날짜 변환에서 누락되던 문제를 보완했습니다.

## 날짜를 처리하는 범위

| 원문 | 달력에 적용하는 내용 |
| --- | --- |
| 매년 4월 말까지 | 조회 연도의 4월 30일 마감. 명시되지 않은 시작일은 null |
| 매월 말일 | 조회 월의 실제 마지막 날, 윤년 2월은 29일 |
| 3~4월 | 3월 1일 시작, 4월 30일 마감 |
| 연도 없는 월일 범위 | 조회 연도에 적용, 명시된 연도는 우선 보존 |
| 1분기, 상반기 | 해당 분기/반기의 첫날부터 마지막 날 |
| 분기별 신청(매분기말 다음달) | 1·4·7·10월 각각의 접수 기간 |
| 여러 모집 회차/서로 떨어진 월 | applicationWindows에 각 기간 보존. 사이 공백은 접수 기간에서 제외 |
| 상시·연중 수시 | ongoing. 개인 사건 기준 마감은 상시로 단순화하지 않음 |

`applicationRecurrence`는 yearly/monthly, `applicationPrecision=month_end`는 월말 마감을 나타냅니다.
캘린더·상세·번역에서도 조회 연도와 선택한 회차를 유지합니다. D-Day는 해당 마감일과 한국 날짜로 계산합니다.
사업연도와 접수연도를 혼동하지 않습니다. 이전 연도가 명시된 공고는 그 연도의 달력에 남깁니다.

## CLI 정규화와 저장 검증

신규 개요 추출은 원문 `application_period.text/evidence`와 별도의 `calendar_expression`을
함께 반환합니다. 예를 들어 `2026.1. ~ 12.(예산 상황에 따라 변경 가능)`의 원문을 보존하면서
달력에는 검증된 `2026년 1~12월`을 사용합니다. 모든 CLI 출력 스키마는 nullable 항목도
required에 포함시켜 실제 structured-output 계약을 충족합니다. 저장된 이전 개요도 읽을 수 있습니다.

`storage.schedule_rules.build_calendar_rule(period, expression, fields)`는 검증된
`{expression,period}` 또는 None을 반환합니다. 인용의 실제 원문 포함 여부, 연도·월·일의
근거, 상대 기준과 기한 삭제 여부를 확인합니다. 없는 숫자·연도나 지급일을 접수일로 만들지 않습니다.
`resolve_calendar_schedule(fields, overview, rule=None, reference_year=None, reference_month=None)`는
먼저 원문을 해석하고, 미확인일 때만 동일한 인용 기간에 대한 검증된 표현을 사용합니다.
기존 데이터 보강 규칙은 draft의 `application_calendar`에 저장하고 저장·조회 시 다시 검증합니다.

공고 원문 전체에도 일정이 없거나 해석이 안 되면 일정보강 CLI가 공식 원문과 검색 결과를 확인합니다.
검색 결과의 요약만으로 저장하지 않습니다. HTTPS 본문을 수집하고 동일 사업·기관·지역·접수연도
일치 여부와 실제 인용을 확인합니다. 날짜가 확인된 문서의 인용·URL·확인일을 보존하며 상세에서
`일정 확인 출처` 링크를 제공합니다. 특정 지자체나 지난 회차의 일정을 전국 공통 일정으로 적용하지 않습니다.

## 실행

backend 폴더의 가상환경 Python을 사용합니다. 기존 DB와 Codex 모델 설정을 재사용합니다.

```powershell
# 모델·네트워크·DB 변경 없는 전체 공개 공고 감사
.venv/Scripts/python.exe -m app.modules.schedules audit --output data/schedule-audit.json

# 명시한 공고 원문을 다시 읽고 수정안·인용·시도 기록을 보관
.venv/Scripts/python.exe -m app.modules.schedules repair --policy-key gov24:154300000306 --output data/schedule-repair

# 필요한 경우 지정한 공식 기관 안에서 웹 검색 후 본문 대조
.venv/Scripts/python.exe -m app.modules.schedules repair --policy-key gov24:149200005012 --search --domain www.moel.go.kr --output data/schedule-repair
```

`--url`로 원문을 지정할 때는 공고 한 건과 `--domain`을 지정합니다. `--apply`는 검증된 결과만
새 개정으로 저장합니다. 원본 개정·원천 필드·자격 조건을 보존하고, 부모 개정이 변경됐거나
관리자 편집이 있으면 적용을 중단합니다. 같은 결과는 새 개정을 만들지 않습니다.
한 명령에서 최대 10건을 명시하며 보고서는 별도 run 디렉터리에 남습니다.
보고서의 실패/미해결 상태는 성공으로 표시하지 않습니다. 공개 조회 요청에는 모델·외부 요청이 없습니다.

## 근거 확인

[국립농산물품질관리원 경관보전직불 안내](https://www.naqs.go.kr/hp/contents/contents.do?menuId=MN30642)는
사업 신청을 1월 1일~4월 30일로 안내합니다. API 원문의 `매년 4월 말까지` 자체로도 4월 30일
마감을 알 수 있으므로, 시작일은 원문에 없는 경우 추가하지 않습니다.
기관별 신청기한·개인 사건 후 일정·공식 공고에서 구체적인 날이 확인되지 않은 경우는
원문 설명을 유지합니다. 검색으로 다른 사업·다른 회차밖에 확인되지 않았다면 날짜를 보충하지 않습니다.

검증 결과와 실제 보강 건수는 아래 실행 결과에 기록합니다.
