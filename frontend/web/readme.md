# 복지나침반 웹

담당: 프론트엔드. React + JavaScript + Vite 기반 반응형 웹 시작점입니다. 홈, 혜택 탐색, 관심 혜택, 내 프로필을 제공하며 백엔드 없이 실행할 수 있습니다.

## 실행

Node.js 22.12 이상과 npm이 필요합니다. [Vite 설치 기준](https://vite.dev/guide/) 및 [React 문서](https://react.dev/learn)를 참고했습니다. 저장소 루트의 PowerShell에서:

```powershell
cd frontend/web
npm.cmd ci
npm.cmd run dev
```

http://127.0.0.1:5173 에 접속합니다. 기본 포트가 사용 중이면 종료 후 재시작하거나 `npm.cmd run dev -- --port 5174`를 사용합니다.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
npm.cmd run test:e2e
npm.cmd run format:check
```

`build`는 정적 산출물을 `dist/`에 생성하고 `preview`는 로컬 4173 포트에서 확인합니다. E2E는 설치된 Microsoft Edge를 사용하며 데스크톱과 모바일 크기의 Chromium으로 검증합니다. Edge가 없는 환경에서는 `npx playwright install chromium` 후 `playwright.config.js`의 `channel: 'msedge'`를 제거하세요. 실제 Android/iOS 네이티브 앱 및 Safari 테스트와는 구분됩니다.

`npm.cmd run format`은 Prettier로 소스를 정리하고 `format:check`는 수정 없이 형식을 확인합니다.

## 구현 범위

- `#home`, `#explore`, `#saved`, `#profile` 해시 탐색 및 브라우저 뒤로/앞으로 이동.
- 합성 예시 6개, 키워드 AND 검색, 분야·지역·대상 필터, 최근 등록/이름 정렬. 특정 지역에는 전국 혜택도 포함.
- 상세 다이얼로그, 키보드 Escape 닫기와 초점 복귀, 검색 결과 없음/로딩/실패 표시.
- 관심 혜택과 관심 지역·분야를 현재 브라우저에 저장. JSON 손상·저장 거부 시에도 화면 이용 가능.
- 모바일 하단 탐색, safe-area, 320px 폭 대응, 데스크톱 사이드바.
- 서비스 안내의 서버 연결 확인만 실제 `GET /health` 호출. 정책 API는 호출하지 않음.

모든 혜택은 화면 체험용 합성 데이터이며 실제 지원 조건·금액·모집 일정을 나타내지 않습니다. 실제 정책 조회·신청·자격 판정·로그인·푸시·기기 동기화는 미구현입니다. 프로필은 탐색 설정이고 자격 판정용 개인정보가 아닙니다. 관심 분야로 둘러보기는 선택한 분야 중 첫 번째와 지역을 필터에 적용합니다.

## 구조와 공개 진입점

| 경로 | 역할 / 입력과 반환 |
|---|---|
| `src/main.jsx` | DOM 루트에 React 앱 마운트 |
| `src/app/App.jsx` | `App()` → 화면 트리. 해시 이동, 화면 상태, 기능 조립 |
| `src/features/policies/` | 예시 정책·탐색 로직·혜택 카드. [호출 계약](src/features/policies/readme.md) |
| `src/features/profile/` | 프레임워크 독립 프로필 검증과 웹 입력 폼 |
| `src/shared/api/client.js` | `checkHealth()` → `Promise<{status, service}>`; HTTP/형식/연결/5초 시간 초과 시 throw |
| `src/shared/storage.js` | 브라우저 저장 어댑터. [사용법](src/shared/readme.md) |
| `src/shared/ui/` | 아이콘, SVG 일러스트, native dialog 래퍼 |
| `tests/` | Node 단위 테스트, Playwright 사용자 흐름·반응형 검증 |

현재 JavaScript 로직은 화면 프레임워크와 분리했지만 독립 공유 패키지는 아직 만들지 않았습니다. 향후 Android/Java 또는 iOS/Swift에서는 동일 HTTP 계약·동작 규칙을 각 언어로 구현하고, React Native 선택 시 순수 JS 로직을 패키지로 추출할 수 있습니다. 웹 DOM/CSS를 네이티브 UI로 재사용할 수 있다는 가정은 하지 않습니다. [모바일 확장 설계](../docs/architecture.md).

## 환경과 배포

`.env.example`을 `.env`로 복사하면 서버 주소를 조정할 수 있습니다. 기본 `VITE_API_BASE_URL=/api`, 개발 proxy 대상은 `API_PROXY_TARGET=http://127.0.0.1:8000`입니다. `VITE_*` 값은 번들에 노출되므로 비밀정보를 넣지 않습니다.

정적 호스팅에 `dist/`를 배포합니다. 운영에서 `/api/*`를 백엔드로 전달하는 reverse proxy를 구성하거나 빌드 시 공개 HTTPS API 주소와 서버 CORS를 설정합니다. Vite 개발 proxy는 운영 빌드에 포함되지 않습니다. 기본 예시 탐색에는 API가 필요하지 않습니다. Noto Sans KR 가변 폰트는 Fontsource 패키지를 통해 같은 서버에서 제공하고 외부 폰트 서버에 연결하지 않습니다. 패키지의 OFL 라이선스를 따릅니다. 오프라인 캐시/PWA 및 네이티브 포장은 아직 구성하지 않았습니다.
