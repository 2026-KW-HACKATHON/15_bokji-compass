# 프론트 검증

담당: 프론트엔드. 웹 루트에서 `npm.cmd test`는 Node 내장 테스트를 실행합니다. 검색 조합·전국 포함·정렬 불변성·프로필 스키마·저장 오류를 검사합니다.

`npm.cmd run test:e2e`는 설치된 Microsoft Edge에서 데스크톱(1440px)과 모바일(390px) 화면을 검사합니다. 검색·빈 상태·필터·상세·북마크 영속성·프로필·해시 뒤로가기·모달 초점·320px overflow·상태 API 성공/실패 대역을 확인합니다. 외부 정부 서비스·DB·실제 자격 판정은 호출하지 않습니다.

`test-results/`에 스크린샷과 실패 trace가 생성되며 Git에서 제외됩니다. 실제 iPhone Safari/Android 네이티브 검증은 후속입니다. `npm.cmd run build`로 배포용 번들도 별도 확인합니다.
