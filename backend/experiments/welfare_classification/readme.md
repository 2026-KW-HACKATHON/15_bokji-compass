# 코드·Codex CLI 복지 분류 실증

상태: 서버와 분리된 수동 실험. 운영 분석 API·자동 저장·자격 판정과 구분.

## 목적

- 실제 공개 API 표본 6건으로 코드 처리 범위와 LLM 위임 지점 확인.
- 정확한 값은 작은 공통 규칙으로 처리. 사업별 if문 추가 대신 복합 문장·예외·참조는 LLM 후보 추출로 위임.
- 키워드 분류는 다중 검색 힌트. 자격 충족이나 완전한 논리식으로 취급 금지.

## 실행

backend 폴더의 PowerShell에서 실행. 실제 응답 표본은 Git 제외이며 앞선 API 조사 경로 지정 필요.

```powershell
# 코드 기준선만 실행: 외부 호출 없음
.\.venv\Scripts\python.exe -m experiments.welfare_classification.run --samples data/api-inspection/20260921T021315Z

# 실제 Codex CLI 호출: 기존 CLI 로그인 필요
.\.venv\Scripts\python.exe -m experiments.welfare_classification.run --samples data/api-inspection/20260921T021315Z --codex-exe 'C:\설치경로\codex.exe'
```

`--codex-exe`는 Windows 네이티브 실행 파일의 절대 경로. `.ps1`·`.cmd` 래퍼 미지원. `--model` 생략 시 CLI 기본 모델, 명시 시 해당 모델 사용. 결과 경로는 실행 후 출력.

## 입출력·역할

- `rules.classify_field(kind, text) -> dict`: 코드/LLM 경로, 판단 이유, 다중 태그 힌트, 제한된 결정적 결과 반환.
- `run.load_records(samples) -> list[dict]`: Gov24 목록 첫 5건과 복지로 상세 1건을 실험 입력으로 매핑. 원천 ID·제목·기관·대상·기준·기간 사용.
- `contracts.BatchAnalysis`: 정책별 태그·조건 후보·논리 그룹·미해결 항목 계약. 운영 도메인 계약과 별도.
- `contracts.validate_evidence(result, records)`: 레코드 ID·그룹 참조·근거 인용의 원문 일치 검증. 의미 정확성 검증과 구분.
- `review.py`: 사전 선정한 실제 원문 사실 8개를 점검. 전체 정확도 평가와 구분.
- 결과: `backend/data/classification-experiments/<UTC 시각>/`의 입력·코드 기준선·프롬프트·CLI 이벤트·후보 JSON·요약.

JSON 샘플의 중첩 구조는 앞선 조사에서 보존한 결과 사용. 현재 운영 복지로 파서의 중첩 손실 수정은 별도 작업.

## Codex 실행 경계

- 공개 복지 텍스트만 UTF-8 stdin 전달. `.env`·DB 자격 정보 로드 없음.
- 사용자 설정 무시, 읽기 전용 샌드박스, 셸·웹·앱·플러그인·훅·다중 에이전트 비활성. 프로젝트 지침 읽기 비활성.
- 별도 실행 폴더, OS 실행·인증에 필요한 환경변수만 전달. 기존 CLI 인증 사용.
- 구조화 출력·원문 근거 검증. 도구 실행 이벤트 발견 시 실패 처리.
- 제한 시간 480초, 초과 시 해당 실행 트리 종료. 로그·결과 Git 제외.
- 실험용 실행기이며 운영용 제한 Windows 계정·Job Object·작업 큐·재시도·영속 상태 관리 미구현.

[OpenAI 비대화형 실행 문서](https://learn.chatgpt.com/docs/non-interactive-mode), [설정 문서](https://learn.chatgpt.com/docs/config-file/config-reference) 기준.

## 검증과 해석

- `scripts/test.ps1`에 포함되는 `tests/test_classification_experiment.py`로 주체 혼동·복합 조건·기간 오류·근거 위조 거부 확인.
- 코드 라우팅 비율은 이 작은 표본과 보수적 규칙의 결과. 코드의 이론적 처리 한계나 전체 정책 정확도로 일반화 금지.
- LLM 후보는 일부 추출일 수 있으며 미해결·예외·논리 누락을 검토한 뒤 사용. 실제 사용자 PASS/FAIL 판정 기능 없음.

실제 실행 결과와 한계: [실증 보고서](../../docs/classification-experiment.md).

제안 스키마 변환: [실제 데이터 정렬 샘플](../../docs/schema-sample.md). `schema_sample.py`는 저장된 6개 정책 전용 검토 매핑이며 DB 변경·외부 호출 없음.
