# 회원 알림

2026-10-08 시각 조정: 숫자 배지는 일반 화면 20→16px, 쉬운 화면 26→20px로
줄였습니다. 글자는 각각 9px/11px, 굵기는 650이며 99+ 표시는 유지합니다. 굵은 흰색
테두리는 주변 배경색을 따르는 1px 경계로 바꾸고, 종의 선 굵기는 1.5로 낮췄습니다.
쉬운 화면의 버튼 외곽선은 없애고 호버/열림 배경을 연하게 했습니다. 클릭 영역과
키보드 초점 표시는 유지합니다.

조정본은 실제 사이트의 `index-C9McTa6l.js`에 반영했습니다. 웹 단위 166개와 기존
PC/모바일 브라우저 8개·빌드를 통과했고 공개 사이트에서도 합성 회원을 사용해 위
크기·외곽선과 목록 이동을 확인했습니다. 증거는 `tmp/notification-polish-live-check.json`과
같은 이름의 desktop/easy-header PNG에 보관했습니다.

2026-10-08. 회원 이름 옆 종 아이콘에 서버가 제공한 안 읽은 알림 수를 표시합니다.
0개이면 배지를 숨기고 100개 이상은 `99+`로 줄여 쓰며, 접근성 이름에는 실제 개수를
유지합니다. 비회원·데모 모드에서는 계정 알림을 노출하지 않습니다.

종을 누르면 최근 알림 6개가 세로 목록으로 열립니다. 읽지 않은 항목은 파란 배경과
‘새 알림’으로 구분하며 ‘알림 전체 보기’는 내 정보의 `#new-notices`로 이동합니다.
Escape·닫기 버튼·바깥 클릭·포커스 이탈·페이지 변경으로 접습니다. 키보드로 열고
목록에 접근할 수 있고, 상세를 닫으면 종으로 초점을 돌립니다. 모바일·쉬운 화면과
5개 언어를 지원하고 동작 줄이기 설정에서는 등장 애니메이션을 생략합니다.

목록과 신규공고 페이지에서 알림 본문을 누르면 `policy_id`로 최신 공고를 조회해
기존 공고 상세를 엽니다. 읽지 않은 알림만 읽음 API로 저장합니다. 공고 404는
지속 복지 안내로 연결하고 이유를 알립니다. 조회 실패 시 목록에서 다시 시도할 수
있으며 읽음 저장 실패를 성공으로 표시하거나 배지 숫자를 임의로 줄이지 않습니다.

`NotificationBell({refreshKey,routeKey,onOpenAlert,openingId})`는 `App`이 회원 ID로
분리해 mount합니다. 최초 진입·종 열기·60초 간격·브라우저 복귀·monitoring 수정 후
인증된 snapshot을 다시 조회합니다. polling은 저장된 안내 조회이며 새 공고 평가나
외부 푸시 전송이 아닙니다. 읽음·설정·삭제 성공은 데이터가 없는 로컬 무효화 이벤트를
보내 배지와 본문의 조회를 갱신합니다. 계정 정보는 전역 이벤트나 브라우저 저장소에
보관하지 않습니다. 취소된 요청은 이벤트를 보내지 않습니다.

`useAlertNavigation({owner,scope,repository,onOpen,onRelatedPage,onMessage})`는
`{openAlert,openingId}`를 반환합니다. `openAlert(alert)`는 이동 성공 여부의 Promise를
반환하고 중복 클릭을 막습니다. 계정·페이지 변경과 unmount는 요청을 취소하며 늦은
응답으로 이전 공고를 열지 않습니다. `onRelatedPage(message)`는 페이지 이동 안내를
받고 App의 `routeNotice`를 통해 hash 변경 후에도 메시지를 유지합니다.

`MonitoringPanel`과 이를 감싸는 `AssistantPage`/`MonitoringPage`는
`onOpenAlert(alert)`·`openingAlertId`를 받습니다. 개별·현재 표시된 알림 전체 읽음은
기존 API를 유지하며 작성 중인 생활정보 초안은 알림 갱신으로 초기화하지 않습니다.

검증 위치: `frontend/web/tests/e2e/monitoring.spec.js`와
`header-account-layout.spec.js`. 합성 API 응답으로 공고 연결, 읽음/배지 동기화,
신규 도착, 실패/재시도, 404, 늦은 응답, 키보드, 320px 및 번역 배치를 확인합니다.
실행 결과는 [작업 기록](worklog.md)에 기록합니다.

2026-10-08 실서비스 반영: 앞선 검증 빌드는 `tmp/notification-bell-build-final`에만
생성되어 Caddy가 제공하는 `frontend/web/dist`에는 종이 없는 이전 파일이 남아 있었습니다.
검증된 해시 assets를 먼저 복사하고 진입 HTML을 원자적으로 교체했습니다. 기존 assets와
다운로드 파일은 유지했으며 이전 HTML은 `tmp/notification-live-backup-6acf1c1a4a104dfca9257b7e1d201f29/index.html`에 보관했습니다.
공개 HTTPS가 `index-CgnFo1SF.js`와 `no-store` 진입 HTML을 제공하고 웹/번들/API health가
200임을 확인했습니다. 실서비스 HTML·JS·CSS를 사용한 브라우저에서 합성 계정/알림으로
종·배지·목록·전체 보기 이동을 확인했습니다. 실제 회원 알림을 조회하거나 읽음 변경하지
않았습니다. 증거: `tmp/notification-live-desktop.png`, `tmp/notification-live-check.json`.
