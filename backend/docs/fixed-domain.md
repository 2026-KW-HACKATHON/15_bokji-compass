# commitnaru.com 고정 도메인 연결

주소: 웹 `https://bokji.commitnaru.com`, 앱 API `https://bokji.commitnaru.com/api`. 루트 도메인은 다른 프로젝트·소개 페이지에 사용할 수 있도록 이번 연결에서 설정하지 않습니다.

## Cloudflare 설정

1. Cloudflare에 `commitnaru.com`을 추가하고 Free 플랜을 선택합니다.
2. 배정된 네임서버 `aaden.ns.cloudflare.com`, `addyson.ns.cloudflare.com` 두 개를 호스팅케이알 도메인 관리에서 기존 네임서버 대신 등록합니다. 이 값들은 이번 Cloudflare 계정에 실제 배정된 값입니다. Cloudflare에서 도메인이 Active가 되는지 확인합니다.
3. Networking → Tunnels에서 `bokji-compass` 터널을 만듭니다.
4. Routes → Add route → Published application에 호스트 `bokji.commitnaru.com`, Service URL `http://127.0.0.1:8080`을 등록합니다. 다른 PC로 서버를 옮기면 해당 PC에서 같은 터널을 실행합니다.
5. 터널 Overview → Install cloudflared connector의 연결 명령 옆 복사 버튼을 누르고, 복사한 내용을 `backend/data/tunnel-demo/tunnel-token.txt`에 저장합니다. 토큰만 넣거나 `cloudflared.exe service install ...` 명령 전체를 넣어도 됩니다. 스크립트가 명령을 실행하지 않고 토큰만 추출합니다. 이 파일은 Git에서 제외된 로컬 파일입니다. 토큰을 문서·채팅·커밋에 복사하지 않습니다. 이 구성에서는 Windows 서비스 설치 대신 프로젝트 실행 스크립트가 cloudflared를 관리합니다.

공식 안내: https://developers.cloudflare.com/tunnel/get-started/

## 실행

저장소 루트에서:

```powershell
./backend/scripts/share.ps1 start -TunnelMode fixed
./backend/scripts/share.ps1 status
./backend/scripts/share.ps1 reload
./backend/scripts/share.ps1 stop
```

기본 `start`는 로컬 토큰 파일이 있으면 고정 터널, 없으면 기존 Quick Tunnel을 사용합니다. 잘못된 토큰이 있으면 임시 주소로 자동 전환하지 않고 실패합니다. 고정 연결을 요구할 때는 `-TunnelMode fixed`를 사용합니다. 다른 프로젝트·주소에는 `-PublicUrl https://다른호스트`와 `-TunnelTokenFile 실제파일경로`를 지정할 수 있습니다.

토큰은 프로세스 인수에 직접 넣지 않고 cloudflared의 `--token-file`로 읽습니다. QR 관리 화면은 실행 상태의 고정 주소를 읽습니다. 관리자 로그인과 웹/API 공개 경로를 유지합니다. 공유 계정은 서버에 설정한 암호화 MySQL 저장소를 사용하며 기존 SQLite는 명시적으로 이관해야 합니다.

## 연결 확인

- 외부 HTTPS 루트가 웹을 표시하고 `/api/health`가 200을 반환하는지 확인합니다.
- `/admin/exhibition/`은 비로그인 접근을 차단하고, 관리자 로그인 후 QR 주소가 `https://bokji.commitnaru.com/`인지 확인합니다.
- 터널 연결 로그만으로 DNS·사이트 정상 동작을 확인했다고 보지 않습니다. 휴대폰 데이터망에서 웹 로그인·공고 목록·질문 응답을 확인합니다.
- APK를 배포하기 전에 고정 API 주소로 별도 release 빌드·서명·설치 검증을 수행합니다. 도메인 연결만으로 APK가 생성되지는 않습니다.
- 도메인 연결과 서버 가동은 별개입니다. PC·API·Caddy·cloudflared·필요한 MySQL이 실행되어 있어야 합니다.

2026-10-02 연결 완료: Cloudflare Free 플랜과 구매처 네임서버 변경을 적용했습니다. 공개 DNS에서 배정된 두 네임서버와 `bokji.commitnaru.com`의 Cloudflare 주소를 확인했습니다. 승인 후 `bokji-compass` 터널(ID `76dd27d0-a928-480e-a6e2-266b505fa948`)과 `bokji.commitnaru.com` → `http://127.0.0.1:8080` 경로·CNAME을 만들었고, 사용자가 저장한 로컬 토큰으로 PC 연결을 완료했습니다. 현재 backend·QR·web·tunnel 프로세스가 실행 중입니다.

외부 HTTPS 검증: 웹 루트 200과 브라우저 화면 표시, `/api/health` 200, `/api/health/ready` 200(`database: reachable`), `/api/v1/policies?limit=1` 200, 비로그인 `/admin/exhibition/` 401을 확인했습니다. 토큰 파일의 Git 제외, PowerShell 구문·잘못된 URL·토큰 누락/형식 오류 시 실행 차단, QR 관련 테스트 4개 통과도 확인했습니다. 휴대폰 데이터망 로그인·질문 응답, 관리자 로그인 후 QR 확인, APK 빌드·실기기 설치는 별도 검증이 필요합니다.
