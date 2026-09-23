# macOS 개발환경

운영 서버는 Windows 유지. macOS 팀원은 같은 Python 코드와 requirements로 API·원문 파싱 개발 가능. 독립 MySQL 자동 구성 도구(`setup-mysql.ps1`, `mysql.ps1`)는 Windows 전용.

## 설치·서버 실행

Python 3.10 이상과 인터넷 연결 필요. 저장소 루트의 Terminal에서 실행:

```bash
python3 --version
bash backend/scripts/setup.sh
bash backend/scripts/start.sh --reload
```

`setup.sh`: 프로젝트 내부 `.bootstrap`에 uv 0.12.16 설치 → Python 3.13 가상환경 `.venv` 구성 → `requirements-dev.txt`의 버전·해시 고정 패키지 설치. Python 3.13이 없으면 uv가 다운로드. 테스트 도구 제외 시 `--runtime-only`. 다른 Python 경로는 `PYTHON_EXECUTABLE=/절대/경로/python3 bash backend/scripts/setup.sh`로 지정.

기존 `.env` 보존, 없으면 `.env.example` 복사. Windows의 `.venv`·`.bootstrap`·`.python`을 복사하지 않고 Mac에서 새로 생성. 호환되지 않는 기존 가상환경은 자동 삭제하지 않고 중단.

Apple Silicon은 ARM64 Python 사용. Intel Mac 또는 Rosetta의 x86_64 Python에서는 현재 고정된 `cryptography==50.0.1`의 Mac x86_64 wheel이 없어 소스 빌드 필요. 설치 중 OpenSSL/Rust 오류가 나면 [cryptography 공식 빌드 안내](https://cryptography.io/en/latest/installation/#building-cryptography-on-macos)에 따라 아래 준비 후 재실행. 이 경로의 실제 빌드는 Mac에서 검증 필요.

```bash
# Intel Mac에서 빌드 도구가 없을 때만 실행. Homebrew가 설치되어 있어야 함.
xcode-select --install
# Xcode Command Line Tools 설치 완료 후:
brew install openssl@3 rust
OPENSSL_DIR="$(brew --prefix openssl@3)" bash backend/scripts/setup.sh
```

DB 설정 전 `backend/.env`의 `DB_ENABLED=false` 유지. `/health`는 200, `/health/ready`는 DB 미설정으로 503이 정상. 원문 파싱은 DB 없이 실행 가능. MySQL이 필요한 작업은 Mac에 별도 설치한 MySQL 또는 팀에서 제공한 DB의 주소·포트·전용 계정을 `.env`에 지정. [DB 연결 범위](implementation-status.md).

## Codex CLI 설치·로그인

OpenAI 공식 [CLI 설치 안내](https://learn.chatgpt.com/docs/codex/cli), [인증 안내](https://learn.chatgpt.com/docs/auth) 기준:

```bash
# Codex CLI가 없는 경우 공식 설치 도구 실행
curl -fsSL https://chatgpt.com/codex/install.sh | sh
# 설치 안내에 따라 PATH 반영 또는 터미널 재실행
command -v codex
codex --version
codex login
codex login status
```

서버·파서를 실행하는 macOS 사용자로 로그인. VS Code 터미널도 새 PATH가 보이도록 재시작. 각 팀원은 자신의 계정 사용. CLI 버전·모델 접근 권한은 계정별 확인 필요.

파서는 공식 [exec 옵션](https://learn.chatgpt.com/docs/cli/reference)의 `--ignore-user-config`, `--ephemeral`, `--output-schema`를 사용. 해당 옵션을 지원하는 CLI 필요. Windows 회귀 확인 버전은 `0.155.0-alpha.9.2`이며 Mac 버전을 강제로 고정하지 않음.

`backend/.env`:

```dotenv
DB_ENABLED=false
CODEX_EXECUTABLE=
CODEX_MODEL=gpt-5.6-luna
CODEX_REASONING_EFFORT=medium
CODEX_FALLBACK_MODEL=gpt-5.6-terra
CODEX_TIMEOUT_SECONDS=300
```

`CODEX_EXECUTABLE`이 비어 있으면 PATH의 `codex` 사용. 자동 탐색 실패 시 `command -v codex`로 확인한 실행 파일의 **절대 경로만** 입력. 예: `/opt/homebrew/bin/codex`. 경로는 설치 방식·CPU에 따라 다르므로 고정값으로 복사하지 않음. 명령문·Windows `codex.exe` 경로는 입력하지 않음. `~` 확장·실행 권한·심볼릭 링크 지원.

프로젝트 `.env`는 공공 API 키·모델 설정용. Codex 인증은 CLI 로그인 저장소 사용. `HOME`·`CODEX_HOME`은 자식 프로세스에 전달하며 DB 암호·공공 API 키·`OPENAI_API_KEY` 환경변수는 전달하지 않음. 별도 `CODEX_HOME` 사용 시 로그인과 파싱 양쪽에 같은 프로세스 환경변수 설정. `auth.json`·키체인·실제 `.env` 공유 또는 Git 추가 금지.

## 원문 파싱·테스트

저장소 루트에서 실행. 입력은 backend 기준 상대 경로 또는 절대 경로. 아래 파일명은 실제 수집한 공개 JSON/XML 파일로 교체:

```bash
# 입력 변환만 확인: Codex·네트워크 호출 없음
bash backend/scripts/parse-raw.sh --input 'data/raw_documents/공지문.json' --prepare-only
# 실제 Codex 추출·검증·JSON 초안 저장
bash backend/scripts/parse-raw.sh --input 'data/raw_documents/공지문.json'
# 여러 파일: --input 뒤에 공백으로 구분
bash backend/scripts/parse-raw.sh --input '/절대/경로/정책1.json' '/절대/경로/정책2.xml'
bash backend/scripts/test.sh
```

파싱은 HTTP 서버와 별도 CLI. 결과는 `backend/data/parsed_policies/`에 저장하며 MySQL 저장·추천 API 실행을 의미하지 않음. 입력 표본·API 키·이전 파싱 결과는 Git 제외이므로 팀원 PC에 자동으로 생기지 않음. [전체 파싱 계약](raw-parsing.md).

직접 실행은 `cd backend` 후 `.venv/bin/python server.py --reload`, `.venv/bin/python -m app.modules.pipeline --input ...` 사용. 셸 스크립트는 LF 줄바꿈 고정이며 `bash 파일명` 방식이므로 별도 `chmod` 불필요.

## 오류 확인

| 증상 | 확인·조치 |
|---|---|
| `codex_not_found` | 같은 터미널에서 `command -v codex`, PATH 반영 또는 CODEX_EXECUTABLE 지정 |
| `invalid_codex_executable` / `codex_start_failed` | 실행 권한·절대 경로·현재 Mac CPU용 설치·npm 설치라면 Node PATH 확인 |
| 로그인 필요 / 모델 사용 불가 | 같은 사용자·CODEX_HOME에서 `codex login status`, 로그인 또는 계정에서 허용된 CODEX_MODEL 지정 |
| `unexpected argument` | CLI 업데이트 후 `codex exec --help` 확인. 격리 옵션을 임의 삭제해서 우회하지 않음 |
| `codex_timeout` | 해당 실행의 프로세스 그룹 종료. 네트워크·입력 길이 확인 후 필요한 경우 호출 제한시간 조정 |
| `/health/ready` 503 | DB_ENABLED와 DB 연결 설정 확인. DB 없이 파싱할 때는 정상 상태 |
| 입력 파일 없음 | 실제 공개 원문 준비. Git 제외된 다른 팀원의 data 폴더가 있다고 가정하지 않음 |

실패 시 실행 폴더의 `manifest.json`, `draft.json`의 `attempts`, `attempt-*/stderr.log` 확인. 로그 공유 시 인증정보 제거. 파서는 사용자 설정 파일·도구를 차단하므로 `config.toml`의 플러그인·맞춤 공급자 설정이 자동 적용되지 않음.

## 검증 범위

2026-09-23 Windows에서 테스트 76개·Ruff·pip check·Bash 문법 검사 통과. Apple Silicon 대상 wheel 설치 계획 35개 패키지 해석 통과, Intel은 소스 빌드 허용 시 설치 계획 해석 통과. 실제 설치·빌드 성공과 구분. 실제 POSIX 실행 파일을 호출하는 테스트 1개는 Windows에서 건너뛰고 Mac의 `test.sh`에서 실행. macOS 실기기의 로그인·키체인·실제 모델 호출은 해당 팀원 환경에서 최종 확인 필요.
