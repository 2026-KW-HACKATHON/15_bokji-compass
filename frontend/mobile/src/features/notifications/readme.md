# 모바일 알림 안내와 수신 설정

담당: 모바일. Expo SDK 57의 `expo-notifications`를 사용합니다.

## 화면과 권한 흐름

- 첫 네이티브 실행에서 권한이 아직 없다면 네 유형을 설명하는 선택 동의창을 표시합니다. `알림 허용하기`는 Android 유형별 채널을 만든 뒤 OS 권한을 요청하고 `내 계정`으로 이동합니다. `나중에 설정`은 앱 이용을 계속할 수 있게 닫습니다.
- 안내 확인 여부만 기기 SecureStore에 저장합니다. 다시 시작할 때 안내를 반복하지 않으며, 기기 알림을 이미 허용한 사용자는 안내창을 건너뜁니다.
- OS 권한 허용과 계정 수신 동의는 별도입니다. 로그인 후 `내 계정 → 푸시 알림 설정 → 전체 푸시 알림`을 켜야 계정 수신이 시작됩니다. 네 유형은 개별 선택할 수 있고 전체 수신을 꺼도 선택은 유지합니다.
- 권한을 다시 요청할 수 없으면 기기 설정 열기를 제공합니다. 앱이 활성화되면 OS 권한/서버 설정을 다시 조회합니다. 기기 권한이 없거나 전체 수신을 끈 경우 현재 세션의 발송 기기를 비활성화합니다.
- 웹은 계정 수신 설정만 편집합니다. 저장 실패는 재시도 안내와 기존 선택을 유지합니다. 설정 저장과 기기 등록 실패를 구분해 표시합니다. 계정 전환 시 이전 계정의 설정/늦은 응답을 적용하지 않습니다.

## 파일과 호출 계약

| 파일/함수 | 역할과 반환 |
| --- | --- |
| `context.tsx`의 `NotificationProvider` | 권한, 첫 안내, 계정 설정 조회/저장, 기기 등록, 알림 표시/탭 이벤트 관리. 루트 RuntimeProvider 아래에서 사용 |
| `useNotifications()` | `{permission, preferences, loading, saving, error, deliveryWarning, saved, retry, save, requestPermission, openSettings}` 반환 |
| `save(key,value)` | `Promise<void>`. 전체/개별 설정 저장 후 OS 권한에 맞춰 기기를 등록/비활성화 |
| `NotificationSettings.tsx` | 내 계정의 전체 수신/네 유형/권한 상태. 쉬운 화면과 접근성 라벨 적용 |
| `parsePreferences(value)` | 다섯 boolean 응답 검증 후 설정 반환; 잘못된 응답은 ApiError |
| `allowsNotification(preferences,data)` | 전체 수신과 알려진 유형의 개별 선택이 모두 켜졌을 때만 `true` |
| `notificationPolicyId(data)` | 유효한 `policy_id` 또는 `null`; payload URL로 이동하지 않음 |
| `createNotificationApi(request)` | `{read, save, register, disable}`; `/v1/mobile/notifications`에 모바일 Bearer 호출 |
| `platform/notifications.ts` | 권한 조회/요청, 유형별 채널, OS 설정, Expo 토큰 획득(15초 제한), 첫 안내 상태, 이벤트 어댑터 |
| `platform/notifications.web.ts` | 웹용 미지원 권한 어댑터. 네이티브 모듈을 불러오지 않음 |

foreground 알림은 로그인과 전체/유형별 수신 설정을 확인합니다. 알림을 누르면 검증한 공고 ID를 `/policies/[id]` params로 전달합니다. 종료 상태에서 누른 알림은 로그인/설정 조회 후 처리합니다. 원격 background 알림 차단은 서버가 반드시 수신 설정을 확인해야 하며 [백엔드 연결점](../../../../../backend/app/modules/notifications/readme.md)을 사용합니다.

## 네이티브 빌드와 푸시 설정

새 네이티브 의존성이 추가되어 **기존 설치 APK는 재빌드·재설치가 필요**합니다. Android 13 이상에서는 OS 알림 권한창을 요청하며 이전 버전은 시스템 동작에 따라 권한창 없이 허용될 수 있습니다. Android Expo Go는 원격 푸시를 지원하지 않습니다.

`.env` 또는 EAS 환경에 실제 공개 EAS 프로젝트 UUID를 `EXPO_PUBLIC_EAS_PROJECT_ID`로 지정합니다. Firebase에서 Android 패키지 `com.bokjicompass.app`을 등록한 `google-services.json` 파일의 로컬 경로를 `BOKJI_GOOGLE_SERVICES_FILE`로 지정합니다. 파일은 Git에서 제외됩니다. EAS의 Firebase FCM v1 서비스 계정 자격 증명도 연결해야 실제 원격 수신을 검증할 수 있습니다. 비밀 서비스 계정 키는 앱이나 `EXPO_PUBLIC_*`에 넣지 않습니다.

```powershell
# 네이티브 변경 시 config plugins를 반영한 뒤 기존 로컬 빌드 사용.
npx expo prebuild --platform android --no-install
npm run android:local
```

EAS를 사용한다면 기존 `eas.json`의 빌드 프로필을 사용합니다. 권한 안내와 설정 저장은 푸시 프로젝트가 없어도 동작하며, 기기 등록은 서비스 연결 준비 안내를 표시합니다. 공고 변경/즐겨찾기/신청 자격/발표일의 이벤트 생산자와 실제 전송 worker는 아직 연결되지 않았습니다.

참고: [SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), [푸시 설정](https://docs.expo.dev/push-notifications/push-notifications-setup/).

## 검증

`npm run typecheck`, `npm run lint`(캐시 쓰기 제한 시 `node node_modules/eslint/bin/eslint.js . --no-cache`), `npm test`를 실행합니다. 모바일 테스트 32개, lint/typecheck, Android/iOS 번들 export 통과.

API 주소를 지정하고 Expo web을 8085에서 실행한 뒤 `node tests/notifications-preview.mjs`로 320/390/430px, 쉬운 화면, 스위치 변경, 저장 실패 시 선택 유지, 계정 전환을 검증했습니다. 스크린샷은 `tmp/mobile-notifications/`에 저장됩니다. 브라우저 전용 fixture이며 실제 OS 권한창/FCM 수신은 재빌드한 Android 기기에서 별도로 확인해야 합니다.
