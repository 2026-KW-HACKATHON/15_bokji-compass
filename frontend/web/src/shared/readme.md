# 공통 어댑터

담당: 프론트엔드.

- readStoredValue(key,fallback,validate) → 검증된 JSON 또는 fallback.
- writeStoredValue(key,value), removeStoredValue(key) → 성공 boolean. 실패 안내는 호출자 책임.
- resolveConfig(runtime,environment,development) → {dataMode,apiBaseUrl,policiesPath,recommendationsPath}. 주소는 런타임 명시값 우선, 데이터는 개발/운영 모두 API. 이전 demo 설정도 API로 전환.
- config.js는 브라우저/Vite 환경을 읽고, configModel.js는 순수 함수입니다.
  api/는 HTTP, ui/는 React/DOM. 저장 어댑터는 외부 전송이 없으며 앱에서는 플랫폼 저장소로 교체합니다. 검증: Node 단위 테스트.
