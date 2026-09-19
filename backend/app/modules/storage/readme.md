# storage

## 목적과 책임

수집된 `RawDocument`를 UTF-8 JSON 파일로 저장하고 조회합니다. 정책 의미 해석이나 승인 여부 판단은 하지 않습니다.

## 현재 상태

`implemented` 상태이며 담당자는 미정입니다. 기본 저장 위치는 `backend/data/raw_documents/`입니다. 실제 원본 데이터는 Git에 추가하지 않습니다.

## 공개 진입점

- `save_raw_document(document, storage_path) -> RawDocument`
- `list_raw_documents(storage_path) -> Iterable[RawDocument]`

두 함수 모두 동기 함수입니다. `storage_path`를 생략하면 기본 저장 위치를 사용합니다.

## 오류와 검증

저장 디렉터리를 만들 수 없거나 파일을 읽고 쓸 수 없으면 파일 시스템 예외가 발생합니다. 저장 포맷은 `RawDocument`의 필드와 일치해야 합니다.

## 테스트

현재 collector 테스트에서 임시 디렉터리를 사용해 저장·조회까지 함께 검증합니다. 실행 명령은 `backend` 디렉터리의 `python -m pytest app/modules/collectors/tests`입니다.
