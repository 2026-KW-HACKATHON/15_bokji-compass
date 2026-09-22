# 쉬운 화면 설계
기준: 2026-09-22. 시니어 사용자를 포함해 큰 글씨와 단순한 안내가 필요한 사용자가 직접 선택하는 모드입니다. 나이로 자동 적용하지 않습니다.

참고:
- [W3C WAI: Older Users and Web Accessibility](https://www.w3.org/WAI/older-users/developing/): 글자 확대, 대비, 읽기 쉬운 간격, 명확한 탐색/폼, 움직임 제어.
- [Apple Assistive Access](https://support.apple.com/guide/assistive-access-iphone/welcome/ios): 핵심 기능 중심의 단순한 화면과 큰 컨트롤. 시니어 전용이라는 의미는 아님.
- [Nielsen Norman Group: Usability for Senior Citizens](https://www.nngroup.com/articles/usability-for-senior-citizens/): 고령 사용자 연구에서 발견된 가독성·조작·오류 대응의 어려움 참고.

## 적용
- 항상 보이는 쉬운 화면 스위치와 상태, 브라우저에 선택 저장.
- 기본 글자 20px, 주요 입력·버튼 56px 이상, 충분한 줄 간격, 고대비 초점 표시.
- 전환·애니메이션·부드러운 스크롤 없음. 일반 화면도 prefers-reduced-motion 존중.
- 입력은 지역/연령 → 생활 → 관심 분야의 3단계. 선택사항은 건너뛸 수 있고 이전 단계로 복귀 가능.
- 추천/검색/저장 목록은 한 개씩. 선택지가 많은 검색 조건과 공고 세부정보는 접어서 표시.
- 아이콘 단독 탐색 대신 텍스트 병기, 명확한 이전/다음·재시도·빈 상태.
- 읽기 순서와 실제 DOM 순서 일치, 단계 이동 시 제목 초점, dialog 초점 복귀.
- 불필요한 장식/과정 띠를 줄이고 큰 버튼으로 다음 행동 제시. 공고 제목·추천 이유·중요 안내는 생략하지 않음.

## 검증 범위와 남은 검증
Chromium 화면에서 320px/모바일/데스크톱 배치, 확대 모드, 키보드·dialog·단계 입력·한 개씩 표시를 확인합니다. 실제 시니어 참여 사용성 검증, 200% 브라우저 확대, VoiceOver/TalkBack 및 실제 iOS/Android는 별도 검증이 필요합니다. WCAG 적합성 인증을 받은 상태로 표현하지 않습니다.
