# iOS 앱 개발 위치

담당: 프론트엔드/모바일. 2026-10-01부터 [mobile/](../mobile/readme.md)의 React Native + Expo 공통 앱을 사용합니다. 이 폴더는 안내 문서이며 실행 진입점이 없습니다. iOS 로컬 빌드에는 macOS/Xcode가 필요하고 Windows에서는 EAS 개발 빌드와 실제 iPhone으로 확인합니다. 현재 iOS 번들 검증과 실제 기기 설치 검증은 구분합니다.

웹과 동일한 개인비서 추천·공고 탐색·저장·내 정보 구조와 [제안 HTTP 계약](../docs/service-contract.md)을 사용할 예정입니다. Dynamic Type·모션 감소·단계 입력을 포함한 쉬운 화면도 플랫폼에 맞게 구현합니다. 화면과 기기 저장소·인증·알림은 플랫폼에 맞게 구현합니다. 웹을 자동으로 네이티브 UI에 재사용한다고 가정하지 않습니다. [공통 구조](../docs/architecture.md).
