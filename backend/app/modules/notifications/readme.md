# 모바일 알림 설정과 발송 대상

담당: 모바일/백엔드 공통. OS 알림 권한과 계정의 수신 동의를 별도로 관리합니다.

## 구현과 호출 계약

- `Preferences`: 전체 수신 `enabled`의 기본값은 `false`. 네 종류는 `policy_changes`(선택 공고 변경), `similar_policies`(즐겨찾기 유사 공고), `eligible_policies`(사용자 조건에 맞는 공고), `application_results`(지원 공고 발표일)입니다. 종류 선택의 기본값은 `true`이며 전체 수신을 명시적으로 켜기 전에는 발송하지 않습니다.
- `NotificationStore.read(account_id)` → `Preferences`, `save(account_id, value)` → 저장된 `Preferences`. 전체 수신을 꺼도 개별 선택을 유지합니다.
- `register(account_id, session_hash, DeviceInput)` → `None`. Expo 토큰을 현재 모바일 세션에 연결합니다. 같은 토큰은 한 계정/세션에만 속합니다.
- `disable_session(account_id, session_hash)` → `None`. 해당 모바일 로그인 세션의 기기만 비활성화합니다.
- `destinations(account_id)` → `list[str]`. 활성 기기이면서 회원과 만료되지 않은 세션이 존재하는 토큰만 반환합니다. 로그아웃으로 세션이 폐기되면 별도 기기 삭제 요청 없이 제외됩니다.
- 공개 연결점 `public.build_messages(store, NotificationEvent(...))` → `list[dict]`. 전체/유형별 수신 설정을 확인하고 Expo payload를 생성합니다. `data`에는 `category`, `policy_id`, Android `channelId`에는 유형 키를 사용합니다.

모든 HTTP 경로는 `/v1/mobile/notifications` 아래이며 모바일 Bearer 세션만 허용합니다. POST는 `X-Auth-Request: 1`과 JSON body를 사용합니다. 응답은 `Cache-Control: no-store`입니다.

| 호출 | 입력 | 반환 |
| --- | --- | --- |
| GET `/preferences` | Bearer | 다섯 개 boolean 수신 설정 |
| POST `/preferences` | 다섯 개 boolean 수신 설정 | 저장된 설정 |
| POST `/devices` | `{push_token, platform: "android" 또는 "ios"}` | `{registered: true}` |
| POST `/devices/disable` | `{}` | `{disabled: true}` |

회원 ID는 인증된 세션에서 결정합니다. boolean 문자열/숫자, 알 수 없는 필드, 잘못된 토큰을 거부하며 검증 오류에 토큰을 그대로 노출하지 않습니다.

## 저장소 초기화

MySQL 운영 서버에서는 백엔드 디렉터리에서 명시적으로 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.notifications
```

`DB_ENABLED=true`가 필요합니다. `account_notification_preferences`, `mobile_push_devices` 두 테이블을 추가하며 기존 공고/회원 테이블을 수정하지 않습니다. 로컬 SQLite 개발/테스트 모드는 첫 인증된 알림 API 요청에서 초기화합니다. import나 비회원 호출은 알림 테이블을 생성하지 않습니다.

## 자동 발송 연결에 필요한 후속 구현

현재는 **설정 저장·기기 등록·수신 설정을 반영한 payload 생성**까지 구현했습니다. Expo로 전송하는 worker와 자동 이벤트 생성은 아직 없습니다. 아래 데이터/처리가 필요합니다.

1. 선택 공고 구독 정보와 변경 감지.
2. 즐겨찾기 저장 및 유사 공고 판별.
3. 사용자 조건과 공고 전체의 신청 자격 판별. 금융 계산만으로 신청 가능을 확정하지 않습니다.
4. 지원 이력, 실제 결과 발표일, Asia/Seoul 기준 예약 작업.
5. 이벤트 중복 방지, 재시도, Expo ticket/receipt 조회와 `DeviceNotRegistered` 토큰 폐기.

이벤트 생산자가 관계와 신청 조건을 검증한 수신자만 `NotificationEvent`에 넣어야 합니다. 잠금화면 메시지에는 공고명·일정만 사용하고 금융 원자료·상담 내용을 넣지 않습니다. 임의로 다른 회원에게 발송하는 클라이언트 API는 없습니다.

## 검증

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/test_notifications.py tests/test_bootstrap.py tests/test_mobile_auth.py tests/test_auth.py tests/test_finance_api.py -q
```

관련 67개 통과. 신규 알림 테스트 10개는 계정 격리/재시작 저장, 기본 미동의, 네 유형별 차단, 기기 중복 등록/계정 전환/비활성화, 로그아웃/세션 만료, Bearer 경계, 입력 검증과 토큰 비노출을 확인합니다.
