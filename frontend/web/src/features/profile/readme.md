# 탐색 프로필

담당: 프론트엔드. 개인정보 대신 관심 지역과 분야만 설정합니다.

- `defaultProfile`: `{region: '전국', interests: []}`.
- `isProfile(value)` → boolean. 지역과 관심 분야 배열이 허용한 표시값인지 검증하며 브라우저/React에 의존하지 않습니다.
- `ProfileForm({profile, onSave})` → React form. 입력값은 내부 초안으로 관리하고 제출 시 `onSave({region, interests})`를 호출합니다. 폼 자체는 저장/HTTP를 수행하지 않습니다.

프로필은 자격 판정에 사용하지 않습니다. 앱 조립 계층에서 저장 어댑터로 보관하며 Native 앱에서는 폼과 저장소를 교체할 수 있습니다. 검증: 단위 테스트의 손상 값, E2E의 저장·새로고침·필터 적용.
