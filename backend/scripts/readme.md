# Windows 개발 도구

현재 상태: 구현. 담당자: 미정. 작업 폴더와 무관하게 backend 경로를 계산하며 외부 명령 실패는 비정상 종료로 처리합니다.

| 진입점 | 입력 | 결과·부작용 |
| --- | --- | --- |
| `setup.ps1` | 선택 PythonExecutable, RuntimeOnly | 로컬 환경·의존성 설치, 없는 `.env`만 생성 |
| `start.ps1` | 선택 Reload | API 포그라운드 실행, Ctrl+C로 종료 |
| `setup-mysql.ps1` | 선택 MySqlExecutable, Port | 독립 개발 DB 초기화·시작, 로컬 DB 설정 기록 |
| `mysql.ps1` | start / stop / status | 프로젝트 DB 실행·종료·상태 확인 |
| `test.ps1` | 없음 | pytest·Ruff·패키지 충돌 검사 |
| `lock.ps1` | 없음 | `.in`에서 고정 의존성 `.txt` 생성 |
| `parse-raw.ps1` | InputPath 배열, 선택 PrepareOnly | 원문 파싱·설정 모델 추출·검증·초안 파일 저장 |

`common.ps1`은 경로·명령 검사를 공유하며 `mysql_dev.py`는 소유 데이터 경로를 검증합니다. 설치/lock은 네트워크를 사용할 수 있습니다. MySQL 실패 시 데이터를 삭제하거나 기존 서비스를 수정하지 않습니다. 스크립트는 업무 데이터를 반환하지 않고 상태·종료 코드만 제공합니다.

호출 예시와 오류 대응은 [개발환경 문서](../docs/development.md)를 따릅니다. 수정 시 `tests/test_mysql_helper.py`와 실제 독립 DB의 시작·종료·재실행을 확인합니다.
