# 공고 상세 첨부 파일 (2026-10-08)

공개 사이트 적용 후 실제 문제 공고의 첨부 5개와 버튼을 화면에서 확인했습니다. 전체 웹 테스트 185개와 빌드가 통과했고 파일 API의 보기·다운로드·Range 15개를 검증했습니다.

`PolicyAttachments`는 공개 상세 응답의 `attachments`를 받아 본문 위에 파일 목록을 표시합니다. PDF는 새 창에서 보기와 다운로드, 기타 형식은 다운로드를 제공합니다. 링크는 `appConfig.apiBaseUrl`과 백엔드의 파일 경로를 결합하므로 로컬·공개 `/api`·별도 API 호스트에서 모두 동작합니다. 파일명은 번역하지 않습니다.

`parseAttachments(value, policyId)`는 현재 공고 ID·파일 ID에 일치하는 API 경로만 허용합니다. 다른 공고·외부 경로·실행 URL·헤더 개행이 들어간 파일명·중복은 제외합니다. 과거 응답에 첨부 배열이 없어도 빈 목록으로 처리합니다. `attachmentHref(path, apiBaseUrl)`는 검증된 경로에 설정된 API 주소를 붙입니다.

전체 항목 보기에서는 첨부 파일 내부 필드를 중복해서 표시하지 않습니다. 본문 파일 목록 제거와 실제 파일 저장·전송은 [백엔드 첨부 계약](../../backend/docs/policy-attachments.md)을 따릅니다. 원문의 실제 제출 서류 안내 문장은 유지합니다.

검증: `node --test tests/policy-attachments.test.js`, 전체 `npm test`, `npm run build`. 문서명·공고별 경로·설정된 API 주소·과거 계약 호환을 확인합니다.
