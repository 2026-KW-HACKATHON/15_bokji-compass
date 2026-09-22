# 프론트엔드 협업 안내

담당: 프론트엔드. 변경 전 `web/readme.md`, `architecture.md`, `api-integration.md`와 백엔드 공개 API 문서를 확인합니다.

공통 엔드포인트·주소·응답 계약은 루트 [API 관리대장](../../api-management.md)에서 확인하고, 변경 시 백엔드 문서·테스트와 함께 갱신합니다.

- 웹은 React/JavaScript. Android Java 계획과 향후 iOS 확장을 고려해 로직·플랫폼 저장소·UI를 분리합니다.
- 합성 데이터는 실제 정책, 접수 상태, 자격 판정으로 표현하지 않습니다. 정책 API가 생기기 전 백엔드 원문/DB/내부 Python 모듈을 직접 읽지 않습니다.
- 지역은 현재 탐색용 표시값이며 공식 행정지역 코드가 아닙니다. 프로필은 추천용 선택 정보이며 자격 판정용 fact가 아닙니다. 브라우저 기억은 선택 사항이고 API 모드에서는 추천 요청에 사용합니다.
- 공고와 개인비서 추천의 제안 계약은 [service-contract.md](service-contract.md). 서버 구현 전까지 실제 LLM 연결로 표현하지 않습니다. 운영 기본 API, 개발 기본 demo와 명시적 배너를 유지합니다.
- 구현한 폴더의 README에 역할·호출 입력/반환·외부 호출·검증 방법을 기록하고 작업 기록을 갱신합니다.
- `npm.cmd test`, `npm.cmd run build`를 실행하고 사용자 흐름 변경에는 필요한 E2E를 실행합니다. 모바일 폭과 키보드 조작을 함께 확인합니다.
- `.env`, `node_modules`, `dist`, 테스트 산출물은 커밋하지 않습니다. 의존성은 package-lock.json으로 고정합니다.
