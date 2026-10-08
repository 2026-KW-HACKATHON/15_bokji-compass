# 콘솔 표시

`format_notice_title(value: str) -> str`는 공개 공고 제목의 전각 숫자만 일반 숫자로
표시합니다. 예: `202６년도` → `2026년도`. 목록·상세 카드에 공통 적용하며 원문·인용·
저장 데이터는 변경하지 않습니다. 문자 전체 NFKC 변환이나 숫자 사이 공백 삭제는 하지 않습니다.

## 신청 경로·서류 안내 (2026-10-08)

`application.application_guide(fields: dict[str,str], overview=None, source_url=None) -> dict`는
원천 필드에서 신청 방법·실제 신청용 URL·전화·방문 안내·준비 서류를 읽습니다. 반환값은
`{methodText, onlineUrl, phones, visitText, documents, documentsStatus, documentsNote}`입니다.
`phones`는 `{number,label,kind:'application'|'inquiry'}` 목록이고 `documents`는
`{id,label}` 목록입니다. 문서 ID는 표시 원문 전체의 SHA-256으로 만들어 순서 변경에도 유지하며,
원문이 바뀌면 다른 ID가 됩니다. 조건부 서류와 대체 서류 표현은 한 항목 안에 보존하고
목록을 잘라내지 않습니다.

원천 `application_method/application_url/contact/documents/required_documents`가 우선입니다.
없는 항목은 본문의 명시된 신청방법·구비서류 등 제목 아래 블록 또는 원문과 정확히 일치하는
개요 인용으로 보완합니다. 개요의 생성·번역된 요약은 신청 근거로 쓰지 않습니다.
지원 대상·선정 조건·첨부 서식만으로 제출 의무를 추정하지 않습니다. `신청서: 해당없음`은
서식 안내일 뿐 전체 구비서류가 없다는 뜻으로 처리하지 않습니다.
`documentsStatus`는 명시된 서류 목록 `listed`, 명시적으로 없는 구비서류 `none`, 확인되지 않은
서류 `unknown`을 구분하며, 없음 문구와 추가 조건부 서류가 함께 있으면 `listed`를 유지합니다.

온라인 URL은 명시적 `application_url` 또는 원문의 신청방법 블록에서 온라인 신청·접수·등록
표현과 같은 URL이 연결된 HTTP(S) 한 건만 사용합니다. 로그인 정보가 든 URL,
잘못된 포트·제어 문자·공고 원문과 같은 URL·사이트 홈·알려진 공고 조회 경로는 제외합니다.
온라인 신청이 가능하다는 문장이나 관련 링크에서 신청 페이지를 만들어내지 않습니다.
개요 인용에서 읽은 URL은 원문에서도 같은 URL과 신청·접수·등록 페이지 표현이 연결되어야
신청 경로로 사용하며 문의·신청 안내 URL은 제외합니다.
전화 신청은 번호와 전화 신청·접수 표현이 함께 있는 원문 또는 명시적 신청 전화 항목만
`application`으로 표시합니다. 상담·문의·전화 신청 불가 문구와 문의처에만 있는 번호는
`inquiry`입니다. 팩스 번호와 유효하지 않은 번호는 전화 동작 목록에서 제외합니다.
신청·문의 용도로 각각 명시된 같은 번호는 신청 경로를 보존합니다.

`storage.catalog.card`의 목록·상세·캘린더·추천 카드에 동일한 `applicationGuide`가 추가됩니다.
원천·개요·인용·기존 표시 필드·DB는 변경하지 않으며 HTTP·LLM·DB 호출도 없습니다.
외부 신청 사이트의 현재 접수 여부를 이 함수가 확인하지는 않습니다.
검증: `python -m pytest -p no:cacheprovider tests/test_application_guidance.py
tests/test_source_field_presentation.py tests/test_notice_presentation.py`.

## 공고 상세 JSON 표시 정제 (2026-10-08)

- `public.format_source_field(value: str, field='') -> str`은 JSON 객체·배열 문자열을
  읽기 쉬운 줄별 안내로 변환합니다. 복지로 법령은 법령명, 문의처는 `기관명: 전화번호`,
  신청 절차는 `신청/조사 및 심사/지원 결정/서비스 제공/사후 관리/이의 신청: 안내`로 표시합니다.
  복지로 별칭 필드와 일반 `label/url`, `name/text` 구조, 중첩 객체·배열도 처리합니다.
  첨부 파일명·URL·전화번호·수치·항목 순서는 보존하고 공급자 코드·ID는 제외합니다.
  일반 문자열과 유효한 JSON이 아닌 대괄호 설명은 그대로 반환합니다.
- `public.format_source_fields(fields: dict[str,str]) -> dict[str,str]`은 위 함수를 적용하고
  비어 있는 항목·코드만 있는 객체와 내부 `_editor_` 항목을 공개 표시에서 제외합니다.
- 원문·해시·인용·DB는 변경하지 않고 외부 호출도 없습니다. `storage.catalog.card`가
  목록·상세·캘린더의 표시 문자열과 상세 `sourceFields`에 공통 적용합니다.
  신청 캘린더와 지급일 해석에는 저장된 원천 필드를 그대로 사용합니다.
- 검증: `python -m pytest tests/test_source_field_presentation.py tests/test_notice_presentation.py`.
  [작업 범위·검증 기록](../../../docs/notice-source-fields.md).

## 추천용 출처 지표 (2026-10-07)

`public.load_popularity(repository, policy_keys) -> dict`는 수집 목록의 실제 정부24
`조회수`·복지로 `inqNum`을 한 번에 조회합니다. 수집 목록이 없는 DB에서는 빈 dict를
반환합니다. 누적 조회수이며 최근 증가량이나 관심 사용자 수로 표현하지 않습니다.
[관측 시각·갱신·검증](../../../docs/policy-popularity.md).

`public.policy_signals(record, popularity=None) -> dict`는 추천 카드의 선택 항목
`popularity`, `budget`, `budgetNotice`를 반환합니다. `budget`은 사용 가능한 원문 URL과
독립된 `예산 소진율: 72.5%` 같은 문장이 있을 때만 생성합니다. 비율은 0~100이며
상충한 수치는 숨깁니다. `asOf`는 원문에 별도 `예산 기준일: YYYY-MM-DD`가 있을 때만
표시하며 없으면 null입니다. 혜택의 지급 비율·전체 사업 예산·계획 수치·조기 마감 조건으로
소진율을 계산하지 않습니다. `budgetNotice`는 실제 원문의 예산 소진 시 마감 문장을
전달합니다. 입력·원문·DB를 수정하지 않고 모델·외부 HTTP도 호출하지 않습니다.

검증: `python -m pytest -p no:cacheprovider tests/test_policy_signals.py tests/test_policy_popularity.py`.

## 공고 화면 표시 (2026-10-06)

- `public.format_notice_text(value: str) -> str`: 화면용 요약·혜택·조건의 명사형 공고체.
  지급/지원/선발 등 알려진 문장 끝만 변환하며 숫자·한도·예정·이후·가능·부정 조건을 유지합니다.
  예: `장학금을 지급할 예정이다.` → `장학금 지급 예정.`
- `public.payment_schedule(fields: dict[str,str]) -> str | None`: 명시적 지급 항목이나
  `후지급 (10월 중순 이후 ...)`에서 월이 적힌 지급 시기 한 건을 반환합니다.
  복수의 서로 다른 시기, 미정, 날짜 없는 방법 안내, 신청 기간은 None입니다.
  없는 연도·일자를 추정하지 않으며 입력의 원문을 변경하지 않습니다.
- `public.policy_description(title: str, purpose: str | None, benefits: str) -> str`: 원천 사업 목적을
  우선 반환합니다. 목적이 없는 구형 월세자금보증·에너지절감장비·유아학비·장애인자립자금 공고는
  별도의 짧은 화면 문구를 사용하고, 그 외에는 전달된 지원 내용으로 대체합니다. 사업 소개 문장은
  자연스러운 설명체를 유지하고 대체 지원 내용만 공고체로 정리합니다. DB·외부 호출은 없습니다.
- `storage.catalog.card(record)`는 사업 설명인 원천 `purpose_summary`를 summary에 우선 사용하며,
  없거나 공백이면 위 구형 공고 설명, 검증된 개요의 혜택, 원천 혜택 순으로 대체합니다. benefit은 검증된 개요의
  혜택을 우선하여 상세 조건을 보존합니다. 상세 혜택은 공고체로 정리하며 원문 JSON, 모델 개요,
  인용, 자격 조건은 수정하지 않습니다.
  `paymentSchedule`은 별도 표시용 선택 항목이며 신청 캘린더 날짜에 사용하지 않습니다.

검증: `python -m pytest tests/test_notice_presentation.py`. 명사형 변환·한도/부정 보존·지급일 분리와
봉규 브랜치에서 복원한 실제 광운대 요약 2건의 원문/인용 불변성을 검사합니다.
이 함수들은 DB·HTTP·모델을 호출하지 않습니다.

담당: 백엔드. `public.format_public_services(services: list[dict]) -> str`은 목록을 `1. 서비스명 (ID)` 형태의 줄바꿈 문자열로 반환합니다. `serviceId`/`serviceNm` 또는 `서비스ID`/`서비스명`을 사용하고 누락 시 `-`/`이름 없음`으로 표시합니다. 빈 목록은 빈 문자열입니다.

함수는 직접 출력·HTTP·파일·DB 접근을 하지 않습니다. 호출자는 유효한 dict 목록을 전달해야 하며 별도의 입력 스키마 검증은 없습니다. 예: `print(format_public_services(services))`.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest app/modules/collectors/tests/test_gov24_services.py`로 표시 문자열을 검증합니다. 프론트 UI와 정책 HTTP API는 이 모듈의 구현 범위가 아닙니다.
