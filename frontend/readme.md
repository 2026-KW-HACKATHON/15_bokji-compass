# 프론트엔드

담당: 프론트엔드. 공공 복지·지원 정보를 탐색하는 사용자 화면을 관리합니다.

- `web/`: React + JavaScript 반응형 웹. [실행·검증 방법](web/readme.md).
- `android/`: 향후 Android 앱. Java 기반 계획을 유지하며 아직 구현하지 않았습니다.
- `ios/`: 향후 iOS 앱의 경계와 계획. 언어·프레임워크 미확정, 아직 구현하지 않았습니다.
- `docs/`: 구조·API 연동·플랫폼 확장·작업 기록.

2026-09-22 기준 웹 시작 화면과 로컬 예시 탐색을 구현했습니다. 모든 화면은 합성 예시이며 실제 정책 API는 아직 없습니다. 백엔드와는 공개 HTTP API로만 연결하고 DB·원문·내부 소스에 직접 접근하지 않습니다.

실행: `cd frontend/web` → `npm.cmd ci` → `npm.cmd run dev`. 검증: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:e2e`.
