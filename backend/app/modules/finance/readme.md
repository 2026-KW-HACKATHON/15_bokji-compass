# 소득·재산 계산과 계정별 금융정보 저장

## 역할과 범위

입력한 가구 소득·재산으로 기준 중위소득 비율과 사업별 참고 금액을 계산합니다. `public.py`의 계산 함수는 네트워크·DB·인증·LLM에 의존하지 않습니다. 회원은 별도 HTTP 경로에서 동의한 원입력을 저장하고, 비회원은 저장 없이 계산할 수 있습니다.

현재 규칙은 2026년 생계급여 기본 산식, 차상위 확인사업의 추가 공제 전 참고 산식, 국민임대 일반 소득·자산 기준입니다. 입력이나 적용 조건이 부족하면 `needs_review`와 확인할 항목을 반환합니다. 차상위 확인사업은 추가 지출공제를 입력받지 않아 항상 `needs_review`·`unknown`이며, 금액이 50%를 넘어도 탈락으로 판단하지 않습니다. 최종 수급·입주 자격이나 지급액을 확정하지 않습니다. 기준·예외·공식 출처는 [금융 산정 규칙](../../../docs/financial-rules.md)을 참고합니다.

## 공개 Python 인터페이스

| 함수 | 입력 | 반환·책임 |
|---|---|---|
| `rules_catalog()` | 없음 | 기준연도, 규칙 버전, 출처, 지원하는 산정 방식 목록 |
| `calculate(profile)` | `FinancialProfile` | 중위소득 기준·비율, 차량 포함/제외 자산, 사업별 비교·계산 과정·확인 항목 |
| `evaluate_policy(profile, criteria)` | `FinancialProfile`, 서버가 검토한 `PolicyFinancialCriteria` | 공고의 검토된 재무 기준과 비교. 지원하지 않거나 미확정이면 `needs_review` |

```python
from app.contracts.finance import FinancialProfile
from app.modules.finance.public import calculate

profile = FinancialProfile.model_validate(
    {
        "household_size": 1,
        "members": [{"age": 40, "earned_income": 2_000_000}],
    }
)
result = calculate(profile)
# 다른 소득·재산·부채 등을 입력하지 않았으므로 확정된 0원으로 계산하지 않습니다.
```

`evaluate_policy`는 서버 내부의 후속 연결 지점입니다. 브라우저가 임의로 `review_status=reviewed`나 공고 기준을 보내는 HTTP API는 제공하지 않습니다. 공고 저장소·공개 승인·정책 조회·추천 API와의 실제 연결은 아직 없습니다. 기존 파싱 파일의 `draft`와 `matching_enabled=false`를 우회하지 않습니다.

## 입력·결과 계약

[contracts/finance.py](../../contracts/finance.py)가 입력 타입·범위의 기준입니다. 원 단위 금액은 0 이상 정수이며 null은 미입력입니다. 0과 null을 구분하고, 금액에 숫자 문자열·불리언·소수를 허용하지 않습니다. 가구원 목록 길이와 가구원 수, 차량 보유 여부와 차량 목록의 일관성을 검사합니다.

원입력은 가구원별 근로·사업·기타·사적이전 소득, 공제 확인 항목, 주거재산·임차보증금·일반/금융 재산, 부채, 차량 금액·종류·용도·연식 등을 포함합니다. 가구 심사 범위 확인과 기준연도도 별도로 받습니다. 공고별로 다른 공제 결과를 공통 사용자 소득처럼 저장하지 않습니다.

근로·사업소득 금액의 기준과 차량 명의·등록상 용도·가액 출처·저공해차 보조금 여부도 저장합니다. 양수 근로소득은 `earned_income_basis=gross`, 양수 사업소득은 `business_income_basis=net_expenses`여야 소득 합계·비교에 사용할 수 있습니다. 실수령액과 매출을 임의 환산하지 않습니다. 차량의 `use`는 실제 사용 목적이며 등록증의 `registration_use`와 다릅니다. 공동명의·리스·시세 추정·특례·보조금 차감 등 미지원 조건은 추가 확인으로 반환합니다. [공식 소득 정의와 실제 공고 조사](../../../docs/finance-input-evidence-2026.md).

소득·차량의 추가 선택 필드는 생략 시 `unknown`이므로 기존 스키마 버전 1 저장 JSON도 읽을 수 있습니다. 기존 금액의 기준을 소급 추정하지 않으므로 조회 시 결과가 `needs_review`로 바뀔 수 있습니다. 이는 일반적인 데이터 이관 체계를 구현했다는 의미는 아닙니다.

`calculate`의 반환 키는 `reference_year`, `rules_version`, `median`, `assets`, `assessments`, `sources`, `notes`입니다. 각 사업의 `checks`는 금액·한도와 `within`/`over`/`unknown`을 담습니다. 입력 부족·공제 특례·적용 범위 미확정은 해당 비교를 `unknown`으로 만듭니다. `estimated`도 입력 기준 참고 계산을 의미합니다.

월소득의 단순 중위소득 비율과 사업별 소득인정액은 서로 다릅니다. 차상위 입력 여부로 중위소득 표를 높이지 않습니다. 비율표의 산술 반올림과 사업별 선정기준의 반올림 방식이 다를 수 있습니다. 2026년 외 기준은 등록되지 않아 사업별 비교 금액·한도를 확정하지 않습니다.

## HTTP·저장 경계

[api/finance.py](../../api/finance.py)의 계약은 [루트 API 관리대장](../../../../api-management.md)을 따릅니다.

- 공개: `GET /v1/finance/rules`, `POST /v1/finance/calculate`의 `{profile}`. 인증·DB가 비활성 상태여도 계산하며 인증 테이블을 만들지 않습니다.
- 회원: `GET /v1/finance/profile`, `POST /v1/finance/profile`의 `{profile, consent: true}`, `POST /v1/finance/profile/delete`의 `{}`.
- 회원 저장·삭제는 세션 쿠키와 `X-Auth-Request: 1` 헤더를 요구합니다. 저장 동의는 JSON boolean true만 허용합니다. 요청 본문에서 소유자 ID·계산 결과·기타 미정의 필드를 받지 않습니다.
- 조회·저장 응답은 `{profile, calculation, updated_at}`입니다. 미저장은 모두 null, 삭제 응답은 `{deleted: true}`입니다.
- `storage.py`의 `account_financial_profiles`에는 로그인한 계정 ID별 최신 원입력과 UTC 저장 시각만 보관합니다. 계산 결과는 조회·저장 응답마다 재계산합니다.
- 저장은 계정별 한 건을 갱신하며 이전 입력·계산 결과의 이력은 남기지 않습니다. 규칙 코드가 변경되면 같은 입력의 조회 결과도 달라질 수 있습니다. 로그인 만료·로그아웃은 저장값을 삭제하지 않으며 자동 보관기간 만료·계정 탈퇴는 미구현입니다.
- 금융정보 저장·삭제는 계정, 추천용 정보, 저장 공고를 변경하지 않습니다. 모든 금융 응답은 `Cache-Control: no-store`이며 잘못된 입력·DB 오류 응답에는 금융 원입력을 넣지 않습니다.

미로그인·만료는 401, 회원 POST 헤더 누락은 403, 입력·동의 오류는 422, 인증 비활성·DB 장애·저장 데이터 형식 오류는 503입니다. 순수 함수에 잘못된 모델 데이터를 직접 전달하면 Pydantic 검증 오류가 발생합니다.

## DB 초기화

개발·테스트에서 `DB_ENABLED=false`이면 기존 인증 SQLite 파일을 사용합니다. 로그인된 회원의 첫 금융정보 요청에서 금융 테이블만 추가합니다. 비회원 계산은 이 경로를 호출하지 않습니다.

`DB_ENABLED=true`의 MySQL은 HTTP 요청에서 자동 초기화하지 않습니다. 설정한 DB를 확인한 뒤 backend 폴더에서 명시적으로 실행합니다.

```text
# Windows
.venv/Scripts/python.exe -m app.modules.finance
# macOS / Linux
.venv/bin/python -m app.modules.finance
```

이 명령은 기존 인증 초기화와 금융 테이블 추가를 수행합니다. 기존 데이터·정책 테이블·001 SQL의 초안 `users/user_profiles`를 삭제하거나 이관하지 않습니다. 금융 스키마의 `create_all`은 이미 존재하는 테이블 구조를 바꾸지 않으며, 금융 테이블 변경·저장 원입력 버전 이관을 위한 마이그레이션 체계는 미구현입니다. 운영 환경의 SQLite 인증은 기존 인증 규칙에 따라 차단됩니다. 금융 저장소의 실제 MySQL 실행 검증은 아직 하지 않았습니다.

## 검증·후속 작업

- `tests/test_finance_rules.py`: 기준 금액·공제·차량 경계·미입력·미지원 연도·검토된 공고 기준 비교.
- `tests/test_finance_api.py`: 비회원 무저장, 회원 격리·동의·세션·삭제, 재계산·재시작 보존, 민감 오류, MySQL 모드의 자동 초기화 차단. DB 검증은 격리 SQLite를 사용합니다.
- `tests/test_bootstrap.py`: 생성 OpenAPI 경로와 기존 앱 조립 계약.

소득·차량 입력 기준 보완 후 금융 산식·API 두 파일에서 82개 통과를 확인했습니다. 전체 백엔드 및 후속 공고 계약 보완 결과는 [작업 기록](../../../docs/worklog.md)에 별도로 기록합니다. 실제 MySQL 금융 저장, 승인된 정책 저장소 연결, 추가 사업·연도·특수 공제는 후속 범위입니다.
