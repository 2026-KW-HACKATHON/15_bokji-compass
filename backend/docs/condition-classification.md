# 코드 우선 조건 분류·공식 지역코드

기준: 2026-09-25. 파싱 경로 연결·조건 v2 계약·공식 지역 마스터·오프라인 검증 구현.
결과는 검토용 파일 초안. 정책 DB 적재·사용자 프로필 대조·추천 API는 후속.

## 처리 흐름

```text
공개 JSON/XML → SourcePolicy → 원문 전체 절에 대한 코드 규칙
  ├─ 조건·지역·적용 관계 모두 확정 → code_rules (LLM 호출 0회)
  └─ 미지원/복합 조건 존재 → 전체 원문을 설정된 Codex CLI에 전달
      → 원문 근거 검사 → 표준 필드·숫자·지역 정규화 → 검토용 canonical
```

일부 조건만 추출된 경우 `code_analysis`와 `code_canonical`에 보존. LLM 결과와 자동 합쳐 AND 조건을 만들지 않음. CLI 실패 시에도 코드 부분 결과 보존, 전체 `status=failed`, `analysis=null` 유지.

규칙은 나이 비교·범위, 성별, 취업/미취업/자영업, 주택 소유, 등록장애 여부, 무소득, 소득·자산 금액, 소득인정액 중위소득 비율, 거주/주민등록 지역, 명시적 신청기간, 명시적 제한 없음을 지원.
`미취업=무소득` 같은 의미 추론은 없음. `및/이며/이고` 또는 명시적 모두 충족 문구만 AND로 해석. 나열만 있는 목록, 예외/또는/우선순위, 주체 상속, 필드 간 적용 범위는 LLM과 검토로 전환.
단위·기준일·정보 부족을 추측해서 채우지 않음. 기관 소재지·혜택 지급 지역을 신청자 주소로 사용하지 않음.

## 실행

기존 `parse-raw.ps1`/`parse-raw.sh` 사용법 유지. 추가 의존성 설치 없음. 공식 마스터는 Git 포함이므로 팀원이 별도로 다운로드할 필요 없음.

backend 폴더에서 코드 분류만 확인하는 명령(네트워크·LLM·DB 호출 없음):

```powershell
# Windows
.venv/Scripts/python.exe -m app.modules.parsers --input data/raw_documents/공지문.json
```

```bash
# macOS
.venv/bin/python -m app.modules.parsers --input data/raw_documents/공지문.json
```

전체 파싱은 루트에서 기존 명령 실행:

```powershell
.\backend\scripts\parse-raw.ps1 -InputPath 'data/raw_documents/공지문.json'
```

LLM 기본/보완 모델은 기존 `.env`의 `CODEX_MODEL`, `CODEX_FALLBACK_MODEL` 사용. 명확한 코드 분류만 실행될 때는 Codex 로그인 불필요. 복잡한 실제 원문은 CLI 설치·로그인 필요.

## 조건 계약

추출 원문 계약 `PolicyExtraction`과 최종 정규화 계약 `CanonicalPolicy`를 구분.
초안 파일 버전 `welfare-parsing-v2`, `canonical.schema_version=welfare-conditions-v2`.
원본 `analysis`를 보존하고 표준화된 `canonical`을 추가. 기존 v1 파일은 자동 덮어쓰기 없음.

| 항목 | 규칙 |
|---|---|
| state_code=0 | 원문에 명시된 제한 없음. value/operator=null |
| state_code=1 | 값 있음. 숫자 0·false도 실제 값 |
| state_code=9 | 미기재·모호·미지원·단위 미확정. 사유·원문 보존 |
| DECIMAL / DECIMAL_RANGE | 10진 문자열. 경계 포함 여부 보존. 금액·인원·연령 정수 단위 검증 |
| CATEGORY | 필드 사전에 정의된 성별·취업 상태 코드 |
| REGION | ADMIN/LEGAL, 10자리 code, name, snapshot_version, include_descendants |
| source_field_key | 표준화 이전 추출 항목명 보존 |
| field_key | FIELD_REGISTRY의 표준 키. 미등록 항목은 unmapped·state=9 |
| subject / role | 주체와 자격·제외·우선순위·신청·참고 역할 분리 |
| reference_basis | 원문 기준일·산정 기준. 없으면 null, 오늘 날짜 자동 대입 없음 |

필드 사전은 `app/contracts/conditions.py::FIELD_REGISTRY`가 기준. 연령·성별·주택·취업·장애·소득 종류·자산·수급 여부·대출 참고금액·가구원 수·기간·거주/주민등록/실거주/직장/학교/출생지역 구분.
필드 추가 시 허용 타입·단위·카테고리, 정규화, 테스트, 생성 JSON Schema를 함께 갱신.
기존 `disability_registration`만 동일 의미의 `disability_registered`로 명시 변환. 임의 필드명 유사도 매핑 없음.

v1 NUMBER는 float 입력이므로 2^53-1 초과 값은 UNKNOWN 처리. v2는 Decimal 문자열로 직렬화하지만 이미 공급자 float에서 손실된 정밀도를 복구하지 않음. 원본 인용을 함께 검토.

생성 계약: [JSON Schema](../schemas/welfare-conditions-v2.schema.json). Pydantic 검증 후 `validate_canonical(result, source)`로 원문·공식 코드 존재·이름·버전도 검사.

## 조건 논리

`logic`은 condition/all/any/not/unknown 노드. 빈 그룹·잘못된 NOT 자식 수·없는 조건 참조·자격/제외 조건 누락·참고 조건의 자격 논리 혼입 차단. 최대 깊이 16, 최대 노드 256.

`evaluate_logic`는 이미 평가된 조건별 PASS/FAIL/UNKNOWN을 조합하는 순수 함수. missing도 UNKNOWN.
all은 FAIL 우선, any는 PASS 우선, not UNKNOWN은 UNKNOWN 유지.
명확한 코드 조건은 트리 자동 생성. LLM의 기존 평면 groups만으로 예외 트리를 추정하지 않으며 canonical.logic=unknown·coverage=partial 유지. 검토자가 전체 논리를 연결하는 경로는 후속.
이는 사용자 프로필에서 조건을 계산하는 추천 엔진과 구분. 모든 결과 matching_enabled=false 유지.

## 공식 지역 마스터

[행정안전부 자료](https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=127979) 기반 `mois-2026-07-20` 스냅샷 사용. 2026-09-25 확인 기준 최신 게시된 변경 자료.
[manifest](../reference/regions/manifest.json)에 원본·변환 해시와 기준일 저장.

| 원문 | 처리 |
|---|---|
| 서울특별시 | ADMIN / 1100000000 |
| 경기도 시흥시 | ADMIN / 4139000000. 코드 안의 9는 정상 숫자 |
| 서울특별시 종로구 청운동 | LEGAL / 1111010100 |
| 서울특별시 종로구 청운효자동 | ADMIN / 1111051500 |
| 중구 / 고성군 | 후보가 여러 개이므로 UNKNOWN |
| 강원도 | 폐지 코드로 확인, 현행 코드 자동 대체 없음 |
| 서울 / 서울시 | 등록되지 않은 약칭. 추측 없이 UNKNOWN |

공식 전체 이름 또는 유일한 이름 접미어로 조회. 같은 이름의 행정동/법정동이 겹치면 체계도 미확정. 코드·이름이 동일한 시도/시군구는 ADMIN을 기본으로 선택. 명시적인 체계 조회는 `catalog.resolve(name, system="LEGAL")` 지원.
상하위 포함 관계는 같은 체계의 공식 지역명 계층으로 구성. 숫자 prefix만으로 포함 여부를 판정하거나 법정동↔행정동을 자동 변환하지 않음.
생성·말소일은 보존하지만 런타임 조회는 선택한 스냅샷 기준일에 고정. 과거 정책 지역을 현재 지역으로 자동 이관하지 않음.

### 갱신

1. [주민등록·인감 게시판](https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000052)의 최신 주소코드 변경 공지 확인.
2. `말소코드포함.zip`을 로컬 `tmp/` 등에 다운로드.
3. backend에서 아래 명령 실행. 날짜·URL은 해당 공지의 실제 값 사용.

```powershell
.venv/Scripts/python.exe -m app.modules.regions ../tmp/jscode20260720-all.zip --effective-date 2026-07-20 --source-url 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=127979' --download-url 'https://www.mois.go.kr/cmm/fms/FileDown.do?atchFileId=FILE_00147311ctH5-ah&fileSn=2'
```

Mac은 실행 파일을 `.venv/bin/python`으로 변경. 다운로드는 수동, 변환은 오프라인. ZIP 경로 추출 없음. 알려진 KIKcd 고정폭 형식만 수용. 출력 변경·건수·신설/말소·source_anomalies 검토 후 지역 테스트의 기준일/건수도 갱신.
이전 draft의 snapshot_version은 그대로 보존. 새 스냅샷에 맞는 코드라고 자동 간주하지 않음.

## MySQL 연결 경계

`database/004_condition_schema.sql`에 별도 이름의 지역 스냅샷·지역·정규화 문서·조건 테이블 DDL 추가. 선택한 DB에 명시 적용하는 계약 초안이며 기존 001 테이블 이관·자동 설치·저장 어댑터는 미구현.
코드는 CHAR(10), 상태는 TINYINT로 분리. 조건 상태/값/근거의 CHECK 제약과 문서 개정·출처·전체 JSON 보존 포함.
격리된 임시 MySQL 8.0.44에서 DDL·공식 지역 63,000행 적재·상태/값 CHECK·공개 전 매칭 차단 검증 완료. 기존 개발 DB에는 적용하지 않음. 8.4 실기기 검증은 별도.

재현 검증은 backend에서 `python scripts/check-condition-schema.py --mysqld 'MySQL 실행 파일 절대 경로'` 실행. 기존 `.env` 미사용, 임시 데이터 폴더·로컬 포트·서버 생성 후 해당 서버만 종료. 결과·로그는 `.cache/condition-schema-tests/`에 유지하며 Git 제외.

## 실데이터 검증 범위

저장된 Gov24 5건·복지로 1건은 예외·대상자 분기·복합 조건 때문에 코드 단독 완결 0건, LLM 경로 6건. 숫자만 뽑아 전체 신청 조건으로 확정하지 않는 동작 확인.
기존 실제 CLI 추출 2건(52개 조건)은 v2 정규화 재실행으로 원문 누락·미등록 필드·단위 미확정 처리 검증. 23개 값 표준화, 29개 미확정 상태 보존. `tests/fixtures/conditions/public_extractions.json`으로 재현. 새 모델 호출에 대한 정확도 평가와 구분.
합성 원문의 명확한 조건은 LLM 호출 0회·공식 지역코드 변환·검토 상태 저장 확인. 실제 정책 전체의 자동 분류 완료를 뜻하지 않음.
