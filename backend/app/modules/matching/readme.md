# 사용자 정보와 공고 조건 비교

담당: 백엔드. 회원 DB 정보와 공개 공고의 정규화 조건을 연결하는 읽기 전용 모듈입니다.
LLM·네트워크 외부 호출·회원/금융정보 저장·신청 자격 확정은 수행하지 않습니다.

## 호출

- `build_facts(member, profile, financial=None) -> MatchingFacts`: 인증된 회원의 나이·성별·지역을
  우선합니다. 회원 값이 없으면 요청 값으로 대신 확정하지 않습니다. 비회원은 요청 연령대를
  범위로 비교합니다. 직업은 이번 요청의 직장인/자영업자만 명시적으로 연결합니다.
- `compare_policy(record, facts, catalog=None, today=None) -> dict`: 원문 근거와 공식 지역코드를
  재검증한 뒤 `checks`, `notes`, `status`, `matching_enabled`, `eligibility_decided=false` 반환.
- `recommend(repository, facts, profile=None, limit=3, today=None) -> dict`: 공고별 최신 공개
  개정만 조회합니다. 최근 최대 500건에서 관심 분야·일치한 개별 조건으로 최대 3건을 정렬합니다.
  `items:[{policy,reason,matching}]`, `summary`, `truncated`, `eligibility_decided=false` 반환.

`compare_policy`의 잘못된 계약/인용/스냅샷은 ValueError입니다. 추천에서는 해당 공고를 제외하고
요약에 알립니다. DB 오류는 전파되어 API에서 개인정보 없는 503으로 응답합니다.
날짜는 기본 Asia/Seoul이며 테스트에서는 `today`를 고정할 수 있습니다.

## 비교 범위

- 나이: 수치·범위·포함/제외 경계. 연령대가 조건 경계를 걸치면 unknown.
- 성별: MALE/FEMALE과 회원값 비교. 기타/미공개는 unknown.
- 거주지역: 공식 ADMIN/LEGAL 계층으로 비교. 서울 입력만으로 노원구 거주를 확정하지 않습니다.
- 주민등록/실거주/출생/학교/직장 지역: 회원 region의 의미가 충분하지 않아 unknown.
- 가구원 수: 사용을 선택한 금융정보의 심사 가구 범위 확인이 있는 경우만 비교.
- 소득·자산·주택 소유·장애·수급 여부: 금액/공제/기준연도/심사대상 매핑 없이 추정하지 않습니다.
- 별도 기준 시점/산정 기준(`reference_basis`)이 있거나 신청자 외 인물 조건이면 추가 확인.
- state_code 0은 명시적 제한 없음, 9는 미해석/미기재입니다. 미기재를 통과로 바꾸지 않습니다.
- all/any/not은 참/거짓/미상으로 평가합니다. exclusion은 저장된 논리의 not을 통해 적용하며,
  priority/application/reference를 필수 자격 조건으로 바꾸지 않습니다.

자동 매칭이 꺼져 있거나 coverage가 partial이면 상태는 항상 needs_review입니다.
공개 상태·matching_enabled·완전한 논리가 모두 준비된 경우에도 potential_match는 조건 비교
결과일 뿐 기관의 자격 판정이 아닙니다. not_matched는 이 경우에만 추천에서 제외됩니다.
비활성 공고의 개별 불일치는 설명에 표시하고 전체 탈락으로 해석하지 않습니다.
명확히 지난 신청 기간, 초안/비공개 개정, 원문 검증 실패는 추천에서 제외합니다.

## HTTP·검증

`POST /v1/recommendations`: 웹 쿠키와 앱 Bearer 모두 지원. 요청은
`{profile?,limit?:1..3,financialProfile?,use_saved_financial_profile?:false}`입니다.
회원은 빈 본문으로 DB 프로필을 이용할 수 있고, 비회원은 profile이 필요합니다.
저장 금융정보 사용과 직접 전달은 동시에 선택할 수 없습니다. 저장 정보는 명시적인 true일
때에만 인증 계정의 account_id로 조회합니다. 저장·조회·삭제 결과를 추천 과정에서 변경하지 않습니다.
무효 세션은 비회원으로 바꾸지 않고 401입니다. X-Auth-Request:1, no-store, 회원당 분당 20회.
추천 선호값은 이번 요청에만 사용하며 서버 DB에 새로 저장하지 않습니다.

```powershell
# backend 폴더
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/test_matching.py
.\.venv\Scripts\python.exe -m ruff check --no-cache app/modules/matching app/api/recommendations.py
```

[사용자 DB 확인 및 필드 대응표](../../../docs/member-policy-matching.md).
