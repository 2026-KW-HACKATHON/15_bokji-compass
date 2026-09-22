# 로컬 데이터

`mysql-dev/`는 개발 MySQL의 데이터·설정·관리 자격 정보·로그입니다. 이 readme를 제외한 로컬 데이터는 Git에서 제외됩니다. 시작·종료는 [개발환경 사용법](../docs/development.md)을 따릅니다.

실행 중인 DB 파일은 직접 이동·삭제하지 않습니다. 작은 합성 테스트 자료는 tests에서 관리하고 운영 원본 보존 정책은 후속 구현에서 정합니다.

| 폴더 | 내용 |
|---|---|
| raw_documents/ | 공고 수집기의 RawDocument JSON |
| api-inspection/ | 실제 공개 API 응답 조사 표본 |
| classification-experiments/ | 이전 코드·CLI 분류 실험 |
| schema-samples/ | 제안 스키마 적용 예시, DB 미적용 |
| parsed_policies/ | 현재 파서의 manifest·검토용 draft·CLI 시도 로그 |
| mysql-dev/ | 독립 개발 MySQL 런타임 데이터 |

parsed_policies와 mysql-dev는 별도 경로입니다. **JSON 초안 생성은 MySQL 적재를 의미하지 않습니다.** 원본·실험 표본·파싱 결과가 없는 팀원 PC에서는 해당 입력을 별도로 준비해야 합니다. [구현 상태](../docs/implementation-status.md), [파싱 사용법](../docs/raw-parsing.md).
