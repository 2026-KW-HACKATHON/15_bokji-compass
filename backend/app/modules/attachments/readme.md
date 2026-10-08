# 공고 첨부 파일

기존 참고 공고의 실제 파일 목록은 `reference/attachments/kwangwoon.json`에도 보관합니다. 새 서버에서도 본문 파일명 대신 실제 파일 링크가 표시되며 클릭할 때 저장합니다. 새 수집의 명시적 첨부 목록과 서버 manifest가 우선합니다.

공식 공고의 첨부 파일명·주소를 분리하고 실제 파일을 `backend/data/policy-attachments/`에 저장합니다. 원본 DB·자격 근거는 수정하지 않습니다. 현재 다운로드 공급자는 광운대학교입니다.

`public.py`의 외부 진입점:

- `clean_notice_content(text) -> str`: `Attachment…pdf` 등 수집된 파일 목록 줄만 표시용 본문에서 제거합니다. 본문의 서류 제출·PDF 안내 문장은 유지합니다.
- `public_attachments(source, policy_key) -> list[dict]`: 이름, 다운로드/보기 API 경로, 저장 여부, 용량을 반환합니다. 네트워크·쓰기 작업을 하지 않습니다.
- `attachment_file(source, identifier) -> (Path, name, content_type)`: 해당 공고의 실제 파일만 반환하며 없으면 공식 서버에서 저장합니다. API는 먼저 공개 공고인지 확인합니다.
- `sync_notice_attachments(source, download=True, refresh=False) -> dict`: 공식 HTML에서 첨부 파일을 확인하고 저장합니다. 저장 건수와 실패 정보를 반환합니다.

명시적 보충 명령: `python -m app.modules.attachments [--policy-key KEY] [--metadata-only] [--refresh]`. 현재 공개된 광운대 공고만 대상으로 하며 재실행은 저장된 파일을 재사용합니다. 파일마다 최대 25 MB, 공고마다 32개, HTTPS 공식 호스트, 공고 DUID·첨부 ano 일치, DNS 공인 주소 검증, 리다이렉트 차단, 응답 크기·시간 제한을 적용합니다. 학교 다운로드에 필요한 Referer를 전송하며 HTML 오류 페이지를 PDF로 저장하지 않습니다. 파일명은 응답 경로나 로컬 경로로 사용하지 않습니다. PDF만 보기 응답을 제공하며 다른 형식은 다운로드합니다.

검증: `python -m pytest tests/test_policy_attachments.py app/modules/collectors/tests/test_kwangwoon_pages.py`.
