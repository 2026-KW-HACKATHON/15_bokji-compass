# 수집기 테스트

담당: 백엔드. 이 폴더의 테스트는 외부 HTTP를 대역으로 교체하고 파일 저장은 임시 디렉터리를 사용합니다.

| 파일 | 검증 범위 |
|---|---|
| `test_public.py` | 원문 보존·HTML 추출·필수 입력·파일 저장 |
| `test_data_go_kr.py` | 공통 설정 로드·인증키 전달 |
| `test_gov24_services.py` | 목록 요청·응답과 콘솔 표시 문자열 |
| `test_bokjiro_services.py` | 목록 필터·상세·XML 처리·업무 오류·설정 로드 |
| `test_kwangwoon_notices.py` | 공지 파싱·URL 분류 강제·없는 DUID 건너뛰기·집계 |
| `test_kwangwoon_pages.py` | 자동 수집 목록 페이지·고정 공지·분류/URL 경계·전용 상세/첨부·응답 한도 |

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest app/modules/collectors/tests`를 실행합니다. 성공 시 종료 코드 0, 실패 시 0이 아닌 코드입니다. 실제 공급자 연결·전체 데이터 품질을 검증하는 명령이 아닙니다. 복지로 반복·중첩 XML 회귀 검증은 `tests/test_raw_parsing.py`에도 있습니다.
