# 공통 웹 어댑터

담당: 프론트엔드. `api/`는 HTTP, `ui/`는 React/DOM, `storage.js`는 브라우저 저장소에 의존합니다.

- `readStoredValue(key, fallback, validate)` → 검증된 JSON 값 또는 fallback. 조회 거부·잘못된 JSON·스키마 불일치를 기본값으로 처리합니다. `validate(value)`는 boolean을 반환해야 합니다.
- `writeStoredValue(key, value)` → boolean. JSON 직렬화와 localStorage 저장 성공 시 true, 용량·권한·직렬화 오류 시 false. 예외를 호출자에게 전파하지 않습니다.

외부 서버로 값을 전송하지 않습니다. 호출자는 false 반환 시 저장 실패를 안내해야 합니다. 네이티브 앱에서는 이 저장 어댑터를 기기 저장소로 교체합니다. 검증: `tests/policies.test.js`.
