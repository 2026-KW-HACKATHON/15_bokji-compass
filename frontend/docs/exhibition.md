# 전시용 Android·웹 배포

2026-10-02 결정: 네이티브 배포는 Android만 준비합니다. iPhone은 웹으로 안내하며 기존 iOS 소스를 삭제하지는 않습니다. 전시회 4일 동안 같은 주소로 QR과 설치 앱을 사용할 수 있어야 합니다.

## 고정 주소부터 준비

사용자가 구매한 도메인은 `commitnaru.com`이며 복지나침반 주소 `https://bokji.commitnaru.com`, 앱 API 주소 `https://bokji.commitnaru.com/api`의 연결을 완료했습니다. [Cloudflare 연결·실행 절차](../../backend/docs/fixed-domain.md)를 따릅니다. 외부 접속 검증 결과와 남은 검증은 해당 문서에서 확인합니다.

`backend/scripts/share.ps1`은 로컬 토큰 파일이 있으면 고정 터널을 사용하고, 없으면 Quick Tunnel을 생성합니다. 고정 주소를 요구하면 `start -TunnelMode fixed`로 실행합니다. `trycloudflare.com` 주소는 재생성할 때 바뀌고 프로세스 종료 시 접속이 중단되므로 최종 APK API 주소·인쇄 QR에 사용하지 않습니다. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

Cloudflare의 `bokji-compass` 터널에 published application hostname `bokji.commitnaru.com`을 등록하고 현재 웹 서버 `http://127.0.0.1:8080`에 연결했습니다. 다른 PC로 옮기거나 서버 IP가 바뀌어도 같은 도메인과 터널 구성을 유지할 수 있습니다. 도메인은 사용자가 구매했고 Cloudflare 계정 연결·DNS 변경·PC 터널 연결을 완료했습니다. [Cloudflare 설정](https://developers.cloudflare.com/tunnel/get-started/)

운영 주소(2026-10-06 서명 APK 등록 완료):

| 용도 | 고정 주소 |
| --- | --- |
| Android·iPhone 웹 서비스 소개 QR | `https://bokji.commitnaru.com/#guide` |
| Android 다운로드 QR | `https://bokji.commitnaru.com/downloads/bokji-compass.apk` |
| APK 빌드에 사용할 서버 주소 | `https://bokji.commitnaru.com/api` |

앱 반영(2026-10-02): 모바일 `.env.example`, 이 PC의 `.env`, EAS development/preview/production 설정에 고정 API 주소 적용. Caddy는 모바일 로그인/me/logout 및 알림 설정·기기 등록 경로를 기존 서버 인증과 함께 연결합니다. 현재 QR 화면은 고정 터널 주소를 사용합니다. 이미 설치한 독립 APK는 새 버전으로 다시 빌드·서명·설치해야 하며 이 주소 변경 작업에서 APK를 배포하지는 않았습니다.

현재 앱 HTTP 클라이언트는 리다이렉트를 차단합니다. API 주소에 단축 URL/웹 리다이렉트를 넣지 말고, 고정 호스트가 리버스 프록시로 실제 API 응답을 직접 전달하도록 구성합니다. 웹 주소만 고정하고 APK 내부에 임시 주소를 남기면 설치 앱은 끊깁니다.

도메인을 구매하지 않는 경우 호스팅 서비스가 제공하는 고정 HTTPS 하위 도메인을 사용할 수도 있지만, 해당 서비스의 지속 주소·절전 정책·백엔드/DB/LLM 실행 지원을 확인해야 합니다. 현재 PC 구조를 유지하려면 팀 도메인+Tunnel이 변경량이 작습니다.

## 4일 운영 준비

- 주소 고정은 가동 보장이 아닙니다. 상시 실행 서버 또는 전원·절전 해제·안정된 인터넷·복구 절차를 갖춘 PC를 사용합니다. Cloudflare Tunnel 연결과 웹/API/DB/모델을 함께 확인합니다.
- 전시회 시작 전 고정 주소를 확정하고 TLS 인증서, 웹 쿠키, 모바일 Bearer 인증, API 프록시를 점검합니다.
- 현재 `Caddyfile.tunnel`은 `/health`, `/health/ready`, `/v1/auth/*`, `/v1/finance/*`, 공개 공고·FAQ·질문과 서버 권한 검사가 적용된 관리자 경로를 전달합니다. 응답 헤더 대기 제한은 75초입니다. 모바일 인증·질문 응답의 실기기 검증은 별도로 수행합니다. 미공개 공고 원문을 자동 공개하지 않습니다.
- 최종 APK는 고정 API 주소·배포 서명·독립 JS 번들·실기기 ARM64를 기준으로 생성하고 보안 검사와 신규 설치/업데이트를 확인합니다. 서명키는 Git 밖에 백업합니다.
- 앱을 4일 뒤에도 사용할 수 있게 할지, 전시 종료 안내를 제공할지도 결정합니다. 사용자가 설치한 앱의 주소를 계속 유지할 기간을 고려합니다.

## QR 운영

[관리 화면 실행·APK 등록](../web/tools/exhibition/README.md)을 따릅니다. 사이트 관리자 로그인 후 상단 **전시 QR 관리**(`/admin/exhibition/`)에서 엽니다. 일반 회원에게 메뉴를 표시하지 않으며 직접 주소를 입력해도 서버가 차단합니다. 최고 관리자는 **관리자 관리**(`#admin`)에서 QR 전용 하위 관리자를 생성할 수 있습니다. 하위 계정에는 관리자 생성·DB 관리 권한을 부여하지 않습니다.

QR 관리 화면은 기본적으로 `https://bokji.commitnaru.com/#guide`와 같은 도메인의 APK 다운로드 주소를 사용합니다. 웹 QR은 서비스 소개 페이지로 바로 연결됩니다. 공유 서버 재시작이나 임시 터널 기록에 따라 주소를 바꾸지 않습니다. 기존 메인 페이지나 임시 주소로 인쇄한 웹 QR은 새 PNG로 교체합니다. 다른 도메인이 필요하면 직접 입력하거나 `EXHIBITION_PUBLIC_URL`로 지정합니다.

2026-10-06 현재 상태: 서버 연결 장애 안내를 포함한 서명 APK를 `public/downloads`와 실행 중인 서버의 `dist/downloads`에 등록했습니다. QR 관리 페이지의 APK 다운로드 버튼과 설치 안내를 갱신했으며 공개 HTTPS 전체 다운로드가 서명 APK와 동일한 SHA-256임을 확인했습니다. APK MIME·attachment·no-store 응답 정상, QR 관리 비로그인 접근은 계속 401입니다. QR/다운로드 화면은 테스트 관리자 인증 대역으로 검증했으며 실제 관리자 로그인과 Android 휴대폰 설치·실행은 별도 확인이 필요합니다. 같은 다운로드 주소를 유지하므로 기존 고정 QR을 그대로 사용할 수 있습니다. iOS 네이티브 배포는 이번 전시 범위에서 제외합니다.
