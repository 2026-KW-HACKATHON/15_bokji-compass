# MySQL 개발 시작점

상태: SQL 초안 및 격리 MySQL 8.0.44 실행 검증 완료. 담당자: 미정.

**DB 접속 설정은 구현되어 있지만, rawdata 파싱 결과의 MySQL 저장은 미구현입니다.** 현재 결과는 `backend/data/parsed_policies/`의 JSON 초안으로 저장합니다. 이 SQL은 신규 조건 계약의 마이그레이션이 아닙니다. [현재 구현 상태·DB 연결 범위](../docs/implementation-status.md).

VS Code는 SQL 파일 작성 도구이며 실행에는 별도의 MySQL 서버와 클라이언트가 필요합니다.
목표 환경은 MySQL 8.4입니다. Node.js와 Python 모두 이 SQL을 사용할 수 있습니다.
현재 실행 가능한 백엔드는 Python/FastAPI입니다. SQL 자체는 프레임워크와 독립적이며 Node.js 서버는 구현되어 있지 않습니다.

## 구성과 역할

- 001_schema.sql: 개발 DB와 지역·사용자·프로필·정책·조건 원문 테이블 생성.
- 002_seed.sql: 실제 인물·기관과 무관한 합성 데이터 삽입.
- 003_queries.sql: 건수, 프로필, 정책 조건 및 공개 필터 조회.
- readme.md: 실행·입출력·검증과 한계 안내.

SQL 파일 순서가 DB 초기화 진입점입니다. 정책 저장 함수와 업무 HTTP API는 아직 없습니다.
출생지역은 선택 입력이며 NULL은 미입력입니다. 거주지 기준은 registered(주민등록), actual(실거주), unknown(미확인)으로 구분합니다.
seed의 지역 코드는 DEMO 전용입니다. 실제 데이터는 공식 대한민국 행정코드를 사용하는 방향이며, 법정동/행정동 구분·마스터 적재·유효기간·변경 이력은 후속 구현입니다.
정책 조건은 specified(명시), unrestricted(명시적 제한 없음), unknown(모름), not_stated(원문 미기재)을 구분합니다.
신규 파서는 주체·값·단위·기준·근거·조건 그룹을 JSON으로 추출합니다. 이 SQL과 연결하는 변환·저장 코드는 없으며 실행 가능한 AND/OR/예외 트리·지역 포함 관계·자동 자격 판정은 미구현입니다.

## 실행 방법

`scripts/setup-mysql.ps1`로 프로젝트 전용 MySQL을 준비하고 시작합니다. `mysql.exe`가 PATH에 없으면 설치된 MySQL의 bin 폴더 절대 경로로 호출합니다. 아래 예시는 기본 포트 3307이며 변경했다면 해당 포트를 사용합니다.
VS Code에서 저장소 폴더를 열고 터미널에 아래 명령을 입력합니다. 비밀번호는 프롬프트에서 입력합니다.

```powershell
Set-Location backend
mysql --default-character-set=utf8mb4 --host=127.0.0.1 --port=3307 --user=bokji_dev -p
```

아래 명령은 PowerShell이 아니라 접속 후 mysql> 프롬프트에서 실행합니다.
위와 같이 backend 폴더에서 mysql 클라이언트를 시작했을 때의 상대 경로입니다. 비밀번호는 로컬 `backend/.env`의 DB_PASSWORD 값을 사용합니다.

```sql
SOURCE database/001_schema.sql;
SOURCE database/002_seed.sql;
SOURCE database/003_queries.sql;
```

각 SOURCE 결과에 오류가 없는지 확인하고 다음 파일을 실행하세요.
001은 CREATE 권한이 필요하며 테이블 생성 DDL은 전체 트랜잭션 롤백되지 않습니다.
구성 스크립트가 만든 빈 개발 DB에는 적용할 수 있습니다(`CREATE DATABASE IF NOT EXISTS`). 같은 이름의 업무 테이블이 이미 있으면 실행 전에 중단하고 기존 구조를 확인하세요. 자동 삭제·덮어쓰기·재실행 보장은 제공하지 않습니다.
002는 새 개발 DB에 1회 실행합니다. 오류 시 ROLLBACK을 실행하고 원인을 확인하세요. 클라이언트가 오류 후 다음 문장을 계속 실행했는지 및 COMMIT 여부도 확인해야 합니다.
003은 SELECT 결과를 반환하며 데이터를 변경하지 않습니다.

## 보안 및 애플리케이션 연결 경계

- 합성 데이터만 사용합니다. 실제 개인정보·DB 덤프·비밀번호를 저장소에 넣지 마세요.
- Python SQLAlchemy/PyMySQL 연결 풀과 환경설정은 구현되어 있습니다. 정책 저장·인증·인가는 아직 없습니다.
- API 구현 시 로그인에서 검증한 사용자 ID를 사용하고 SQL 매개변수를 바인딩해야 합니다.
- 실행용 DB 계정에는 필요한 SELECT/INSERT/UPDATE/DELETE만 부여하고 DDL 계정과 분리합니다.
- 인증 방식이 정해지지 않아 비밀번호 필드는 만들지 않았습니다. users는 프로필 연결용 골격입니다.
- 사용자 삭제 시 프로필은 CASCADE 삭제됩니다. 로그·백업 보존 정책은 별도 설계가 필요합니다.
- 초안과 합성 정책은 공개하지 않습니다. validation 통과와 공개 승인은 별도 단계입니다.

## 검증과 다음 작업

003 실행 시 테이블별 건수는 3/2/2/2/4, 프로필 조회는 1행, 조건 조회는 4행, 공개 정책 조회는 0행이어야 합니다.
2026-09-21에 프로젝트 전용 MySQL 8.0.44의 빈 테스트 스키마에서 세 SQL을 실행하여 위 결과를 확인했습니다. 검증 중 DB명만 테스트용으로 바꾸었고 생성 테이블을 정리해 빈 상태로 복원했습니다. 개발 DB에 자동 적용하지 않았으며 MySQL 8.4 실행은 아직 검증하지 않았습니다.
후속 작업: 신규 계약·스키마 확정 → 기존 테이블 이관·버전 마이그레이션 → Python 저장소·트랜잭션 → 실제 MySQL 적재·조회 검증 → 인증·인가·프로필 API·조건 판정. [연동 단계](../docs/implementation-status.md)의 순서를 따릅니다.
스키마 변경 시 시드·조회 예제·문서를 함께 수정하고, 운영 단계에서는 버전 관리되는 마이그레이션을 도입하세요.
공통 참고: ../docs/data-contracts.md, ../docs/project-structure.md, ../docs/worklog.md.
MySQL 문법 참고: https://dev.mysql.com/doc/refman/8.4/en/create-table.html
