# 한국사회보장정보원_중앙부처복지서비스 API 명세서

## 1. 개요 (Overview)

* **서비스명**: 한국사회보장정보원_중앙부처복지서비스 API
* **Base URL**: `http://apis.data.go.kr/B554287/NationalWelfareInformationsV001` (또는 `https://...`)
* **프로토콜**: HTTP / HTTPS
* **데이터 포맷**: XML / JSON (요청 파라미터 또는 응답 응답 형식 지정 시)
* **인증 방식**: API Key (공공데이터포털 발급 `serviceKey`)

---

## 2. 공통 요청 / 응답 규격 (Common Specification)

### 2.1 공통 요청 파라미터 (Common Request Parameters)

| 파라미터명 | 타입 | 필수 여부 | 설명 | 예시 |
| :--- | :--- | :---: | :--- | :--- |
| `serviceKey` | String | **필수** | 공공데이터포털에서 발급받은 인증키 (URL Encoding 적용) | `YOUR_SERVICE_KEY` |
| `callParam` | String | 선택 | 추가 호출 조건 (필요 시 지정) | `NW` |
| `pageNo` | Integer | 선택 | 페이지 번호 (기본값: 1) | `1` |
| `numOfRows` | Integer | 선택 | 한 페이지 결과 수 (기본값: 10) | `10` |

### 2.2 공통 응답 구조 (Common Response Header)

```json
{
  "resultCode": "00",
  "resultMsg": "NORMAL SERVICE."
}
```

---

## 3. API 상세 명세 (API Details)

### 3.1 복지서비스 목록조회 (`/NationalWelfarelistV001`)

중앙부처에서 제공하는 복지서비스의 목록을 조건별로 검색하여 조회합니다.

* **HTTP Method**: `GET`
* **Endpoint**: `/NationalWelfarelistV001`

#### 요청 파라미터 (Request Parameters)

| 파라미터명 | 타입 | 필수 여부 | 설명 | 예시 |
| :--- | :--- | :---: | :--- | :--- |
| `serviceKey` | String | **필수** | 공공데이터포털 인증키 | `YOUR_SERVICE_KEY` |
| `pageNo` | Integer | 선택 | 페이지 번호 | `1` |
| `numOfRows` | Integer | 선택 | 한 페이지 결과 수 | `10` |
| `srchKeyValue` | String | 선택 | 검색 키워드 (복지서비스명 등) | `보육` |
| `lifeArray` | String | 선택 | 생애주기 코드 (001: 영유아, 002: 아동 등) | `001` |
| `charMatArray` | String | 선택 | 가구상황 코드 (001: 저소득, 002: 장애인 등) | `001` |
| `desireArray` | String | 선택 | 관심주제/욕구 코드 (001: 생계, 002: 의료 등) | `001` |

#### 응답 구조 예시 (Response Example - JSON)

```json
{
  "response": {
    "header": {
      "resultCode": "00",
      "resultMsg": "NORMAL SERVICE."
    },
    "body": {
      "pageNo": 1,
      "totalCount": 120,
      "numOfRows": 10,
      "items": [
        {
          "servId": "WLF00000001",
          "servNm": "부모급여 지원",
          "jurMnofNm": "보건복지부",
          "servDgst": "영유아 양육 가구의 경제적 부담 완화를 위한 부모급여 지원",
          "servDtlLink": "https://www.bokjiro.go.kr/...",
          "inqNum": 1520
        },
        {
          "servId": "WLF00000002",
          "servNm": "기초연금",
          "jurMnofNm": "보건복지부",
          "servDgst": "65세 이상 어르신 대상 안정적인 소득기반 제공",
          "servDtlLink": "https://www.bokjiro.go.kr/...",
          "inqNum": 3410
        }
      ]
    }
  }
}
```

---

### 3.2 복지서비스 상세조회 (`/NationalWelfaredetailedV001`)

특정 복지서비스의 세부 지원대상, 선정기준, 지원내용, 신청방법 등을 상세히 조회합니다.

* **HTTP Method**: `GET`
* **Endpoint**: `/NationalWelfaredetailedV001`

#### 요청 파라미터 (Request Parameters)

| 파라미터명 | 타입 | 필수 여부 | 설명 | 예시 |
| :--- | :--- | :---: | :--- | :--- |
| `serviceKey` | String | **필수** | 공공데이터포털 인증키 | `YOUR_SERVICE_KEY` |
| `servId` | String | **필수** | 복지서비스 ID (목록조회 결과에서 취득) | `WLF00000001` |

#### 응답 구조 예시 (Response Example - JSON)

```json
{
  "response": {
    "header": {
      "resultCode": "00",
      "resultMsg": "NORMAL SERVICE."
    },
    "body": {
      "item": {
        "servId": "WLF00000001",
        "servNm": "부모급여 지원",
        "jurMnofNm": "보건복지부",
        "tgtrDtlCn": "0~23개월 아동을 양육하는 부모",
        "slctCritCn": "소득·재산 상관없이 대상 연령 아동 전체 적용",
        "alwnServCn": "0세(0~11개월): 월 100만원 / 1세(12~23개월): 월 50만원",
        "applMethodCn": "읍면동 주민센터 방문신청 또는 복지로(bokjiro.go.kr) 온라인 신청",
        "inqNum": 1520,
        "lastModTs": "2024-01-01"
      }
    }
  }
}
```

---

## 4. 오류 코드 (Error Codes)

| 오류 코드 | 오류 메시지 | 설명 |
| :---: | :--- | :--- |
| `00` | NORMAL SERVICE | 정상 응답 |
| `01` | APPLICATION ERROR | 어플리케이션 에러 |
| `10` | LIMITED NUMBER OF SERVICE REQUESTS EXCEEDED | 일일 트래픽 초과 |
| `11` | SERVICE KEY IS NOT REGISTERED ERROR | 등록되지 않은 서비스키 |
| `12` | TIMED OUT | 요청 시간 초과 |
| `20` | PARAMETER ERROR | 요청 파라미터 오류 |
| `30` | SERVICE KEY ERROR | 서비스키 부적절 |