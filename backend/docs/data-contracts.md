# 데이터 계약 v0.1

## RawDocument

`RawDocument`는 공공기관 공고문에서 가져온 원문과 추적 정보만 담습니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `document_id` | `str` | `source_url`에서 생성한 식별자 |
| `title` | `str` | 공고 제목 |
| `text` | `str` | 수정하지 않은 공고문 텍스트 |
| `source_url` | `str` | 원문 출처 URL |
| `collected_at` | `str` | UTC ISO 8601 수집 시각 |
| `published_at` | `str \| None` | 원문에 제공된 게시 시각. 미상은 `None` |

현재 계약은 나이, 출신, 거주지역, 소득 등 지원 조건을 포함하지 않습니다. 해당 조건은 후속 파싱·정규화 단계에서 원문 근거와 연결해 다룹니다. `RawDocument`는 사용자 자격을 판단하지 않습니다.

수집 원문은 보존해야 하며, 저장된 원문을 정책 초안이나 공개 승인 데이터로 간주하지 않습니다.
