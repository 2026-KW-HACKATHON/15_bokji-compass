# 현재 백엔드 구조와 협업 규칙

- `server.py`: `.env` 설정을 이용하는 Uvicorn 실행 진입점.
- `app/main.py`: FastAPI 조립과 lifespan.
- `app/core/`: 설정과 MySQL 연결 풀 생성.
- `app/api/`: health·readiness 라우터.
- `app/contracts/`: `RawDocument`, `SourcePolicy`, `PolicyExtraction`과 자료형·상태 검증 계약.
- `app/modules/`: 수집·원문 저장, 공급자별 입력 변환, CLI 모델 호출, 근거 검증, 파일 초안 파이프라인. [모듈 책임](../app/modules/readme.md).
- `database/`: 개발 스키마·합성 시드·조회 SQL. 설치 시 자동 적용하지 않음.
- `requirements.in`, `requirements-dev.in`: 직접 의존성 원본.
- `requirements.txt`, `requirements-dev.txt`: 생성된 전체 의존성 버전·해시.
- `pyproject.toml`: pytest·Ruff 설정.
- `scripts/`: Windows 설치·서버·DB·원문 파싱·테스트·의존성 갱신 도구.
- `tests/`: 외부 서비스를 호출하지 않는 개발환경·파싱·CLI 검증 테스트.
- `data/`: Git에서 제외하는 원본·파싱 결과·프로젝트 개발 DB. 파일 저장과 DB 저장은 별개.
- `experiments/`: 이전 6개 정책 분류 실증·스키마 적용 예제. 범용 실행은 `app/modules/pipeline` 사용.
- `docs/`: 공통 문서와 작업 기록.

백엔드와 프론트엔드는 소스·환경을 분리하고 공개 HTTP 계약으로 연결합니다. 서버 설치는 다른 영역의 폴더 존재에 의존하지 않습니다. 업무 모듈은 public.py에 공개한 인터페이스만 사용하고 import 시 외부 호출·저장을 하지 않습니다.

모든 기능 폴더는 소문자 readme.md에 책임·입력·반환·호출·오류·검증·미구현 사항을 기록합니다. 완료되지 않은 후속 계획은 구현 완료로 보고하지 않습니다. [현재 상태](implementation-status.md), [설치와 실행](development.md), [후속 계획](implementation-plan.md)을 참고합니다.
