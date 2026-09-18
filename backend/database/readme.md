# MySQL 개발 시작점

상태: SQL 초안 작성 완료, DB 실행 검증 전. 담당자: 미정.
VS Code는 SQL 파일 작성 도구이며 실행에는 별도의 MySQL 서버와 클라이언트가 필요합니다.
목표 환경은 MySQL 8.4입니다. Node.js와 Python 모두 이 SQL을 사용할 수 있습니다.
사용자는 Node.js를 지정했으나 기존 루트 문서와 Python 골격은 FastAPI 기준입니다. 이번 작업은 백엔드 프레임워크 전환을 포함하지 않습니다.

## 구성과 역할

- 001_schema.sql: 개발 DB와 지역·사용자·프로필·정책·조건 원문 테이블 생성.
- 002_seed.sql: 실제 인물·기관과 무관한 합성 데이터 삽입.
- 003_queries.sql: 건수, 프로필, 정책 조건 및 공개 필터 조회.
- readme.md: 실행·입출력·검증과 한계 안내.

SQL 파일 순서가 공개 실행 진입점입니다. Node.js 함수와 HTTP API는 아직 없습니다.
출생지역은 선택 입력이며 NULL은 미입력입니다. 거주지 기준은 registered(주민등록), actual(실거주), unknown(미확인)으로 구분합니다.
지역 코드는 DEMO 전용입니다. 실제 행정구역 코드 체계와 변경 이력은 후속 결정합니다.
정책 조건은 specified(명시), unrestricted(명시적 제한 없음), unknown(모름), not_stated(원문 미기재)을 구분합니다.
조건의 AND/OR, 나이 기준일, 지역 포함 관계 등 정규화 규칙과 자동 자격 판정은 미구현입니다.

## 실행 방법

설치된 MySQL 서버가 실행 중이고 mysql 명령을 사용할 수 있어야 합니다.
VS Code에서 저장소 폴더를 열고 터미널에 아래 명령을 입력합니다. 비밀번호는 프롬프트에서 입력합니다.

```powershell
mysql --default-character-set=utf8mb4 -u <개발용_DDL_계정> -p
```

아래 명령은 PowerShell이 아니라 접속 후 mysql> 프롬프트에서 실행합니다.
경로에 공백이 없는 현재 저장소 절대 경로를 사용했습니다.

```sql
SOURCE C:/Users/user/Desktop/15_bokji-compass/backend/database/001_schema.sql;
SOURCE C:/Users/user/Desktop/15_bokji-compass/backend/database/002_seed.sql;
SOURCE C:/Users/user/Desktop/15_bokji-compass/backend/database/003_queries.sql;
```

각 SOURCE 결과에 오류가 없는지 확인하고 다음 파일을 실행하세요.
001은 CREATE 권한이 필요하며 테이블 생성 DDL은 전체 트랜잭션 롤백되지 않습니다.
이미 같은 DB가 있으면 중단하고 기존 구조를 확인하세요. 자동 삭제·덮어쓰기·재실행 보장은 제공하지 않습니다.
002는 새 개발 DB에 1회 실행합니다. 오류 시 ROLLBACK을 실행하고 원인을 확인하세요. 클라이언트가 오류 후 다음 문장을 계속 실행했는지 및 COMMIT 여부도 확인해야 합니다.
003은 SELECT 결과를 반환하며 데이터를 변경하지 않습니다.

## 보안 및 Node.js 연결 경계

- 합성 데이터만 사용합니다. 실제 개인정보·DB 덤프·비밀번호를 저장소에 넣지 마세요.
- Node.js용 드라이버, 연결 풀, 환경변수 설정과 인증·인가는 아직 없습니다.
- API 구현 시 로그인에서 검증한 사용자 ID를 사용하고 SQL 매개변수를 바인딩해야 합니다.
- 실행용 DB 계정에는 필요한 SELECT/INSERT/UPDATE/DELETE만 부여하고 DDL 계정과 분리합니다.
- 인증 방식이 정해지지 않아 비밀번호 필드는 만들지 않았습니다. users는 프로필 연결용 골격입니다.
- 사용자 삭제 시 프로필은 CASCADE 삭제됩니다. 로그·백업 보존 정책은 별도 설계가 필요합니다.
- 초안과 합성 정책은 공개하지 않습니다. validation 통과와 공개 승인은 별도 단계입니다.

## 검증과 다음 작업

003 실행 시 테이블별 건수는 3/2/2/2/4, 프로필 조회는 1행, 조건 조회는 4행, 공개 정책 조회는 0행이어야 합니다.
현재는 파일 생성·내용·참조 구조만 점검했습니다. MySQL 실행 및 통합 테스트는 수행하지 않았습니다.
후속 작업: 팀 데이터 계약 확정 → Node.js DB 연결 → 인증·인가 및 프로필 API → 조건 정규화·매칭.
스키마 변경 시 시드·조회 예제·문서를 함께 수정하고, 운영 단계에서는 버전 관리되는 마이그레이션을 도입하세요.
공통 참고: ../docs/data-contracts.md, ../docs/project-structure.md, ../docs/worklog.md.
MySQL 문법 참고: https://dev.mysql.com/doc/refman/8.4/en/create-table.html
