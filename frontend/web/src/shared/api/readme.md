# HTTP 어댑터

담당: 프론트엔드. createHttpClient({baseUrl,fetchImpl?,timeout?}) → request(path,{method?,body?,signal?,timeoutMs?}).
request는 JSON Promise를 반환하며 ApiError(code,status)로 HTTP/형식/네트워크/시간 초과/취소를 구분합니다. 기본 GET/15초, credentials=omit, cache=no-store. 응답 오류 본문은 사용자에게 노출하지 않습니다.
client.js의 request는 공개 config로 생성. checkHealth() → {status,service}, /health 5초 검증. 현재 제품 UI에서는 미호출.
검증: tests/policies.test.js, [계약](../../../../docs/service-contract.md).
