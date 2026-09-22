# 행정안전부 대한민국 공공서비스(혜택) 정보 API 명세서

> 외부 공급자 참고 초안이며 우리 서버의 공개 API 명세가 아닙니다. 아래 영문 필드명은 초안의 설명용 표기입니다. 2026-09-21 표본에서는 `서비스ID`, `서비스명`, `지원대상`, `선정기준` 등의 한글 키를 확인했습니다. [실제 응답 조사](../api-data-analysis.md)를 우선 확인하세요.
> 현재 [전용 수집기](../../app/modules/collectors/gov24_services.py)는 `serviceList` 첫 페이지를 요청하고 공통 요청기는 `serviceKey` 쿼리 인수로 인증합니다. 상세·조건 응답의 조사 이력과 전용 함수 구현 여부를 구분합니다. 최신 외부 서비스 명세를 이번 문서 점검에서 재조회한 것은 아닙니다. 우리 서버 엔드포인트는 [루트 API 관리대장](../../../api-management.md)에 있습니다.

행정안전부에서 제공하는 정부24(보조금24) 기반의 대한민국 공공서비스 및 혜택 정보 API 명세서입니다. 사용자 프로필(나이, 거주지, 소득 요건 등)에 따른 맞춤형 복지·혜택 매칭 에이전트 개발 시 활용할 수 있습니다.

## 1. 기본 정보 (Overview)

* **데이터명**: 행정안전부\_대한민국 공공서비스(혜택) 정보
* **제공 기관**: 행정안전부
* **Base URL**: `https://api.odcloud.kr/api`
* **통신 방식**: REST API (`GET`)
* **데이터 포맷**: JSON
* **인증 방식**: API Key (Query Parameter 또는 Header 전달)

## 2. API Endpoints 목록

| HTTP Method | Endpoint | 기능 설명 | 주요 활용 목적 |
| ----- | ----- | ----- | ----- |
| `GET` | `/gov24/v3/serviceList` | 공공서비스 목록 조회 | 전체 혜택 서비스 목록 수집 및 기본 필터링 |
| `GET` | `/gov24/v3/serviceDetail` | 공공서비스 상세내용 조회 | 혜택 내용, 신청 방법, 담당 부서 등 상세 정보 조회 |
| `GET` | `/gov24/v3/supportConditions` | 공공서비스 지원조건 조회 | 나이, 거주지, 소득, 가구 특성 등 정밀 매칭 조건 파악 |

## 3. 엔드포인트별 상세 정보

### 3.1 공공서비스 목록 (`/gov24/v3/serviceList`)

* **URL**: `https://api.odcloud.kr/api/gov24/v3/serviceList`
* **설명**: 제공 중인 공공서비스의 전체 또는 조건별 목록을 반환합니다.
* **주요 반환 항목**:
	* 서비스 ID (`serviceId`)
	* 서비스명 (`serviceNm`)
	* 서비스 목적 / 요약 (`servicePurpose`)
	* 소관기관명 (`deptNm` / `orgNm`)

### 3.2 공공서비스 상세내용 (`/gov24/v3/serviceDetail`)

* **URL**: `https://api.odcloud.kr/api/gov24/v3/serviceDetail`
* **설명**: 특정 공공서비스의 상세 설명, 구체적인 지원 내용 및 신청 절차 정보를 조회합니다.
* **주요 반환 항목**:
	* 지원 내용 (`supportContent`)
	* 신청 기한 / 신청 방법 (`applyDeadline`, `applyMethod`)
	* 접수 기관 및 구비 서류 (`receiptOrg`, `submitDocs`)
	* 상세 URL 및 문의처

### 3.3 공공서비스 지원조건 (`/gov24/v3/supportConditions`)

* **URL**: `https://api.odcloud.kr/api/gov24/v3/supportConditions`
* **설명**: 해당 공공서비스를 받기 위한 세부 지원 요건 및 대상 자격 정보를 제공합니다.
* **주요 반환 항목**:
	* 연령 요건 (최소/최대 연령 제한)
	* 거주지 요건 (전국 / 특정 지자체 제한)
	* 가구/소득 자격 요건 (소득 구간, 다자녀, 한부모 등)
	* 특수 조건 (청년, 취업준비생, 출신지역 특성 등)
