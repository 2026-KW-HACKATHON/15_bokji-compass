# 추천용 사용자 정보

담당: 프론트엔드.

- defaultProfile: {region,ageBand,occupation,household,interests}. 미선택은 선택하지 않음.
- isProfile(value) → boolean. 선택값/배열 손상 검증.
- recommendationProfile(value) → 선택 필드만 복사한 전송 모델. 미선택 null·중복 관심사 제거. 잘못된 값은 throw.
- ProfileForm({profile,onSave,easy,remembered,mode}) → React 폼. onSave(profile,remember) 호출. 쉬운 화면은 세 단계.
  폼 자체는 저장/네트워크를 수행하지 않습니다. app이 메모리 보관 또는 기억하기 선택 시 localStorage 저장 후 추천 요청합니다. 자격 판정용 사실 확정이 아닙니다.
  검증: Node 모델 테스트와 브라우저 단계 이동·동의 저장·추천.
