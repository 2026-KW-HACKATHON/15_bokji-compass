# Android 앱 개발 위치

담당: 프론트엔드/모바일. 2026-10-01부터 Android·iOS를 함께 개발하는 [mobile/](../mobile/readme.md)의 React Native + Expo 앱을 사용합니다. 이 폴더는 안내 문서이며 실행 진입점이 없습니다. 기존 Java 별도 구현 계획을 변경했습니다. Android 네이티브 프로젝트가 필요하면 mobile에서 Expo Prebuild로 생성하며 이 폴더에 중복 생성하지 않습니다.

웹과 동일한 개인비서 추천·공고 탐색·저장·내 정보 구조와 [제안 HTTP 계약](../docs/service-contract.md)을 사용합니다. 큰 글꼴·모션 감소·단계 입력을 포함한 쉬운 화면도 플랫폼에 맞게 구현합니다. DOM/CSS/localStorage에 직접 의존하지 않습니다. 로컬 저장·인증·알림·딥 링크는 플랫폼별 어댑터로 구현할 예정입니다. 상세 기준은 [공통 구조](../docs/architecture.md)를 참고합니다.
