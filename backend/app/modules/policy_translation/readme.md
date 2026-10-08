# 공개 공고 본문 번역

`translate_public_policy(repository, policy_id, language, settings, slots)`는 현재 공개된
공고만 조회하고 `PolicyTranslationResponse`를 반환한다. 입력은 저장된 공고 ID와
`ko/en/zh/vi/ja`이며 사용자 질문·프로필·임의 원문을 받지 않는다. 한국어는 원문을 반환한다.
다른 언어는 기존 Codex CLI 설정을 사용하고 최대 60초·프로세스당 동시 1건으로 제한한다.

`display_fields()`는 제목·요약·대상·기관·혜택·신청/지급 안내·본문·성별 안내·문의·신청 방법·
추가 조건·텍스트 원천 필드·예산 안내만 선택한다. 공고 ID·개정 ID·분야/지역/태그·기계 날짜·
신청 URL·조회수·자격 모델은 생성하지 않는다. 원문과 조건 저장소를 변경하지 않는다.

`TranslationCache`는 같은 정책 DB의 `policy_translations`를 사용한다. 키는 공고 ID·개정 ID·
표시 내용 SHA-256·언어·프롬프트 버전으로 계산한다. 공개 상태를 캐시 조회 전과 반환 전에
재확인한다. 개정 변경 또는 공개 취소 시 기존 번역을 반환하지 않는다. 테이블 생성은
`python -m app.modules.storage init`의 `011_policy_translations.sql`로만 수행한다.
DB 장애를 파일 캐시로 대체하지 않으며 초기화 누락은 503이다.

공개 함수·캐시 호출 계약:

- `display_fields(policy)` → 표시 필드만 포함하는 `PolicyTranslation`.
- `source_hash(display)` → 정렬한 표시 JSON의 SHA-256 문자열.
- `validate_translation(source,translated)` → 정상일 때 `None`, 보호 값·구조 불일치 시 `ValueError`.
- `TranslationCache(engine)` → 이미 초기화한 정책 DB의 캐시 객체. 생성자가 DDL을 실행하지 않는다.
- `key(policy_id,revision_id,source_hash,language,prompt_version)` → 캐시 키 SHA-256 문자열.
- `get(key)` → 검증된 `PolicyTranslation` 또는 캐시 미적중 `None`.
- `put(key,policy_id,revision_id,source_hash,language,prompt_version,value)` → 결과를 보존하고 `None`.
- `reserve_call(day,maximum)` → UTC 일일 생성 한도 예약 성공 여부 `bool`.
- `TranslationError` → HTTP로 변환할 `code`, `status_code`, `retry_after`를 가진 오류.

`policy_translation_usage`의 UTC 날짜별 호출 수를 원자적으로 예약한다.
`POLICY_TRANSLATION_DAILY_CALLS` 기본 100이며 실패한 생성 시도도 차감한다. 같은 DB를 사용하는
서버 재시작·다중 프로세스에 한도가 유지된다. 캐시 조회는 한도를 차감하지 않는다.
한도 소진은 429와 다음 UTC 날짜까지의 `Retry-After`, 동시 실행 슬롯 소진은 429와 30초를 반환한다.

엄격한 출력 스키마·필드별 숫자/숫자 날짜/URL/이메일 대조·필드 키/조건 개수/null/빈 값
대조를 통과해야 저장한다. 번역 품질 전체나 법률적 의미를 자동으로 보증하지 않는다.
URL의 문장 괄호와 알려진 한국어 조사는 표시 문구로 구분한다. 조사 앞 URL 전체가 ASCII인
경우에만 접미 조사를 구분하며, 한국어 경로/쿼리 값과 균형 잡힌 URL 내부 괄호는 보존한다.
실제 URL이 ASCII 문자열 뒤 한국어 조사와 같은 글자로 끝나는 경우 원문만으로는 경계가
모호하다. 이 제한된 휴리스틱은 모든 URL의 의미를 판정하지 않는다.
모델 입력은 비신뢰 공개 자료로 취급하고 도구·웹·명령 실행을 금지한다. CLI의 임시
입출력 폴더는 호출 종료 후 삭제하며 회원 데이터와 설정 비밀값은 전달하지 않는다.
120,000글자 기본 입력 한도 초과는 원문을 절단하지 않고 503으로 처리한다.

HTTP 응답·설정·운영 준비는 [공고 번역 안내](../../../docs/policy-translation.md),
오프라인 검증은 `python -m pytest tests/test_policy_translation.py`를 따른다.
이 테스트는 SQLite 격리 저장소와 모의 모델만 사용한다. 실제 모델 인증·MySQL 적용·번역
내용 품질 점검은 운영 환경에서 별도로 확인한다.
