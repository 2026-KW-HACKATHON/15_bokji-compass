# 프론트엔드
담당: 프론트엔드. 서버에 수집된 공고를 사용자 정보에 따라 개인비서 LLM이 추천하는 서비스를 만듭니다.

- [web/](web/readme.md): React/JavaScript 반응형 웹. 개인비서 홈·공고 검색·태그·저장·내 정보·로그인/가입 폼·쉬운 화면.
- [mobile/](mobile/readme.md): React Native + Expo Android·iOS 공통 앱. 로그인·소득/재산 계산·회원 저장/조회/삭제 첫 이식.
- [packages/core/](packages/core/readme.md): 웹·앱 공통 금융 입력 검증·질문 정의.
- [android/](android/readme.md), [ios/](ios/readme.md): 공통 앱 개발 위치 안내.
- [docs/](docs/readme.md): 구조, 서버 계약 제안, 배포, 접근성, 작업 기록.

인증·금융 계산·회원 금융정보 저장은 실제 서버 API를 사용합니다. 모바일 공고·추천 화면은 후속이며 웹과 서버의 상세 구현 상태는 [API 관리대장](../api-management.md)을 확인합니다. 프론트는 공개 HTTP로만 연결합니다.
