# 웹 구조와 Android/iOS 확장

기준: 2026-09-22. 현재 구현은 React/JavaScript 웹이며 네이티브 앱은 계획 단계입니다. 담당: 프론트엔드.

## 화면과 탐색

공통 정보 구조는 홈 → 혜택 탐색 → 상세 보기 → 관심 혜택 저장이며, 별도로 내 프로필을 제공합니다. 웹에서는 네 메뉴를 데스크톱 사이드바·모바일 하단 메뉴로 노출합니다. URL은 `#home`, `#explore`, `#saved`, `#profile`이고 상세 화면은 다이얼로그입니다. 네이티브에서는 같은 기능을 탭과 상세 스택으로 구현할 수 있습니다.

## 책임 분리

```text
app/App.jsx                         웹 화면 상태·해시 탐색·기능 조립
features/policies/PolicyCard.jsx     웹 표시
features/policies/policyRepository.js 데이터 공급 경계·순수 검색 함수
features/policies/demoPolicies.js    합성 예시·탐색용 분류
features/profile/profileModel.js     프레임워크 독립 데이터 검증
features/profile/ProfileForm.jsx     웹 폼
shared/storage.js                   localStorage 어댑터
shared/api/client.js                웹 환경설정·HTTP 상태 점검
shared/ui/                          DOM 기반 공통 표시
```

상위 화면은 저장소/HTTP 구현을 직접 섞지 않습니다. 순수 검색·검증에는 DOM, React, 브라우저 저장소를 넣지 않습니다. API 응답은 확정된 계약에 따라 데이터 공급 경계에서 화면 모델로 변환하도록 확장합니다. 현재 백엔드 정책 HTTP 계약은 없으므로 내부 파싱 JSON을 공개 API 모델로 간주하지 않습니다.

## 모바일 앱 개발 시

| 항목 | 웹 구현 | Android/iOS 확장 원칙 |
|---|---|---|
| 정보 구조 | 네 메뉴·상세 모달 | 같은 메뉴·상세 흐름, 플랫폼별 UI |
| 정책 데이터 | 합성 fixture를 반환하는 repository | 확정된 공개 API, 동일 상태·오류 의미 사용 |
| 검색/검증 | 순수 JS 함수 | 네이티브 언어에서는 동일 규칙/fixture로 구현. JS 앱 선택 시 공유 패키지 추출 |
| 환경변수 | Vite 공개 API 주소 | 플랫폼별 build config. 클라이언트에 비밀키 미포함 |
| 로컬 설정 | 버전 키를 가진 localStorage | 기기 저장소 어댑터로 교체. 현재 동기화 없음 |
| 인증 | 미구현 | 서버 계약 확정 후 도입. 토큰은 네이티브 보안 저장소 등 별도 설계 |
| 딥 링크 | 해시 메뉴 | 앱 링크·유니버설 링크와 실제 정책 ID는 추후 설계 |
| 알림 | 미구현 | 권한·푸시 토큰·동의·백엔드 발송 계약 먼저 확정 |

Android Java 계획은 변경하지 않습니다. iOS 언어와 크로스플랫폼 여부는 앱 개발 시작 시 결정합니다. 현재 웹을 곧바로 네이티브 앱으로 배포할 수 있다고 간주하지 않으며 Capacitor/React Native/Flutter를 미리 강제하지 않습니다. shared npm 패키지나 monorepo 도구는 실제 두 번째 소비자가 생길 때 도입합니다.

## 저장·접근성

`bokji.saved.v1`은 예시 ID 배열, `bokji.profile.v1`은 `{region, interests}`입니다. 설정·관심 혜택은 기기별이며 서버에 전송하지 않습니다. 손상된 JSON은 기본값, 저장 실패는 이번 화면에서만 유지한다는 알림을 제공합니다. 실제 데이터 전환 시 예시 ID를 실정책 ID와 혼용하지 않도록 저장 키/마이그레이션을 새로 설계합니다.

320px부터 반응형 배치, 모바일 safe-area, 하단 고정 메뉴, 터치 타깃, 시맨틱 버튼/폼/탐색, 필터 선택 상태, 키보드 포커스, 모달 초점 제어와 Escape를 지원합니다. 브라우저 E2E의 모바일 크기 검증은 실제 iOS Safari나 네이티브 접근성 검증을 대신하지 않습니다.
