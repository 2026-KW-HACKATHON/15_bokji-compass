# 현재 백엔드 구조와 협업 규칙

- `server.py`: `.env` 설정을 이용하는 Uvicorn 실행 진입점.
- `app/main.py`: FastAPI 조립과 lifespan.
- `app/core/`: 설정과 MySQL 연결 풀 생성.
- `app/api/`: health·readiness 라우터.
- `app/contracts/`: 수집 원문 `RawDocument` 계약.
- `app/modules/`: 원문 수집·파일 저장, Gov24 조회·정책 행 변환 및 후속 모듈 구조.
- `database/`: 개발 스키마·합성 시드·조회 SQL. 설치 시 자동 적용하지 않음.
- `requirements.in`, `requirements-dev.in`: 직접 의존성 원본.
- `requirements.txt`, `requirements-dev.txt`: 생성된 전체 의존성 버전·해시.
- `pyproject.toml`: pytest·Ruff 설정.
- `scripts/`: Windows 설치·서버·DB·테스트·의존성 갱신 도구.
- `tests/`: 외부 서비스를 호출하지 않는 개발환경 테스트.
- `data/`: Git에서 제외하는 로컬 원본·프로젝트 개발 DB.
- `docs/`: 공통 문서와 작업 기록.

백엔드와 프론트엔드는 소스·환경을 분리하고 공개 HTTP 계약으로 연결합니다. 서버 설치는 다른 영역의 폴더 존재에 의존하지 않습니다. 업무 모듈은 public.py에 공개한 인터페이스만 사용하고 import 시 외부 호출·저장을 하지 않습니다.

모든 기능 폴더는 소문자 readme.md에 책임·입력·반환·호출·오류·검증·미구현 사항을 기록합니다. 완료되지 않은 후속 계획은 구현 완료로 보고하지 않습니다. [설치와 실행](development.md), [후속 계획](implementation-plan.md)을 참고합니다.
