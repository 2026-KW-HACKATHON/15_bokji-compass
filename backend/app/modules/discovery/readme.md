# 추가 복지 공고 후보 검색

담당: 백엔드. 기존 Codex CLI 모델 설정으로 복지로·Gov24 밖의 공식 사이트에서 복지 공고
URL 후보를 찾습니다. 후보는 검증된 원문 정책이 아니며 자동 공개하지 않습니다.

## 공개 함수

`discover(settings, *, domains: list[str], query: str, timeout: int,
max_candidates: int = 10) -> (list[dict], metadata)`는 명시적 호출 시에만 CLI와 실시간
웹 검색을 사용합니다. DB·수집 파일 저장은 하지 않습니다. `domains`가 비면
`DEFAULT_DOMAINS`의 `youth.seoul.go.kr`, `www.nowon.kr`을 사용합니다. 허용 호스트는 정확히
일치해야 하며 하위 도메인은 각각 지정합니다.

후보는 `url`, `title`, `organization`, `reason`, `evidence`, `evidence_status`, `region`,
`application_period`, `source_kind`를 반환합니다. 검색 결과 수준의 근거나 불명확한 근거는
`search_snippet/uncertain`으로 보존합니다. 실제 원문 인용을 대조한 결과는 아니므로 호출자가
안전한 원문 수집·검증을 수행해야 합니다. 후보끼리의 URL 중복만 제거하며 DB 중복은 ingestion
저장소에서 처리합니다.

URL은 http(s), 기본 포트, 공개 호스트 형식만 받습니다. localhost·IP·사용자정보·비공개
호스트·허용 목록 밖 URL은 거절합니다. fragment와 알려진 추적 query만 제거하고 공고 ID
query는 보존합니다. DNS 조회나 원문 요청은 하지 않습니다. 실제 fetch는 연결 직전 DNS/IP와
redirect를 다시 검증해야 합니다.

## 제한과 격리

후보 최대 10개, query 2,000자, timeout 10~300초입니다. 설정 모델을 그대로 사용하며 큰 모델
fallback은 없습니다. 임시 workspace에서 `--ignore-user-config`, ephemeral, read-only sandbox를
사용하고 shell/apps/plugins/hooks/MCP/추가 agent를 끕니다. 다른 추출기와 사용자 전역 설정은
변경하지 않습니다. OS·CLI 로그인 환경만 자식 프로세스에 전달하며 앱 DB/API 키는 제외합니다.

JSON event·stderr·결과 파일 크기를 제한합니다. 허용하지 않은 도구/실패 event, 완료 event
누락, 실제 `web_search` event가 없는 출력은 실패입니다. event 관찰에서 웹 도구 작업 3개를
초과하면 해당 CLI 프로세스 트리를 종료합니다. CLI가 event를 늦게 내보내거나 이미 요청을 보낸
경우 검색 비용의 엄격한 사전 상한은 보장하지 않습니다. prompt에도 3회 이하를 지시합니다.
엄격한 쿼터가 필요하면 별도 검색 API의 서버 측 한도/비용 한도가 필요합니다. 오류는
`CodexRunError` 안전 코드이며 raw event/stderr는 임시 폴더와 함께 제거합니다.

설정 근거: [OpenAI 공식 Codex 설정](https://learn.chatgpt.com/docs/config-file/config-reference),
[비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode). 설치 CLI의 실제 모델·검색
지원 및 계정 한도는 별도 서버 검증 대상입니다.

## Windows 스케줄

`backend/scripts/ingestion-schedule.ps1 -Action Install|Remove|Status`는 전용 Windows Task
Scheduler 작업 하나를 관리합니다. Install 기본은 비활성 등록이고 `-EnableLiveCollection`을
명시하면 활성화합니다. 같은 이름 작업을 자동 덮어쓰지 않습니다. 현재 실행 계정으로 CLI
로그인·DB 설정을 준비해야 합니다.

명령은 backend의 `.venv/Scripts/python.exe -m app.modules.ingestion tick`입니다. 10분 간격,
`IgnoreNew`, `StartWhenAvailable`, 최대 11분, 현재 로그인 사용자·일반 권한을 사용합니다.
Windows 기본 조건대로 AC 전원에서 시작하고 배터리 전환 시 중단합니다. API/MySQL을 기동하지
않습니다. 절전·종료·로그아웃 중 24시간 동작은 보장하지 않으며 다음 실행에서 DB checkpoint를
재개해야 합니다. 이 작업 중 스케줄 등록/CLI 실행/실제 공고 검색은 수행하지 않습니다.
`-EnableLiveCollection`인 경우에만 worker 명령에도 `--live`를 추가합니다. 기본 등록을 수동으로
시작해도 실제 수집을 하지 않습니다. discovery 자체는 ingestion의
`ingestion_discovery_enabled=false` 기본 설정으로 별도 비활성입니다.

## 오프라인 검증

backend에서 `./.venv/Scripts/python.exe -m pytest app/modules/discovery/tests`를 실행합니다.
subprocess stub으로 격리·환경 제외·검색 event·후보 schema/URL/근거·timeout·출력 한도를
검증합니다. 실제 CLI/네트워크/DB는 호출하지 않습니다. 스케줄 스크립트는 PowerShell parser로만
검증하며 Install/Remove를 실행하지 않습니다.
