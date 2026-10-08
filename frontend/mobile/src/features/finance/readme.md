# 모바일 소득·재산 계산

`FinanceScreen`은 빠른 확인·상세 입력·검토·서버 결과를 표시합니다. 공통 `@bokji/core/finance-flow`의 질문과 `finance-model`의 원 단위 입력 계약을 사용합니다. `updateDraft(draft,path,value,cache)`는 새 초안을 반환하고 `createFinanceState(api)`는 계정별 조회·동의 저장·삭제·계산 요청을 관리합니다. 기기에는 금융정보를 지속 저장하지 않습니다.

`private_transfer_history`는 가구 전체의 최근 12개월 지원 여부·지원자 관계·용도·월별 금액과 횟수입니다. 지원받음 선택 시 내역 질문을 표시하고 명시적 반복 적용 버튼으로 첫 달 금액·횟수를 12개월에 복사합니다. 기간이 지난 내역은 이번 달 기준으로 다시 입력합니다. 구버전 저장 정보는 지원 내역을 모름으로 초기화합니다. 가구원 수가 달라지면 기존 내역의 지원 여부 확인을 무효화합니다.

서버의 `notice`는 항상 표시하고 `comparison_note`는 기준 비교 보류 문구로 사용합니다. 금액 계산은 서버에서 수행합니다. 검증: `node --test tests/finance-parity.test.mjs`, `npm run typecheck`, `npm run lint`. 로컬 npm이 공통 패키지를 복사한 경우 공통 소스 변경 후 설치본을 갱신해야 합니다.
