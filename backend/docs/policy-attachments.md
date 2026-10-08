# 공고 첨부 파일 제공 (2026-10-08)

기본 첨부 목록은 `reference/attachments/kwangwoon.json`에 DUID별로 보관합니다. 새 환경에서 기존 공고를 설치해도 파일 링크가 바로 표시되며 최초 클릭에서 실제 파일을 저장합니다. 새 수집의 `attachment_files`가 있으면 이를 우선해 삭제된 파일을 다시 표시하지 않습니다.

광운대 공고 본문에 `Attachment…pdf`라는 HTML 아이콘 텍스트와 파일명이 들어가 실제 파일을 사용할 수 없었습니다. 기존 광운대 참고 공고는 텍스트만 저장했고, 자동 수집기도 URL 목록만 보존했습니다.

공개 상세 API는 표시용 본문·`sourceFields.text`에서 파일 목록 줄을 제거하고 `attachments` 배열을 반환합니다. 자격 판단에 사용되는 DB 원문·인용 근거는 변경하지 않습니다. 파일명/URL은 공식 HTML의 `board-view-box` 안 첨부 영역에서 가져옵니다. 앞으로 수집되는 `attachment_files`도 정규화 후 보존합니다.

`attachments` 항목: `id`, `name`, `sourceUrl`, `downloadUrl`, `previewUrl`, `sizeBytes`, `contentType`, `stored`. 목록 API에서는 빈 배열, 상세에서만 조회하며 읽기에는 외부 요청이 없습니다. 웹은 파일명, 용량, PDF 보기와 다운로드를 본문 위에 표시합니다. 비-PDF 형식은 다운로드만 제공합니다.

`GET /v1/policies/{policy_key}/attachments/{id}`는 현재 공개 공고의 파일을 확인한 뒤 PDF를 `inline`으로 제공합니다. `?download=true`는 원래 파일명의 `attachment` 응답입니다. 비-PDF는 항상 다운로드합니다. 파일은 최대 25 MB이며 서버 로컬 캐시에 저장합니다. 최초 사용 시 저장되지 않은 공식 파일을 내려받고 이후 재사용합니다. 비공개 공고·무관한 파일은 404, 공식 파일 전송 실패·HTML 오류는 502로 처리합니다. Range 요청을 지원합니다.

명시적 보충 명령 (backend에서):

```powershell
.venv\Scripts\python.exe -m app.modules.attachments
.venv\Scripts\python.exe -m app.modules.attachments --policy-key notice:ba52f00679a88e62
.venv\Scripts\python.exe -m app.modules.attachments --refresh
```

현재 공식 다운로드 공급자는 광운대학교입니다. 첨부 목록이 바뀌었을 때 `--refresh`로 원문을 다시 확인합니다. 파일은 `backend/data/policy-attachments/`의 공고별 manifest와 URL 해시별 객체에 보관하며 Git에 올리지 않습니다. 다른 서버로 이전할 때 이 폴더도 이전하거나 보충 명령을 다시 실행합니다. 명령은 공개 공고만 선택하고 DB·공개 상태를 수정하지 않습니다.

운영 데이터: 광운대 190개 공고의 실제 첨부 **238개 저장, 실패 0**. 문제 공고 `DUID=53187`은 PDF **5개 모두 저장**했습니다. 학교 다운로드는 Referer가 없으면 HTTP 200 HTML 오류를 반환해 공고 주소를 함께 전달합니다. 공식 HTTPS 호스트, 공고/첨부 식별자 일치, DNS 공인 주소 검증, 리다이렉트 차단, 용량·시간 제한과 HTML 응답 거부를 적용합니다.

검증은 `tests/test_policy_attachments.py`에서 PDF/다운로드/Range, 저장 재사용, 원문 보존, 잘못된 호스트·공고·파일 차단, HTTP 200 HTML 오류 거부를 확인합니다. 기존 검색과 수집기 테스트도 함께 실행합니다.

공개 사이트 `https://bokji.commitnaru.com`에 적용했습니다. 문제 공고의 PDF 5개에 대해 보기·다운로드·Range 15개 응답이 원래 저장 파일과 일치했습니다. 브라우저 상세 화면의 파일 5개·보기/다운로드 버튼을 확인했습니다. 최종 회귀 결과는 백엔드 535개 통과·선택적 MySQL 검사 1개 생략, 웹 185개 통과, 웹 빌드 성공입니다.
