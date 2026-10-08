# 앱 조립

2026-10-08 회원 조건 변경: 홈 추천은 회원의 ID·만 나이·성별·지역 변화에 이전 요청을
취소하고 인증된 서버 정보로 다시 조회합니다. 동일 회원의 나이·성별·지역이 실제로
바뀌면 이전 상담을 초기화하고 AI 비서의 지속 안내를 새로 조회합니다. 최초 로그인과
회원 전환은 기존 계정별 초기화 흐름을 사용하며, 표시 이름만 변경하거나 동일 값의
회원 객체를 받아도 조건 변경 초기화를 반복하지 않습니다.
`tests/e2e/member-recommendation-context.spec.js`는 여성→남성 저장 뒤 홈·AI 추천 갱신과
이전 상담 제거를 PC/모바일에서 확인합니다. 성별 대상 판정은 서버에서 수행합니다.

2026-10-08 웹 QR 진입: `#guide?easy=0`는 일반 화면의 가이드로 시작합니다.
`readRoute()`의 `standardGuideEntry`로 첫 렌더링과 hash 이동 시 쉬운 모드를 OFF로
초기화하고 `bokji.easy.v1`에도 false를 저장합니다. 일반 주소 접속에서는 기존 화면
설정을 유지합니다. `tests/e2e/qr-entry.spec.js`는 저장된 ON·새로고침·페이지 이동을
PC/모바일에서 검증합니다.

2026-10-08 하단 문구: `SourceFooter({showSources=false}) -> <footer>`는 AI·계산 안내를 ‘AI는 실수할 수 있습니다. 안내·계산은 참고용이며, 실제 지원 여부와 금액은 심사 결과에 따릅니다.’로 간결하게 표시합니다. 일반·쉬운 화면과 네 외국어 번역에 적용하며, 안내의 고정 폭 제한을 제거해 넓은 화면은 한 줄로 표시합니다. [푸터 표시 계약](../../../docs/source-footer.md).

2026-10-08 회원명 옆 `NotificationBell`은 미읽음 수와 최근 알림을 표시하고
`#new-notices`로 전체 목록을 연결합니다. `App`의 `useAlertNavigation`이 헤더·AI 비서·
신규공고 목록의 클릭을 최신 공고 상세로 연결합니다. 공고 404는 `routeNotice`에 이유를
보관한 뒤 `#assistant-monitoring`으로 이동합니다. [알림 계약과 검증](../../../docs/notification-inbox.md).

## 2026-10-08 쉬운 화면 기준선 정렬

`easy-shell.css`의 `--easy-page-width`와 `--easy-page-gutter`는 헤더·본문·챗봇 도움말의
좌우 기준선을 함께 정의합니다. 검색 입력/버튼 높이와 관심 분야 버튼 폭을 맞추고,
홈 카드와 `easy-features.css`의 공고 카드에는 일정한 행동 열을 사용합니다.
전체 메뉴는 대메뉴·하위 메뉴를 한 행에 나란히 배치하며 좁은 화면에서는 아래로 펼칩니다.
모바일 홈 카드의 아이콘·제목은 같은 행, 행동은 전체 폭으로 표시합니다.
함수 입력·반환·외부 호출은 바뀌지 않으며 검증은 기존 메뉴·홈·공고 E2E와
PC/모바일 캡처를 사용합니다. [세부 배치와 검증 기록](../../../docs/easy-mode-alignment.md).

2026-10-08 초기 로딩 보완: 회원·관리자·간단/상세 계산기·캘린더·프로필 화면은
`React.lazy`로 해당 화면을 방문할 때 불러옵니다. 본문의 `Suspense`가 번역된 로딩
상태를 제공하고, App에서 관리하는 계정·금융 초안·탐색 상태는 유지합니다.
[빌드 크기·회귀 검사 기록](../../../docs/performance-review.md).

## 2026-10-08 상단 메뉴의 계층 구조

`PortalNavigation({page, savedCount?})`는 우리 동네 복지를 포함한 주요 메뉴 일곱 개와 전체 폭 하위 메뉴를 반환합니다. PC는 마우스 진입·키보드 포커스로 펼치며 화살표 버튼은 터치에서도 열고 닫습니다. Escape·닫기·바깥 클릭·탭 이탈·페이지 이동은 메뉴를 닫습니다. 모바일은 두 열과 내부 스크롤을 사용하고 펼친 메뉴는 챗봇 아이콘 위에 표시합니다.

`portalNavigation.js`의 `portalSections`는 표시 그룹·대상 hash 배열, `portalRoutes`는 허용 페이지 목록이며 `isSectionActive(section,page)`는 상세 계산기를 포함한 선택 그룹 여부를 반환합니다. 계산기는 내 정보 아래에, 서비스 소개·내 복지 현황은 AI 비서 아래에, 서비스 안내(`#guide`)는 홈 아래에 둡니다. `portal-navigation.css`가 기존 `portal.css` 이후 최종 배치를 적용합니다. 번역은 공통 `navigationMessages.js`를 사용하며 API에는 영향을 주지 않습니다.

`#assistant-intro`는 새 AI 소개, `#assistant-overview`는 기존 현황·정보 등록, `#guide`는 기존 서비스 이용 안내입니다. `#assistant`의 첫 방문 소개와 계산기 직접 주소는 유지합니다. `AssistantPage`의 `initialView`, `initialProfileEntry`, `onContinue`로 소개에서 현황의 정보 등록 화면으로 이동합니다. 대화는 App의 계정별 메모리에서 복원합니다. [메뉴 구조·검증 기록](../../../docs/portal-navigation.md). 아래 상단바 정렬 기록은 이 보조 줄·주 메뉴 구조로 대체됩니다.

2026-10-08 로그인 상단바 정렬: `portal.css`는 로고·메뉴·계정 영역의 열 폭을
로그인/로그아웃과 언어 변경 사이에 유지합니다. PC 메뉴 간격을 조정하고, 1380px 이하에서는
메뉴를 둘째 줄로 분리합니다. 480px 이하의 계정 메뉴는 별도 줄에 표시합니다.
긴 회원 이름은 남은 공간에 맞춰 말줄임하고 전체 이름은 `title`로 제공합니다.
`tests/e2e/header-account-layout.spec.js`는 로그인 전후의 위치, 한국어 PC 메뉴 전체 표시,
긴 회원 이름과 한국어·영어·베트남어 로그아웃 버튼 노출을 검사합니다.

2026-10-08 쉬운 공고 카드 정렬: `portal.css`의 공고 목록 간격과 카드 외형 규칙은
일반 카드에만 적용합니다. 쉬운 화면은 하나로 이어진 목록과
`easy-features.css`의 본문·상세 버튼 2열 배치를 사용하고, 680px 이하에서는 버튼을 본문 아래 전체 폭으로 둡니다.
PC/모바일 정렬·긴 본문·가로 넘침·키보드 상세 열기 검증은
`tests/e2e/easy-card-layout.spec.js`에서 수행합니다.

서비스 소개(`#guide`)의 `GuidePage.onAssistant()`는 기존 `openAssistantPage()`를 통해
`#assistant`로 이동한다. `onChatbot()`는 `{topic:'home'}` 세션으로 공통 챗봇을 연다.
이 페이지는 `hideLauncher`로 떠 있는 아이콘만 숨겨 본문 CTA를 진입점으로 사용한다.

2026-10-08: `#assistant`를 독립 ‘AI 복지비서’ 메뉴로 추가했다. `AssistantPage`는 별도 청크로
읽으며 홈에는 진입 버튼을 둔다. 공통 챗봇의 `onOpenAssistant({policy?,session?})`로 선택
공고와 현재 상담을 넘긴다. `App`은 계정별 현재 상담을 메모리에만 보관해 메뉴 이동 후에도
복원하고, 새로고침·계정 변경·생활정보 수정/삭제에서 제거한다. 상담의 부분 저장 완료는
`monitoringRefresh`를 증가시켜 현황을 갱신한다. 로그인 복귀 경로에 `assistant`를 허용한다.

2026-10-07: `main.jsx`의 `I18nProvider`와 헤더 `LanguageSelector`가 한국어·영어·중국어·베트남어·일본어를 적용합니다. App/SourceFooter/Modal의 표시 문구도 번역하며 언어 변경은 hash 경로·입력·계정 상태를 초기화하지 않습니다. 상세 계약은 [웹 번역](../shared/i18n/readme.md), 적용 범위는 [다국어 UI](../../../docs/internationalization.md)를 참고하세요.

2026-10-07 디자인 갱신: `portal.css`를 기존 스타일 다음에 로딩해 가로 공통 메뉴와 검색 중심 홈을 제공합니다. `#explore?q=...&region=...&category=...` 초기 조건을 `PolicyExplorer`에 전달하며 유효하지 않은 지역·분야는 해당 컴포넌트에서 기본값으로 처리합니다. `#guide`는 별도 청크로 불러오는 이용 안내 페이지입니다. 헤더 높이에 맞춰 안내 목차 위치를 조절하며, 모든 CTA는 기존 공고·프로필·캘린더·계산기로 이동합니다. 상세 구현·문구·검증 기록은 [웹 디자인 갱신](../../../docs/web-design-refresh.md)을 참고하세요. 아래 과거 기록의 사이드바·홈 배너 구조는 이 가로 메뉴·검색 홈으로 대체됐습니다.

2026-10-07 공개 상세는 선택 직후와 활성 상태 30초/포커스 시 최신 개정을 다시 조회합니다.
AbortController와 선택 ID 검사로 오래된 응답을 무시하고 비공개 404 시 상세를 닫아 안내합니다.

담당: 프론트엔드. App() → React 화면. hash 메뉴·tag, 프로필·추천 요청 상태·쉬운 화면·저장/상세를 조립합니다.
services.js는 공개 설정을 바탕으로 공고/추천 repository를 생성합니다. API 모드에서만 서버 호출하며 이전 요청은 취소합니다.

2026-10-07: 홈 추천은 프로필이 없는 방문자에게도 `profile:{}`로 서버에 요청합니다.
로그인 계정·프로필 변경 시 진행 요청을 취소하고 다시 조회합니다. 배너의 개인화 여부는
객체 존재 여부가 아닌 서버의 충분한 조건 비교 결과로 결정합니다. 일반/인기 후보나 정보
추가 안내를 `AssistantHome`에서 표시하며 공고를 브라우저에서 임의 생성하지 않습니다.

`SourceFooter({ showSources = false })`는 모든 웹 페이지 하단에 브랜드와 AI·계산 결과의 공통 주의 문구를 반환합니다. 일반·쉬운 화면에서 동일하게 한 번 표시하며 지원 언어로 번역합니다. `App`은 메인 페이지(`route.page === 'home'`)에서만 `showSources`를 켜 정부24·복지로·서울특별시·광운대학교의 공식 로고와 출처 링크를 표시합니다. 로고는 `public/source-logos/`의 정적 자산이며 렌더링 시 외부 서버 호출은 없습니다. 링크를 선택하면 공식 사이트가 새 창에서 열립니다. `SourceFooter.css`는 데스크톱 4열·900px 이하 2열 배치와 쉬운 화면 글자 크기를 정의합니다. 자산 출처는 [로고 안내](../../public/source-logos/README.md), 변경·검증 기록은 [공고 출처 푸터](../../../docs/source-footer.md)에 기록합니다.
styles.css는 기본·쉬운 화면의 공통 색상 토큰·모바일 safe-area·모션 감소 규칙을 제공합니다. 1201px 이상 일반 화면의 홈 배너는 1.2:1 열 배치, 최대 440px 로고 카드와 200~248px 로고로 넓은 화면의 여백을 조절합니다. 뒤에 불러오는 easy-mode.css는 공통 색상 토큰과 상태 색상을 상속하며, 사용자가 선택한 쉬운 화면에 18px 루트 크기와 제목 위계, 넓은 조작 영역을 적용합니다. 기본 화면은 16px 루트 크기를 유지합니다.
쉬운 화면의 저장 공고도 3개씩 표시하며 삭제 후 페이지 시작 위치를 남은 목록 범위로 보정합니다. 프로필·검색 조건·금융 초안은 같은 페이지에서 모드를 바꿔도 보존합니다. 인증 기능과 개인정보 저장 경계는 유지합니다.
검증 범위와 남은 회귀·접근성 확인은 [쉬운 화면 문서](../../../docs/senior-mode.md)에 기록합니다. 테스트 시나리오 존재와 실행 통과를 구분합니다.

두 모드는 같은 의미별 색상 토큰을 공유합니다. `--accent`는 주요 동작·선택, `--surface-muted`·`--muted`·`--border-strong`은 일반 안내·입력 경계, `--assist-accent`·`--assist-soft`는 AI 상담·추천 설명, `--health-accent`·`--health-soft`는 건강·돌봄 분야입니다. `--success`·`--success-soft`의 초록색은 인증·저장 완료와 계산 항목의 기준 이내 상태에만 사용합니다. 마감 주의는 `--warning`·`--warning-soft`를 사용합니다. 이전의 `--green` 이름은 실제 역할에 맞게 `--accent`로 바꿨습니다. public/brand-logo.png를 데스크톱/모바일 브랜드, 푸터, 탭 아이콘과 개인비서 메인에 사용합니다. [색상 정리·검증](../../../docs/ui-color-refresh.md).
## 2026-10-08 우리 동네 복지

일반 화면의 `PortalNavigation({ page, savedCount })`은 PC 주 메뉴와 펼친 하위 메뉴를 반환합니다. `portal-navigation.css`의 공통 7열과 헤더 여백·로고 너비 변수로 각 대카테고리와 하위 메뉴의 가로 중심을 맞춥니다. 1000px 이하에서는 `MobileNavigation`으로 전환합니다. [메뉴 정렬 기록](../../../docs/portal-navigation.md).

`#local`은 입력/저장 주소의 시·군·구를 기준으로 생활서비스를 안내합니다. 주 메뉴 7개 열과 홈 진입점을 추가했습니다. `LocalWelfarePage`를 지연 로드하며 계정 ID로 상태를 분리하고 `initialSelection`·`onSelectionChange`로 탐색 선택을 메모리에 유지합니다. [구현·검증 범위](../../../docs/local-welfare.md).
# 2026-10-08 Apple 접근성 가이드 기반 쉬운 화면

`App`은 `easy` 상태에서 `EasyNavigation({page, savedCount})`을 렌더링합니다. 반환값은 현재 위치와 전체 메뉴 disclosure이며 서버 호출은 없습니다. 메뉴는 클릭/Enter/Space로 열고 Escape로 닫으면 열기 버튼에 초점이 돌아갑니다. 경로 이동 시 접고 기존 App의 본문 초점 이동을 사용합니다. 원래 hash, 로그인, 사용자 입력과 저장 계약은 유지합니다.

`main.jsx`는 포털 스타일 다음에 `easy-shell.css`와 `easy-features.css`를 로드합니다. 전자는 헤더·탐색·검색 홈·공통 초점과 조작 크기, 후자는 공고·캘린더·폼·비서·이용 안내의 쉬운 화면을 담당합니다. 루트 글자 크기는 `112.5%`로 브라우저 기본 글자 설정을 따르며 주요 제어는 56px 이상입니다. 높이를 고정하지 않고 텍스트와 메뉴가 늘어나게 합니다. 장식 아이콘은 보조기술에서 제외하고 언어·검색·닫기 동작에는 보이는 글자 레이블을 제공합니다.

검증과 적용 기준은 [Apple 기반 쉬운 화면 개편](../../../docs/easy-mode-accessibility.md)을 참고합니다. 이전 기록의 쉬운 화면 헤더/가로 메뉴는 이 구현으로 대체됩니다.
# 2026-10-08 지속 안내·신규공고 분리 및 탭별 메뉴

후속 세로 메뉴 수정: `PortalNavigation`은 현재 열린 `openSection`과 마지막으로 표시한 `renderedSection`을 분리합니다. 닫을 때 마지막 열을 유지해 CSS grid 접힘을 완료하면서 `inert`/`aria-hidden`으로 즉시 조작을 막습니다. `--portal-menu-index`는 상위 탭 아래 열 위치, 각 항목의 `--portal-item-index`는 65ms 간격 등장 지연에 사용합니다. `portal-mega-clip`은 펼침 잘림, `portal-mega-content`는 화면 높이를 넘는 콘텐츠의 스크롤을 담당합니다. 모든 폭에서 세로 한 열이며 동작 줄이기 설정을 존중합니다. [모션·검증 기록](../../../docs/portal-navigation.md).

`portalSections`에 AI 비서 → `assistant-monitoring`(지속 복지 안내), 내 정보 → `new-notices`(신규공고 확인하기)를 추가했습니다. `App`은 해당 경로에서 지연 로드한 `MonitoringPage({notices, user, profile, mode, onOpen, onProfileChanged, onProfileDeleted, refreshKey})`를 반환하고 회원 정보 본문의 패널은 제거합니다. 페이지/계정별 key로 요청을 취소하며 기존 생활정보·읽음 API를 그대로 사용합니다.

`PortalNavigation({page, savedCount})`는 주 메뉴와 현재 연 탭 하나의 하위 링크만 반환합니다. 마우스 진입 시 선택 탭으로 전환하고 패널 밖으로 나가면 160ms 뒤 닫습니다. 화살표 클릭/Enter/Space는 열기를 유지하며 아래 화살표 키는 첫 링크로 이동합니다. Tab/Shift+Tab은 선택한 메뉴 링크와 열기 버튼을 연결하고 Escape·닫기는 초점을 복원합니다. 외부 클릭·초점 이탈·경로 변경에서도 닫습니다. 모바일은 가로 스크롤 주 메뉴·한두 열 패널, 쉬운 화면은 기존 전체 메뉴 disclosure를 사용합니다.

이 기록은 앞선 모든 열을 한꺼번에 펼치는 메뉴 설명을 대체합니다. [메뉴 변경 기록](../../../docs/portal-navigation.md).

## 2026-10-08 모바일 상단바

`MobileNavigation({page, savedCount = 0, user})`는 메뉴 열기 버튼과 전체 화면 native dialog를 반환합니다. 공유 `portalSections`로 메뉴·저장 개수·현재 위치를 표시하고 회원 정보/관리자 링크를 제공합니다. 서버 호출은 없습니다. 경로·계정 변경, 링크 선택, Escape, 닫기, PC 너비 전환으로 닫으며 배경 스크롤을 복원합니다. `main.jsx`가 마지막에 로드하는 `mobile-header.css`는 1000px 이하의 두 줄 헤더, 같은 줄의 쉬운 화면/계정, 세로 메뉴를 담당합니다. 위 과거 모바일 가로 스크롤/별도 계정 행 설명을 대체합니다. [계약·검증](../../../docs/mobile-header.md).
