# 웹 성능·공고 필터 점검

2026-10-08. 기존 수정 사항을 유지하면서 초기 로딩과 공고 조회 인증을 수정했습니다.

## 변경

- `App.jsx`에서 회원·관리자·간단 계산기·상세 계산기·캘린더·프로필 화면을
  `React.lazy`로 분리했습니다. 해당 화면에 진입할 때 코드를 불러오고 본문에
  번역된 로딩 상태를 표시합니다. 기존 안내·동네 복지·AI 비서의 지연 로딩은 유지합니다.
- `policyRepository.list`가 `eligibleOnly` 요청에 회원 인증 정보를 전달하도록
  수정했습니다. 이전에는 공통 HTTP 클라이언트의 `credentials: 'omit'` 기본값으로
  호출하여 로그인했어도 서버에서 회원을 확인할 수 없었습니다.
  일반 공고 검색에는 쿠키를 보내지 않습니다. API 응답 형식은 같습니다.

## 빌드 측정

같은 의존성과 Vite 설정으로 수정 전후 `npm.cmd run build`를 비교했습니다.

| 메인 JavaScript 청크 | 수정 전 | 수정 후 |
| --- | ---: | ---: |
| 최소화 크기 | 546.90 kB | 427.05 kB |
| gzip 크기 | 160.29 kB | 128.22 kB |

메인 청크는 약 22%, gzip 기준 약 20% 감소했고 500 kB 초과 청크 경고가 사라졌습니다.
공통 청크와 첫 화면에서 사용하는 코드는 계속 로드됩니다. 전체 다운로드량이나 실제
사용자의 로딩 시간이 22% 개선됐다는 의미는 아닙니다.

## 검증

- 인증 회귀 단위 테스트가 수정 전 `include` 대신 `omit`을 받아 실패하는 것을 확인했습니다.
- 웹 전체 단위 테스트 155개 통과.
- 실제 브라우저에서 로그인 전용 필터의 쿠키 전송과 일반 검색의 쿠키 제외를 검사합니다.
- PC·모바일의 공고 탐색, 로그인/가입, 프로필, 계산기, 캘린더 회귀 시나리오를 사용합니다.
- 위 PC·모바일 브라우저 회귀 검사 134개 모두 통과(약 4.8분).
- 변경 JavaScript·JSX의 Prettier 검사와 빌드 통과.

재실행 명령(frontend/web 폴더):

```powershell
npm.cmd test
npm.cmd run build
npx.cmd playwright test tests/e2e/explorer-filters.spec.js tests/e2e/app.spec.js tests/e2e/calculator.spec.js tests/e2e/calendar.spec.js tests/e2e/auth.spec.js --workers=4
```

백엔드의 조회 메모리 및 접수 상태 수정은 [서버 기록](../../backend/docs/catalog-performance.md)을 참고합니다.
