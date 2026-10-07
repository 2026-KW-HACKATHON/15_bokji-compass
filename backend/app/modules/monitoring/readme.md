# 사용자 상황 기반 지속 안내

사용자가 저장과 지속 안내에 동의한 상황 정보에서 탐색 분야를 도출하고, 공개된 정책
카탈로그의 전체 후보를 주기적으로 다시 비교합니다. 노후 자가주택의 주거 개선, 청년·구직자의
일자리 지원, 거주 지역과 연결된 재난 지원 공고의 발견, 사용자가 확인한 재난 피해의 복구
지원을 우선 다룹니다. 탐색 기준은 실제
지원 자격의 확정이 아니며, 확인하지 않은 사실은 질문으로 남습니다.

## 저장과 처리

- `models.py`: 저장 동의, 상황 정보, 일시중지와 지원 진행 상태의 입력 검증.
- `public.py`: 탐색 분야, 공식 공고의 근거 및 추가 확인 질문, 의미 변화 fingerprint.
- `storage.py`: 계정별 프로필·탐색 분야·후보·신청 진행 상태·앱 내 알림의 영구 저장.
- `worker.py`: 세션 없이 서버의 회원 정보를 읽어 활성 계정 전체를 처리하는 작업.
- `schema.py` / `__main__.py`: 별도 테이블 초기화와 독립 실행 명령.

저장 기본값은 지속 안내 꺼짐입니다. 검색 중 동의 철회, 일시중지, 삭제, 정보 수정 또는
지원 진행 상태 수정이 발생하면 이전 프로필 버전의 결과를 저장하지 않습니다. 계정 쓰기와
탈퇴는 같은 계정 잠금을 사용하며 탈퇴 시 관련 테이블도 삭제합니다. 앱 내 알림은 새 후보와
의미 있는 공고 변경에만 생성하고 같은 fingerprint는 다시 알리지 않습니다. 무시하거나
완료한 지원의 변경 알림도 생략합니다. 공고가 사라져도 준비·신청·완료 기록은 보존합니다.

여러 탐색 분야에 같은 공고가 연결되면 신청 진행 상태를 공유합니다. 특정 분야의 후보를
지정해 상태를 바꾸면 같은 계정의 해당 공고 전체 이력에 적용됩니다. 지역 재난 공고 탐색에서
실제 피해 확인 후 복구 지원 탐색으로 바뀌어도 기존 신청 상태를 이어받으며, 완료·해당 없음
상태의 공고는 신규 분야에 연결되었다는 이유만으로 다시 알리지 않습니다. 이전 버전에서
분야별 상태가 상충한 경우 `살펴보는 중`을 제외한 진행 기록을 우선합니다. 그중 최근
`updated_at`의 상태를 선택하고 동률이면 완료 → 해당 없음 → 신청 완료 → 준비 중 순서입니다.
사용자가 `살펴보는 중`으로 직접 재설정하면 모든 분야를 함께 변경하므로 오래된 진행이
되살아나지 않습니다.

계정 순회는 keyset pagination으로 전체 활성 계정을 처리합니다. 한 계정 처리 실패는 다른
계정의 평가를 막지 않으며, 실패한 검색으로 기존 결과를 비우지 않습니다. 로그에는 계정 ID,
주거·피해 사실이나 원본 예외 메시지를 남기지 않습니다. 알림함에는 최근 100건을 표시하고
`unread_count`는 저장된 전체 미확인 알림을 집계합니다.

## 함수 입력·반환

- `public.derive_needs(member: dict, profile: MonitoringProfile, *, today: date | None = None)`
  → `list[{id, title, reason, keywords, questions}]`. 서버 회원 나이와 명시적 선택정보에서
  탐색 분야를 만든다. DB/네트워크/AI 호출 없음. 20년·19~34세는 탐색 기준이며 자격 기준이 아니다.
  나이가 없거나 청년 범위 밖이어도 명시적인 구직 의사 또는 선택한 취업 준비 상황으로
  취업 지원을 탐색한다. 구직 의사 false는 취업 준비 상황에 따른 추가 탐색을 억제하며 청년
  연령 탐색은 유지한다. 취업 준비·학생·청년이라는 이유로 실업 상태를 추정하지 않는다.
- `public.scan_candidates(repository, member, profile, needs, *, today=None)`
  → `list[{need_id, policy_id, policy, status, reason, questions, fingerprint, schedule_status,
  eligibility_decided, matched_keywords, evidence}]`. DB의 최신 공개 공고만 keyset 페이지로 읽는다.
  status는 potential_match 또는 needs_review이며 eligibility_decided는 항상 false다.
  연결된 공고의 원문·조건 손상은 `MonitoringScanIncomplete`; DB 조회 실패는 SQLAlchemyError다.
  실패를 빈 후보 결과로 바꾸지 않는다. 외부 검색·AI·공고 쓰기 없음.
- `MonitoringStore(engine).read(account_id)` → profile/needs/candidates/alerts/설정/버전의 snapshot.
  `save(account_id, profile, *, enabled=False)` → 같은 snapshot. 저장 동의 확인은 API 모델이 한다.
  `set_enabled(account_id, bool)` → 설정 변경 snapshot; `delete(account_id)` → None.
- `set_candidate_state(account_id, policy_id, need_id, state)` → snapshot.
  watching/preparing/applied/dismissed/completed만 허용하며 다른 계정의 후보는 수정할 수 없다.
- `mark_read(account_id, ids)` → snapshot. 계정 안의 해당 알림만 읽음 처리한다.
- `record_scan(account_id, needs, found, *, expected_version=None, expected_updated_at=None,
  expected_member=None)` → snapshot. 읽은 버전과 활성 상태, 전달한 회원 사실이 여전히 같은
  경우에만 결과를 커밋한다. 버전 정보 없는 호출은 ValueError다.
- `enabled_accounts(*, batch_size=100)` → 활성 계정 ID의 iterator. 전체 계정 수를 제한하지 않는다.
- `worker.evaluate_account(repository, store, member, *, today=None)` → 현재 snapshot.
  회원 기본 사실을 DB에서 새로 확인해 후보를 평가한다. 쓰기 경합 시 이전 결과는 버린다.
- `worker.run_once(repository, store, auth_service=None, *, member_loader=None, batch_size=100,
  today=None)` → `{checked, skipped, failed}`. 한 계정의 실패 뒤에도 다른 계정을 계속 처리한다.
- `schema.initialize_monitoring_schema(engine)` → None. 명시적 additive 테이블 초기화만 수행한다.

## 재난 공고 발견과 피해 복구 추적

피해 여부가 미입력이고 회원에 저장된 거주 지역을 공식 지역 카탈로그에서 확인할 수 있으면
`disaster_watch`를 만든다. 공개 카탈로그에서 재난 복구·구호·피해 지원 문맥과 명시적인
거주 지역 조건을 함께 확인한 공고만 후보로 연결한다. 피해를 직접 입력하지 않아도
이러한 공고가 있으면 발견할 수 있으며, 지역에 관련 공고가 없으면 새 후보나 알림은 없다.
피해 여부를 `false`로 저장하면 지역 재난 공고 탐색을 중단한다.

지역 근거는 정규화된 `residence_region`의 자격 조건이 실제 회원 지역과 일치하는 경우다.
참고·우선순위·부정 조건은 근거로 사용하지 않는다. OR의 다른 가능한 분기가 지역 조건 없이
통과하는 공고나 모든 시도를 열거한 전국 사업도 연결하지 않는다. 회원의 시도 정보만으로
특정 시군구·읍면동 조건의 일치를 확정하지 않으며, 전국·지역 불명 공고 또는 기관명·제목의
지역 단어만으로 지역 재난을 추정하지 않는다. 현재 이 근거가 정규화되지 않은 공고는
지역 공고 탐색에서 발견하지 못할 수 있다.

지역 공고 후보는 모두 `needs_review`이며, 실제 피해 여부·발생일·피해 확인 요건을 질문한다.
표현은 “거주 지역과 관련된 재난 지원 공고를 발견했어요”로, 새 게시 시점이나 실제 재난
발생을 단정하지 않는다. 상시 공고가 처음 연결될 수도 있고 알림은 해당 계정에서 새로 발견되거나
의미 있게 바뀐 후보에 대한 안내다. 공고 발견으로 피해 여부·피해 유형·발생일을 자동 저장하지 않는다.

사용자가 피해를 직접 확인하면 `disaster_recovery`로 복구 공고를 추적한다. 발생일이 없으면
피해 발생 날짜를 질문하며 일자를 추정하지 않는다. 날짜가 있을 때만 피해 정보 재확인 기간을 계산한다.
180일은 피해 정보의 재확인을 묻는 탐색 주기이며 지원 자격·신청 기간이 아니다. 피해 조건은
현재 조건 v2에 정규화되지 않아 복구 후보도 `needs_review`로 남으며, 기관의 실제 심사를 대신하지 않는다.

## 초기화와 worker 실행

backend 폴더에서 설정된 Python 환경을 사용합니다. 기존 회원·정책 테이블이 준비되어 있어야
하며 HTTP 요청이나 worker가 운영 MySQL의 테이블을 자동 생성하지 않습니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.monitoring --init
.\.venv\Scripts\python.exe -m app.modules.monitoring --once
.\.venv\Scripts\python.exe -m app.modules.monitoring --watch --interval 300 --batch-size 100
```

`--init`은 모니터링 테이블만 추가합니다. `--once`와 `--watch`는 `DB_ENABLED=true`인 공개
MySQL 정책 카탈로그와 활성 인증 서비스를 필요로 합니다. `--watch`의 기본 간격은 300초이며
최소 30초입니다. 배치 크기는 계정 조회 페이지 크기이며 전체 처리 계정 수의 제한이 아닙니다.
앱이나 브라우저를 닫아도 worker 프로세스가 실행 중이면 안내 결과를 계속 갱신합니다.

운영에서는 위 명령을 프로세스 관리자나 작업 스케줄러에서 실행해야 합니다. 이 기능이
스케줄러를 자동 설치하거나 운영 프로세스를 시작하지는 않습니다. worker는 이미 수집·공개된
공고를 재평가하며 별도의 공고 수집 파이프라인을 실행하지 않습니다. 공식 재난 사건 피드의
자동 수집, 휴대폰 푸시 발송, 이메일 전송, 마감 임박 별도 알림은 이번 구현에 포함되지
않습니다. 현재 알림은 영구 저장된 앱 내 알림입니다.
