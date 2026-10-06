# 콘솔 표시

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
