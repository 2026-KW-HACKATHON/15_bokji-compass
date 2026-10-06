# node-forge CVE-2026-85393 보안 수정

검증일: 2026-10-06. Expo SDK 57 개발 도구가 사용하는 `node-forge@1.4.0`의
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)를
프로젝트에서 보완한다. 공식 npm 최신 버전은 여전히 1.4.0이며 수정 릴리스는 없다.

## 변경과 근거

`scripts/apply-node-forge-security-patch.mjs`가 설치된 `lib/rsa.js`의 PKCS#1 v1.5
DigestInfo 검증 두 곳만 보완한다. RSA 연산, 키 생성, 서명 생성, PSS 구현은 바꾸지 않는다.

- 바깥 DigestInfo와 내부 AlgorithmIdentifier의 모든 요소를 검사한다.
- 선택적인 NULL 매개변수에는 내용이 없어야 한다.
- ASN.1 재직렬화 결과가 입력 DER과 정확히 같아야 한다. 비정규 길이, BER 무한 길이,
  후행 바이트를 거부한다. `_parseAllDigestBytes: false`로도 이 검사를 생략할 수 없다.
- 해시 알고리즘 OID도 디코딩·인코딩 왕복 결과가 원래 바이트와 같아야 한다.

내부 요소 개수 검사는 공급자 저장소의 미병합 [PR #1152](https://github.com/digitalbazaar/forge/pull/1152)를
참고했다. NULL 내용과 DER/OID 정규성 검사는 프로젝트의 추가 보완이다. 공급자가 승인하거나
릴리스한 패치라고 표시하지 않는다. 기존의 정규 SHA 서명 및 SHA 알고리즘의 NULL 생략 호환성은 유지한다.

## 설치·검사

모바일 디렉터리에서 실행한다.

```sh
npm ci
npm run security:check
npm run test:security
```

`npm ci` / `npm install`의 `postinstall`에서 적용한다. 잠금 파일에 기록된 중첩 설치본까지
버전과 원본 SHA-256을 모두 확인한 뒤 파일을 쓴다. 예상하지 못한 버전, 누락된 설치본,
변조된 코드, 프로젝트 밖 경로는 오류로 중단한다. 이미 정확히 패치된 파일은 다시 쓰지 않는다.

| 대상 | SHA-256 |
| --- | --- |
| 원본 1.4.0 `lib/rsa.js` | `fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50` |
| 프로젝트 보완 파일 | `7948121fb94d910d030d006926f76bc90510b657873875779734f34587c83f5f` |

`start`, `android`, `android:local`, `ios`, `web`, `lint`, `test`, `export:native`,
`export:web` npm 명령은 Expo/테스트 실행 전에 패치 해시를 검사한다.
설치 스크립트를 생략했다면 `npm run security:patch` 후 다시 검사한다.
직접 `npx expo`, Gradle, 외부 EAS 명령을 실행할 때는 먼저 `npm run security:check`를 실행한다.
이 패치는 `lib/rsa.js`를 사용하는 Node/Expo 도구 경로에 적용하며 패키지의 별도 브라우저용
`dist` 파일을 수정하지 않는다. 앱 소스는 Forge를 직접 가져오지 않는다.

패키지 버전·레지스트리 주소·무결성 정보를 위조하지 않는다. 따라서 `npm audit`과
Dependabot은 버전 범위에 따라 node-forge 경고를 계속 표시할 수 있다. 해당 경고를 전역으로
숨기지 않으며, 실제 보완은 설치 해시와 동작 회귀 검사로 확인한다.

## 검증

- 실제 Forge/Expo 서명 검증 36개: 원본은 17 통과·19 실패, 보완 후 36개 모두 통과.
- SHA-1/224/256/384/512 정상 서명과 선택적 NULL 생략, PSS, Node crypto와 상호 검증.
- 중첩 추가 요소, 비어 있지 않은 NULL, 비정규 DER/OID, 후행 바이트 거부.
- Expo 인증서 검증과 manifest 서명 함수를 실제로 호출.
- 설치 회귀 9개: 멱등성, 검사 모드의 무변경, 변조·버전·누락·경로 이탈 거부,
  중첩 설치본 처리, 전체 사전 검증 후 쓰기.
- 모바일 전체 77개 통과, TypeScript·ESLint 통과, Android/iOS Hermes export 통과.
- 별도 임시 복사본에서 실제 `npm ci --offline`으로 814개 패키지 설치 후 자동 패치 및
  보안 검사 45개 통과. 설치 스크립트가 생략된 상태에서는 npm export 진입이 차단됨을 확인.

테스트는 일회성 합성 개인키로 비정상 DigestInfo에 서명하여 파서의 거부 동작을 검증한다.
개인키 없는 공격자의 위조를 실서비스에서 재현한 것이 아니다. 운영 서명 키·사용자 데이터는
사용하지 않았다. 증거는 추적 제외된 `tmp/node-forge-security-validation/`에 보관한다.

## 공식 수정 버전으로 전환

공급자 수정 릴리스와 Expo 호환성을 확인한 후 잠금 파일을 갱신한다. 그때 로컬 적용 스크립트와
npm 검사 연결을 제거하고 정상·비정상 서명 회귀를 새 버전에 다시 실행한다.
해시 불일치를 무시하거나 지원 버전 문자열만 바꿔 기존 패치를 계속 적용하지 않는다.

## 이번 재조회에서 확인한 별도 경고

2026-10-06 npm audit은 node-forge와 `braces@3.0.3`의
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
두 원인을 상위 패키지와 함께 high 19개로 집계했다. braces는 깊게 중첩된 패턴을 처리할 때
스택이 소진될 수 있는 별도 문제이며, 이 node-forge 수정으로 해결되었다고 표시하지 않는다.
이는 모든 의존성 취약점이 0건이라는 보고가 아니다.

기준 커밋에도 같은 braces/micromatch 버전이 있었다. 확인한 Metro file-map 경로는
`micromatch.some`으로 로컬 파일명을 설정 기반 glob에 대조하고, 이 호출은 picomatch로 이어진다.
앱 사용자 입력이 취약한 braces 파서로 전달되는 경로는 확인하지 못했다. 개발 도구의 다른
외부 입력 경로까지 안전함을 보장하는 것은 아니므로 별도 잔여 항목으로 유지한다.
