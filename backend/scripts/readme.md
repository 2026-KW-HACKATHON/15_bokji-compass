# 개발 도구

2026-10-02 공유 공고 연결: `share-server.py`의 `share_settings() -> Settings`는 `backend/.env`의 MySQL·회원 암호화·카카오 설정을 읽습니다. 공유 계정도 같은 MySQL 회원 저장소를 사용하며 기존 SQLite 계정은 서버 중지 후 명시적으로 이관합니다. `share.ps1 reload`는 기존 터널 URL을 유지하며 변경한 API·프록시를 적용합니다. `/api/v1/policies`는 공개 공고만 반환하며 초안 상태를 바꾸지 않습니다. 검증: `tests/test_share_server.py`.

macOS 팀원은 [Mac 사용법](../docs/macos-development.md) 참고. 운영 서버는 Windows 유지. `.sh` 파일은 `bash backend/scripts/파일.sh` 형식으로 실행하며 별도 실행 권한 설정 불필요.

현재 상태: 구현. 담당자: 미정. 작업 폴더와 무관하게 backend 경로를 계산하며 외부 명령 실패는 비정상 종료로 처리합니다.

Windows에서는 저장소 루트의 [`start-server-dev.bat`](../../start-server-dev.bat)를 더블클릭하면
기존 `start.ps1`로 API 서버를 실행합니다. 실행 주소는 `backend/.env`의 설정을 사용하며
`Ctrl+C`로 종료합니다. 종료·오류 후에는 창을 유지하여 메시지를 확인할 수 있습니다.
MySQL과 수집 worker는 별도로 실행하며, 자동 수집은 아래 스케줄 안내를 따릅니다.

[`start-server-prod.bat`](../../start-server-prod.bat)는 프론트를 빌드한 뒤 `share.ps1 start -TunnelMode fixed -ReloadIfRunning`으로
8001 API·8080 웹·QR 게이트웨이·고정 도메인 터널을 실행합니다. 주소는 `https://bokji.commitnaru.com`입니다.
빌드·터널 설정·포트·Caddy 설정 검사 후, 이 프로젝트의 `backend/server.py`로 실행한 개발 API를
프로세스 경로와 시작 시각으로 확인하여 하위 프로세스와 함께 종료합니다. 종료에 실패하면 운영 시작을 중단합니다.
따로 실행한 Vite 프론트와 MySQL은 유지합니다. 개발 API 종료 후 운영 기동이 실패하면 개발 API를 자동 재실행하지 않습니다.
창을 닫아도 서버는 계속 실행됩니다. 루트에서 `start-server-prod.bat stop`으로 종료하고
`start-server-prod.bat status`로 상태를 확인합니다. 같은 고정 주소의 터널이 실행 중이면 터널을 유지하고
API·QR·웹을 다시 실행합니다. 관리자 콘솔에서 서버를 중지해 터널만 남은 경우에도 같은 BAT로 복구합니다.
다른 주소·터널 모드이거나 터널 없이 일부 서버만 남아 있으면 상태 확인 후 `stop`으로 종료하고 다시 실행합니다.
Node.js·웹 의존성·Python 환경·Caddy·cloudflared·터널 토큰을 준비해야 하며 MySQL은 별도로 실행합니다.
두 실행 파일 모두 `backend/.env`와 해당 DB 설정을 공유합니다. 운영용 BAT는 별도의 DB나 수집 스케줄을 만들지 않습니다.

| 진입점 | 입력 | 결과·부작용 |
| --- | --- | --- |
| `setup.ps1` | 선택 PythonExecutable, RuntimeOnly | 로컬 환경·의존성 설치, 없는 `.env`만 생성 |
| `start.ps1` | 선택 Reload | API 포그라운드 실행, Ctrl+C로 종료 |
| `stop-dev.ps1` | 없음 | 이 프로젝트의 server.py 개발 API만 확인 후 프로세스 트리 종료 |
| `process-control.ps1` | Action=Status/Stop/Restart, Target=backend/frontend/all, ServerProcessId, JobId | 관리자 콘솔 전용 고정 프로세스 제어. 변경은 접수된 작업·잠금과 일치해야 실행 |
| `share.ps1` | start / stop / status / reload, 선택 ReloadIfRunning | 공유 API·정적 웹·Cloudflare HTTPS 터널 실행/종료/상태. start -ReloadIfRunning은 같은 주소의 실행 중 터널을 유지하며 reload. [준비·범위](../../frontend/web/deploy/readme.md) |
| `setup-mysql.ps1` | 선택 MySqlExecutable, Port | 독립 개발 DB 초기화·시작, 로컬 DB 설정 기록 |
| `mysql.ps1` | start / stop / status | 프로젝트 DB 실행·종료·상태 확인 |
| `test.ps1` | 없음 | pytest·Ruff·패키지 충돌 검사 |
| `lock.ps1` | 없음 | `.in`에서 고정 의존성 `.txt` 생성 |
| `parse-raw.ps1` | InputPath 배열, 선택 PrepareOnly/Storage | 원문 파싱·설정 모델 추출·검증·MySQL 기본 저장. Storage=json만 파일 내보내기 |
| `ingestion-schedule.ps1` | Action=Install/Remove/Status, 선택 TaskName/PythonExecutable/EnableLiveCollection | Windows 제한 수집 작업 관리. 기본 비활성 등록, 실제 수집은 활성 선택과 worker --live 필요 |
| `setup.sh` | 선택 --runtime-only, PYTHON_EXECUTABLE 환경변수 | macOS Python 3.13 환경·고정 의존성 설치, 없는 .env만 생성 |
| `start.sh` | 선택 --reload | macOS API 포그라운드 실행 |
| `parse-raw.sh` | --input 파일들 / --resume run_id | macOS 원문 파싱·MySQL 저장/재개. --storage json만 파일 내보내기 |
| `test.sh` | 없음 | macOS pytest·Ruff·패키지 충돌 검사 |

`common.sh`는 backend 경로·Python 3.13 환경 검사 공유. `.sh`는 실패 종료 코드 전파 및 LF 줄바꿈 유지. 독립 MySQL 자동 구성·lock 갱신은 기존 Windows 도구 사용.

`common.ps1`은 경로·명령 검사를 공유하며 `mysql_dev.py`는 소유 데이터 경로를 검증합니다. 설치/lock은 네트워크를 사용할 수 있습니다. MySQL 실패 시 데이터를 삭제하거나 기존 서비스를 수정하지 않습니다. 스크립트는 업무 데이터를 반환하지 않고 상태·종료 코드만 제공합니다.

호출 예시와 오류 대응은 [개발환경 문서](../docs/development.md)를 따릅니다. 수정 시 `tests/test_mysql_helper.py`와 실제 독립 DB의 시작·종료·재실행을 확인합니다.

## 관리자 콘솔의 프로세스 제어

관리 콘솔의 프로세스 제어는 현재 API의 실행 방식을 확인합니다. 개발 모드는 정확한 절대
스크립트 인수, 운영 모드는 공유 실행 기록의 PID·실행파일·시작 시각으로 소유권을 검사합니다.
API는 트리를 종료하지 않고 확인한 API 프로세스만 종료해 별도 관리 도우미를 보존합니다.
운영 웹·QR은 해당 실행 기록만 제어하며 MySQL·터널은 유지합니다. 새 프로세스는 숨김으로
실행하고 준비 응답을 확인한 뒤 영속 작업 결과를 기록합니다. 실패 코드는 안전한 목록만
저장하며 실행 stdout/stderr는 로컬 `backend/data/server-control/`에 남깁니다.

## 노트북 공고 수집 스케줄

백엔드 **수집 실행** 화면에서도 등록 상태 확인과 명시적 등록·해제를 할 수 있습니다.
스크립트의 `-Json`은 콘솔 API용 UTF-8 JSON 결과를 제공하며 기존 CLI 표 출력은 유지합니다.

운영 절차·계정 예산·DB 초기화·기존 공고 인덱싱·체크포인트 재개는
[서버 수집 안내](../docs/server-ingestion.md)를 따릅니다.

```powershell
.\backend\scripts\ingestion-schedule.ps1 -Action Status
.\backend\scripts\ingestion-schedule.ps1 -Action Install
```

Install 기본은 비활성 작업이며 worker 명령에도 `--live`를 넣지 않습니다. 서버 파일럿 후
실제 자동 수집을 등록할 때 `-Action Install -EnableLiveCollection`을 명시합니다. 동일 이름
작업을 자동 덮어쓰지 않으므로 변경 시 Status 확인, Remove, Install 순서로 처리합니다.
Remove는 이 workspace 소유의 예약 작업만 해제하고 수집 데이터는 지우지 않습니다.

현재 로그인 사용자·일반 권한, backend 작업 디렉터리와 `pythonw.exe` 절대 경로를 사용합니다.
예약 실행 때 CMD/콘솔 창이 열리지 않습니다. `-PythonExecutable`에 `python.exe`를 지정하면
동일 폴더의 `pythonw.exe`로 변환하며, 해당 파일이 없으면 등록을 중단합니다.
10분 간격, IgnoreNew, StartWhenAvailable, 최대 11분이며 기본 AC 시작/배터리 전환 중단
조건을 유지합니다. 별도 MySQL 가동과 이 사용자의 Codex 로그인이 필요합니다. API/MySQL
기동과 24시간 실행을 보장하지 않으며 절전·종료 이후에는 DB cursor/lease/checkpoint를
기준으로 소량 재개합니다. discovery는 별도 설정으로 기본 비활성입니다.

창 없는 예약 실행은 콘솔 출력을 표시하거나 stdout을 파일에 자동 저장하지 않습니다.
LastTaskResult와 CLI `status`의 최근 worker 결과·실패·예산을 함께 확인합니다.
직접 결과를 볼 때는 기존처럼 `python.exe -m app.modules.ingestion status`를 사용합니다.
기존 등록 작업은 스크립트 수정만으로 바뀌지 않으므로 실행 파일도 동일 환경의
`pythonw.exe`로 갱신해야 합니다. 현재 PC 적용·검증 기록은 [작업 기록](../docs/worklog.md)을 참고합니다.
