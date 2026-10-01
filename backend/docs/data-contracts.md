# 현재 데이터 계약

> 2026-10-01 저장 경로 갱신: 기본 공고 결과는 MySQL이며 파일 전용 설명은 이전 상태입니다. `storage/{schema,repository,__main__}.py`, `pipeline.resume_run`, `assistant/` 로컬 DB 질의응답을 추가했습니다. 현재 동작·이관·검증은 [policy-storage.md](policy-storage.md)를 우선합니다.

기준: 2026-09-25. 원문·추출 후보·v2 정규화 계약을 구분. [조건·지역 상세](condition-classification.md), [DB 연결 범위](implementation-status.md).

## RawDocument

`RawDocument`는 공공기관 공고문에서 가져온 원문과 추적 정보만 담습니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `document_id` | `str` | `source_url`에서 생성한 식별자 |
| `title` | `str` | 공고 제목 |
| `text` | `str` | 수정하지 않은 공고문 텍스트 |
| `source_url` | `str` | 원문 출처 URL |
| `collected_at` | `str` | UTC ISO 8601 수집 시각 |
| `published_at` | `str \| None` | 원문에 제공된 게시 시각. 미상은 `None` |

`RawDocument` 자체에는 지원 조건을 추가하지 않습니다. 조건은 별도 `SourcePolicy`·`PolicyExtraction` 계약에서 원문 근거와 연결하며 사용자 자격을 판단하지 않습니다.

수집 원문은 보존해야 하며, 저장된 원문을 정책 초안이나 공개 승인 데이터로 간주하지 않습니다.

## SourcePolicy

`app/contracts/parsing.py`의 공통 입력. `policy_key`, `title`, `organization`, `source_url`, `fields`, `source_hash` 포함. 공급자별 레코드를 변환하고 모델에 필요한 원문 필드만 전달. `source_hash`는 정렬된 공급자 레코드 JSON의 SHA-256이며 XML 파일 바이트 자체의 해시와 구분.

## PolicyExtraction

`policy_key`, `conditions`, `groups`, `coverage`, `unresolved` 포함. 조건 최대 128개·그룹 최대 64개. 근거는 SourcePolicy.fields의 지정 필드에 정확히 존재하는 부분 문자열이어야 함.

| 조건 필드 | 의미 |
|---|---|
| condition_id / field_key | 정책 내 식별자·원문 추출 항목명. 표준 사전 검사는 canonical 변환 시 적용 |
| subject | 신청인·자녀·부모·부부·가구·보증인 등 주체 |
| state_code | 0=명시적 제한 없음, 1=값 있음, 9=정보 없음 |
| operator / value | EQ/GT/GTE/LT/LTE/RANGE와 NUMBER/NUMBER_RANGE/DATE_RANGE/TEXT/BOOLEAN |
| unit / reference_basis | 단위·기준. 미확정은 null |
| role / group_id | 자격·제외·우선순위·신청·참고 구분과 적용 그룹 |
| source_field / evidence_quote | 원문 필드와 인용 |
| unknown_reason / review_note | 미기재·모호함·상충·원문 부족 사유와 검토 설명 |

0/9는 value·operator=null. 실제 숫자 0과 불리언 false는 state_code=1의 값. NUMBER_RANGE/DATE_RANGE는 min_inclusive/max_inclusive로 경계 포함 여부 보존. 추출 후보의 지역은 TEXT로 보존하고 공식 코드는 앱의 canonical 변환에서 결정.

groups는 all/any/exception/priority/reference/unresolved와 적용 범위·원문 근거 포함. LLM 평면 그룹의 관계는 설명이며 자동 실행 트리로 간주하지 않음. 자료형·범위·근거·참조 검증 통과는 의미 정확성이나 적격 판정과 구분.

## CanonicalPolicy (welfare-conditions-v2)

`app/contracts/conditions.py`의 FIELD_REGISTRY·CanonicalCondition·LogicNode·CanonicalPolicy 사용. [생성 JSON Schema](../schemas/welfare-conditions-v2.schema.json).

- field_key별 자료형·단위·카테고리 검증. 미등록 항목은 unmapped·state=9로 보존, source_field_key에 원래 항목명 유지.
- 숫자는 DECIMAL/DECIMAL_RANGE의 10진 문자열. v1 float의 안전한 정수 범위 밖은 UNKNOWN. 기존 정밀도 손실 복구 없음.
- 지역은 REGION의 ADMIN/LEGAL·10자리 code·공식 name·snapshot_version·include_descendants로 분리.
- logic은 all/any/not/condition/unknown. 조건 참조·자격 조건 누락·깊이·크기 검증. 확정 코드 조건만 자동 논리 연결. LLM 결과는 검토 전 unknown.
- 불확실성이 있으면 canonical.coverage=partial. 원래 analysis.coverage와 구분.
- 검증 순서: Pydantic 모델 검증 → validate_canonical로 원문 근거·공식 코드/이름/버전 검증.

## PolicyOverview

파이프라인 초안의 `overview`는 `title`, `source_url`, `category`, `region_conditions`, `gender_conditions`, `age_conditions`, `other_conditions`, `benefits`를 제공합니다. 제목은 원문 제목 그대로이며 `source_url`은 `SourcePolicy.source_url`에서 복사합니다. 모델이 URL을 생성·수정하지 않습니다. 원문 URL이 없으면 null입니다. 분야는 웹과 동일한 6개 값(`생활·금융`, `주거`, `일자리`, `교육`, `건강·돌봄`, `문화`) 중 주된 지원 내용에 따라 선택하며, 미분류 시 category=null과 unresolved 사유를 기록합니다.

지역·성별·나이 조건 및 혜택은 `status`와 `text`, `evidence`, `unresolved_reason`을 가집니다. `specified`는 조건/혜택 명시, `unrestricted`는 제한 없음 명시, `not_stated`는 원문 미기재, `unclear`는 모호·상충을 뜻합니다. 근거가 있는 text는 원문 인용을 가져야 하고, 미기재 상태는 내용을 추론해 채우지 않습니다. `other_conditions`는 소득·가구·자산·신청 조건 등을 항목별 text/evidence로 보존합니다. 검증은 제목과 인용의 원문 일치만 보장하며 의미 정확성·조건 완전성·사용자 자격을 확정하지 않습니다.

## 파일 초안·실행 상태

`pipeline.parse_raw_files`가 생성하는 `draft.json`의 버전은 `welfare-parsing-v2`. source, analysis, canonical, code_analysis, code_canonical, attempts, status, review_status, matching_enabled 등 포함. 코드 부분 결과가 없거나 prepare-only이면 관련 필드는 생략 가능. 현재 draft·matching_enabled=false 고정.

- pending: 준비 모드. processing_state=8, analysis=null.
- needs_review: 코드 분류 또는 CLI 추출·정규화 완료. 파일 초안 검토 필요.
- failed: 호출/검증 실패. analysis=null. 실패를 조건 상태 9로 바꾸지 않음.
- 모델의 reported_coverage를 보존하고 미해결 사항·정보 없음 조건이 있으면 analysis.coverage=partial로 제한.

manifest.json은 정책별 초안 경로·처리 상태 관리. 실제 함수 반환·폴더 구조는 [파싱 사용법](raw-parsing.md) 참조. MySQL 저장·조회·공개 계약은 미구현이며 향후 버전 변환을 통해 별도 연결.

004 SQL은 v2 저장 테이블 DDL만 제공. 기존 v1 파일·001 개발 SQL·인증 DB 자동 이관 없음.
