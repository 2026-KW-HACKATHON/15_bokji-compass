# Rawdata 파싱·모델 설정

Gov24 JSON·복지로 상세 XML/JSON·저장된 `RawDocument` JSON을 공통 정책 입력으로 변환하고, Codex CLI로 조건을 추출해 검증된 초안 저장. 특정 정책 ID나 앞선 6개 표본에 종속되지 않는 실행 경로.

현재 저장 대상은 JSON 파일이며 MySQL에 연결하지 않음. 기존 DB 접속 설정·readiness와 정책 적재의 구분, 신규 스키마 적용 순서는 [현재 구현 상태·DB 연결 범위](implementation-status.md) 참조.

## 실행

프로젝트 루트 PowerShell에서 실행. Python 의존성은 기존 `backend/scripts/setup.ps1`로 설치하며 추가 Python 패키지 없음. Codex CLI 설치와 각 팀원의 `codex login`은 별도 필요.

```powershell
# 파일 형태·정책 ID·원문 필드만 확인. 외부 호출 없음.
.\backend\scripts\parse-raw.ps1 -InputPath 'data/raw_documents/공지문.json' -PrepareOnly

# .env의 모델로 조건 추출·검증·초안 저장
.\backend\scripts\parse-raw.ps1 -InputPath 'data/raw_documents/공지문.json'

# 실제 수집 표본 6개 재실행. 표본 파일은 Git 제외이므로 해당 PC에 필요.
.\backend\scripts\parse-raw.ps1 -InputPath 'data/api-inspection/20260921T021315Z/gov24_serviceList.json','data/api-inspection/20260921T021315Z/bokjiro_detail.xml'
```

입력은 `backend` 기준 상대 경로 또는 절대 경로. 여러 파일은 배열로 전달. 동일 정책 ID가 중복되면 실패하며 목록·상세 중 사용할 원본을 먼저 선택. 덮어쓰기 없이 실행마다 별도 결과 폴더 생성.

Python에서 호출:

```python
from pathlib import Path
from app.modules.pipeline.public import parse_raw_files

output, manifest = parse_raw_files([Path("data/raw_documents/공지문.json")])
```

Python 함수의 `Path`는 호출자 작업 디렉터리 기준. 팀원용 PowerShell/모듈 CLI는 backend 기준으로 통일.

## backend/.env

```dotenv
CODEX_EXECUTABLE=
CODEX_MODEL=gpt-5.6-luna
CODEX_REASONING_EFFORT=medium
CODEX_FALLBACK_MODEL=gpt-5.6-terra
CODEX_TIMEOUT_SECONDS=300
PARSING_MAX_INPUT_CHARS=60000
```

- `CODEX_MODEL`: 기본 Luna. 추출·분류용 저비용 후보이며 전체 정책 정확성 보장과 구분.
- `CODEX_REASONING_EFFORT`: low/medium/high/xhigh. 초기값 medium; 변경 후 표본 재검증 필요.
- `CODEX_FALLBACK_MODEL`: 기본 `gpt-5.6-terra`. 형식·근거 검증 실패에만 한 번 재시도. 빈 값으로 끄기 가능. 단순 partial·정보 없음·인증 실패·시간 초과에는 자동 승격 없음.
- `CODEX_EXECUTABLE`: 비우면 PATH와 Windows Codex 앱 설치 경로에서 native 실행 파일 탐색. 탐색 실패 시 `C:/설치경로/codex.exe` 지정. `.cmd`·`.ps1` 래퍼 미지원.
- `CODEX_TIMEOUT_SECONDS`: 모델 호출당 제한. 재시도 설정 시 최대 두 번 호출.
- `PARSING_MAX_INPUT_CHARS`: 정책 한 건의 프롬프트 포함 문자 상한. 초과 입력을 임의 절단하지 않고 실패 처리.

프로세스 환경변수 > `APP_CONFIG_FILE` 또는 `backend/.env` > 기본값 순 적용. 설정 파일 전체·공공 API 키·DB 암호는 모델에 전달하지 않음. CLI 자체 로그인 인증 사용. HTTP 서버 재시작 없이 각 파싱 실행에서 설정 로드.

OpenAI 공식 [모델 안내](https://learn.chatgpt.com/docs/models)는 Luna를 반복적인 추출·분류·변환에 권장. [비대화형 모드](https://learn.chatgpt.com/docs/non-interactive-mode)의 `--model`, `--output-schema`를 사용하며 [설정 문서](https://learn.chatgpt.com/docs/config-file/config-reference)의 reasoning 설정 적용. 모델 접근 가능 여부는 로그인 계정·CLI에 따라 달라질 수 있음.

## 결과 계약

결과 위치: `backend/data/parsed_policies/<실행 시각-고유 ID>/` (Git 제외).

- `manifest.json`: 전체 상태·정책별 결과 파일 경로. 한 정책 실패 시 이후 정책 처리 유지, 최종 실패 상태·CLI 종료 코드 1.
- `<정책 ID 해시>/draft.json`: 원천 ID·제목·기관·선별 원문·원천 레코드 해시, 조건·그룹·검증된 모델·사용량·재시도 이력.
- `attempt-*/response.json`, `events.jsonl`, `stderr.log`: 성공 전 후보·진단 파일. **검증 완료 결과는 draft.json의 analysis만 사용**.

`pending`은 LLM 미실행(`processing_state=8`), `needs_review`는 초안 검토 필요, `failed`는 분석 실패(`analysis=null`). 처리 실패를 정책 정보 없음으로 바꾸지 않음.

조건의 `state_code`: 0=명시적 제한 없음, 1=값 있음, 9=분석 후 정보 없음. 숫자 0/불리언 false는 실제 값으로 유지. 0/9일 때 value·operator=null. 미기재·모호함·상충·원문 부족의 사유 분리.

`value.kind`: NUMBER, NUMBER_RANGE, DATE_RANGE, TEXT, BOOLEAN. 범위 양끝 포함 여부·주체·단위·기준 시점·자격/제외/우선순위/신청/참고 역할 분리. 복잡한 표현은 TEXT 보존 후 미해결 사항 기록.

공식 지역 마스터 미연결이므로 지역 이름은 TEXT로 보존하고 공식 코드 매핑은 후속 작업. 행정코드의 0·9를 상태 값으로 사용하지 않음. 복지로 XML 반복·중첩 항목은 수집 파서에서 보존.

## 검증 경계

- 정책 ID·중복 ID·그룹 참조·원문 인용 일치 확인.
- 상태와 값 일관성·자료형·비어 있거나 역전된 범위·연산자 검증.
- 도구 비활성·읽기 전용·임시 작업공간·허용 환경변수만 전달. 도구 이벤트 발견 시 실패 처리.
- 모든 결과 `review_status=draft`, `matching_enabled=false`. coverage는 모델이 보고한 추출 범위이며 의미 정확성 인증과 구분.
- 그룹 간 관계는 설명으로 유지하며 완전한 실행 논리 트리·사용자 자격 판정·MySQL 적재·HTTP 분석 API는 후속 작업.
- 모델 근거 인용이 맞아도 주체·숫자·논리 해석이 틀릴 수 있으므로 검토 후 사용. API 키나 개인정보를 포함하지 않은 공개 원문만 입력.
- 미해결 사항·정보 없음 조건이 있으면 모델의 complete 보고를 partial로 낮추고 `reported_coverage`에 원래 보고값 보존. field_key의 전체 표준 사전·실행 논리 트리 연결은 후속 검토 대상.

## 모듈 역할

| 파일 | 역할 |
|---|---|
| app/contracts/parsing.py | 공통 입력·조건·그룹·추출 자료형 |
| app/modules/normalization/raw.py | 공급자별 JSON/XML 변환·입력 검증 |
| app/modules/llm/public.py | 설정 모델로 Codex CLI 단일 호출 |
| app/modules/validation/public.py | 원문 근거·참조 검증 |
| app/modules/pipeline/public.py | 재시도·상태·초안 저장 |
| scripts/parse-raw.ps1 | Windows 팀원용 진입점 |

전체 검사: `.\backend\scripts\test.ps1`. 합성 원문 테스트로 실제 키·개인정보 없이 오류 경계 검증.

## 2026-09-22 실제 호출 검증

- 수집 표본 6개 JSON/XML 준비 모드 통과. 외부 API 재수집 없음.
- 초기 평면 value 스키마에서 Luna의 자료형 오류 확인·차단. 숫자/범위/문자/불리언별 스키마로 분리해 불필요한 null 필드 제거. CLI 기능 경고와 실제 도구 사용 구분.
- 개선 후 복지로 장애인자립자금대여: Luna medium 1회, 조건 30개, 약 174초, 입력 9,001·출력 9,331 토큰.
- 개선 후 Gov24 월세자금보증: Luna medium 1회, 조건 22개, 약 128초, 입력 8,768·출력 6,723 토큰.
- 두 건 모두 구조·원문 근거 검증 통과. 19세 이상, 소득비율의 초과/이하 경계, 부모 소득 6천만원, 신청인 무소득 0, 부부 소득 경로 분리 확인. Terra 실제 호출은 이번 검증에서 불필요, 재시도 동작은 테스트 대역으로 검증.
- 표본 2건 결과를 전체 정책 정확도로 일반화하지 않음. 예: 월세 조건의 unit을 KRW로 추출한 결과는 월 단위 표준화 검토 필요. 미확정 의미·그룹 간 논리·단위는 초안 검토 대상.
- 테스트 71개·Ruff·pip check 통과. `.env`와 생성 결과 Git 제외 유지.
