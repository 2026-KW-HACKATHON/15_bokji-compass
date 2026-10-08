# 공통 웹 UI

담당: 프론트엔드. 반환은 모두 React 요소이며 네트워크/저장소에 접근하지 않습니다.

- `Icon({name, size=20, ...props})`: lucide 아이콘. 농림축산·어업의 `sprout`, 사업·창업의 `store`를 포함합니다. 알 수 없는 name은 compass. 장식용 aria-hidden이며 버튼의 accessible name은 호출자가 제공합니다.
- `Modal({title, onClose, children})`: native dialog. mount 시 showModal, 초점 가두기, Escape/배경 클릭 닫기, 해제 시 스크롤과 초점 복귀. 동시에 한 개만 표시합니다.
- `CompassArt()`: 기존 장식 SVG. 현재 메인 화면은 사용자 제공 `public/brand-logo.png`를 사용하므로 이 컴포넌트를 호출하지 않습니다.

웹 DOM 전용이며 Android/iOS UI의 직접 공유 대상은 아닙니다. 검증: E2E 팝업 초점·Escape·모바일 화면.

`CompassArt`는 에메랄드·민트 계열과 앰버 `#F59E0B` 포인트를 사용하는 장식 SVG입니다.
