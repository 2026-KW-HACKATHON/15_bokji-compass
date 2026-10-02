# 웹 카카오 로그인 설정

2026-10-02. 웹 우선 적용. 전화번호 입력·개발용 인증번호·전화번호 인증 API를 제거했습니다. 기존 아이디·비밀번호 로그인과 계정 ID·금융정보는 유지합니다. 네이티브 앱의 카카오 로그인 버튼은 이번 범위에 포함하지 않습니다.

## 카카오 개발자 설정

1. [Kakao Developers](https://developers.kakao.com/)에서 팀 소유 앱을 선택하거나 생성하고 카카오 로그인을 활성화합니다.
2. REST API 키와 해당 키의 Client Secret을 서버 환경설정에 입력합니다. JavaScript 키·네이티브 키·Admin 키를 사용하지 않습니다.
3. Redirect URI를 서버 설정과 완전히 동일하게 등록합니다. 웹의 API 프록시 주소를 사용합니다.
4. 닉네임 동의항목은 사용하려면 별도로 설정합니다. 닉네임이 없어도 가입 가능하며 이름을 직접 받습니다. 이메일·전화번호 동의를 요구하지 않습니다.

backend/.env에 다음 값을 설정합니다. 키와 시크릿은 프론트 환경변수·Git·채팅에 넣지 않습니다.

    KAKAO_CLIENT_ID=카카오_REST_API_키
    KAKAO_CLIENT_SECRET=해당_키의_Client_Secret
    KAKAO_REDIRECT_URI=http://127.0.0.1:5173/api/v1/auth/kakao/callback
    KAKAO_WEB_URL=http://127.0.0.1:5173/

위 예시에서는 브라우저도 http://127.0.0.1:5173 으로 엽니다. localhost와 127.0.0.1을 섞으면 쿠키가 전달되지 않습니다. 포트가 다르면 두 주소와 카카오 등록 URI를 함께 변경합니다. 운영은 두 주소 모두 동일 출처 HTTPS로 설정하고 /api 프록시를 백엔드에 연결합니다. 서버 재시작 후 버튼이 활성화됩니다. 설정 누락·잘못된 출처·비활성 인증 서비스는 버튼을 비활성화하고 준비 중 안내를 표시합니다.

## 기존 DB 갱신

MySQL은 backend 폴더에서 배포 전에 명시적으로 실행합니다.

    .venv/Scripts/python.exe -m app.modules.auth

auth_kakao_identities와 auth_kakao_flows를 추가하고 auth_accounts.phone의 NOT NULL만 해제합니다. 기존 전화번호·계정·세션을 보존합니다. 기존 auth_phone_challenges 테이블은 더 이상 읽거나 쓰지 않지만 자동 삭제하지 않습니다. 기존 데이터는 백업 후 갱신하세요. SQLite는 APP_ENV=test인 격리 테스트에서만 자동 초기화합니다. 개발·운영은 MySQL과 회원 암호화 키가 필수이며 기존 SQLite 계정은 [보안 저장·이관 안내](member-privacy.md)에 따라 명시적으로 이관합니다. 기존 계정 로그인 보존과 반복 초기화는 테스트합니다. 실제 운영 MySQL의 마이그레이션 실행은 별도입니다.

## 동작과 API

| 경로 | 방식 | 역할 |
|---|---|---|
| /v1/auth/kakao/status | GET | 설정 유무만 반환 |
| /v1/auth/kakao/start | POST | 일회용 state·브라우저 결합 쿠키 발급, 인증 주소 반환 |
| /v1/auth/kakao/callback | GET | state 확인·소비, 서버에서 코드 교환·카카오 사용자 ID 조회 |
| /v1/auth/kakao/pending | GET | 최초 가입 대기 쿠키 확인, 선택적 닉네임 반환 |
| /v1/auth/kakao/complete | POST | 이름·만 나이·성별·시도 저장 후 서비스 세션 발급 |

POST는 X-Auth-Request: 1 헤더가 필요합니다. REST API 키를 교체해도 같은 앱의 기존 계정은 유지됩니다. 신규 카카오 회원은 기본 정보 입력을 마쳐야 계정이 생성됩니다. 카카오가 반환한 고정 앱 ID와 사용자 ID의 결합 해시를 기준으로 재로그인하며 이메일·전화번호·이름이 같다는 이유로 기존 계정에 연결하지 않습니다. 기존 아이디 계정의 금융정보가 필요하면 해당 아이디로 로그인합니다. 계정 연결·금융정보 이관은 별도 기능입니다.

state와 최초 가입 증명은 10분 유효하고 DB에 해시로만 저장합니다. 콜백 재사용·다른 브라우저 사용·만료를 차단합니다. 카카오 토큰과 시크릿은 서버에서만 사용하며 브라우저·DB에 저장하지 않습니다. 서비스 세션은 기존 7일 HttpOnly/SameSite=Lax 쿠키이고 운영은 Secure입니다. 로그아웃은 복지나침반 세션만 종료하며 카카오 계정 전체 로그아웃/연결 해제는 하지 않습니다.

실패·취소는 고정된 웹 해시 주소로 돌아오며 공급자 오류·인가 코드·토큰을 최종 이동 URL에 전달하지 않습니다. 운영 프록시와 서버 access log에는 콜백 쿼리(인가 코드)가 기록되지 않도록 로그 설정도 적용해야 합니다.

## 검증과 한계

서버 tests/test_kakao_auth.py는 카카오 공급자 응답을 대체하고 실제 로컬 DB·계정·세션·최초 가입·재로그인·만료·state 결합을 검사합니다. 웹 tests/e2e/auth.spec.js는 실제 로컬 API의 일반 가입·로그인과 대역 기반 카카오 화면을 데스크톱/모바일 크기에서 확인합니다. 실제 카카오 앱 키를 사용한 사용자 동의·로그인과 운영 MySQL 갱신은 아직 검증하지 않았습니다.

구현 근거: [카카오 로그인 REST API 공식 문서](https://developers.kakao.com/docs/ko/kakaologin/rest-api).
