import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import { authRequest } from './authApi.js';

export const PRIVACY_NOTICE_VERSION = '2026-10-07.3';

export function PrivacyNoticeContent({ notice }) {
  const { t } = useI18n();
  return (
    <div className="privacy-notice-content">
      <p className="privacy-notice-intro">
        {t(
          '{operator}은 아래 목적과 범위에서 개인정보를 처리합니다. 필요한 항목만 선택해 주세요. 선택 항목에 동의하지 않아도 회원가입과 공고 탐색을 이용할 수 있습니다.',
          { operator: notice.operator_name },
        )}
      </p>
      <section aria-label={t('회원가입 개인정보 안내')}>
        <h3>{t('회원가입과 계정 관리 · 필수')}</h3>
        <dl>
          <div>
            <dt>{t('수집 항목')}</dt>
            <dd>
              {t(
                '일반 가입: 아이디, 비밀번호, 이메일. 카카오 가입: 카카오 계정 식별정보, 직접 입력한 이메일. 서비스가 생성하는 회원 식별자, 가입·수정 시각, 동의 항목·안내문 버전·동의 시각, 인증·로그인 세션 정보도 처리합니다.',
              )}
            </dd>
          </div>
          <div>
            <dt>{t('이용 목적')}</dt>
            <dd>
              {t(
                '회원가입 의사 확인, 회원 식별, 로그인 및 계정 관리. 일반 가입의 이메일 인증과 부정 이용 방지.',
              )}
            </dd>
          </div>
          <div>
            <dt>{t('보유 기간')}</dt>
            <dd>{notice.retention}</dd>
          </div>
          <div>
            <dt>{t('거부 권리')}</dt>
            <dd>
              {t(
                '동의를 거부할 수 있습니다. 거부하면 회원가입은 할 수 없지만 공개 공고 탐색은 이용할 수 있습니다.',
              )}
            </dd>
          </div>
        </dl>
        <p>
          {t(
            '비밀번호는 복원할 수 없는 해시로 저장합니다. 인증·가입 대기 정보는 만료 후 정리하며, 로그인 세션은 최대 7일 동안 유지되고 탈퇴하면 즉시 종료됩니다. 부정 요청을 제한하기 위해 IP 주소의 해시와 요청 횟수를 일시적으로 처리하며, 제한 기간이 만료되면 정리합니다.',
          )}
        </p>
        <p>
          {t(
            '카카오가 제공한 닉네임은 가입 진행 확인을 위해 최대 10분간 대기 정보로 처리합니다. 아래 맞춤 안내에 동의한 경우에만 회원의 표시 이름으로 저장합니다.',
          )}
        </p>
      </section>
      <section aria-label={t('맞춤 안내용 개인정보 안내')}>
        <h3>{t('표시 이름과 맞춤 복지 안내 · 선택')}</h3>
        <dl>
          <div>
            <dt>{t('수집 항목')}</dt>
            <dd>
              {t(
                '표시 이름 또는 카카오 닉네임, 만 나이, 성별, 거주 지역, 우편번호, 기본 주소와 상세 주소. 원하는 항목만 입력할 수 있습니다.',
              )}
            </dd>
          </div>
          <div>
            <dt>{t('이용 목적')}</dt>
            <dd>
              {t(
                '화면에 이름 표시, 거주 주소 관리, 나이·성별·주소에서 확인한 지역 조건에 맞는 복지 공고 안내. 회원정보 수정 화면에서 변경하거나 비울 수 있습니다.',
              )}
            </dd>
          </div>
          <div>
            <dt>{t('보유 기간')}</dt>
            <dd>
              {notice.retention}
              {t(' 개별 항목을 삭제하면 해당 정보를 더 이상 사용하지 않습니다.')}
            </dd>
          </div>
          <div>
            <dt>{t('거부 권리')}</dt>
            <dd>
              {t(
                '동의하지 않아도 가입할 수 있습니다. 선택한 정보를 이용한 맞춤 안내만 제한됩니다.',
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section aria-label={t('AI 개인정보 처리 안내')}>
        <h3>{t('외부 AI 질문·답변 · 선택')}</h3>
        <p>
          {t(
            'AI에 직접 질문하는 경우 질문 내용, 회원의 지역·연령대, 선택한 공고 내용을 외부 AI 서비스에 보내 답변을 만듭니다. 이름·이메일·성별·우편번호·기본 주소·상세 주소·저장한 금융정보는 자동 첨부하지 않습니다.',
          )}
        </p>
        <p>
          {t('공개된 복지 공고의 AI 정리에는 회원가입 정보나 회원의 질문을 포함하지 않습니다.')}
        </p>
        <p>
          {t(
            '질문에는 주민등록번호, 연락처, 건강·장애 정보 등 민감한 내용을 입력하지 마세요. AI 답변은 참고용이며 지원 자격은 담당 기관에서 확인해야 합니다.',
          )}
        </p>
        {notice.ai?.enabled ? (
          <dl>
            <div>
              <dt>{t('처리 업체·연락처')}</dt>
              <dd>
                {notice.ai.provider_name} / {notice.ai.contact}
              </dd>
            </div>
            <div>
              <dt>{t('이전 국가')}</dt>
              <dd>{notice.ai.countries.join(', ')}</dd>
            </div>
            <div>
              <dt>{t('목적·항목')}</dt>
              <dd>
                {notice.ai.purpose} / {notice.ai.items.join(', ')}
              </dd>
            </div>
            <div>
              <dt>{t('이전 시기·방법')}</dt>
              <dd>
                {notice.ai.transfer_time} / {notice.ai.transfer_method}
              </dd>
            </div>
            <div>
              <dt>{t('보유 기간')}</dt>
              <dd>{notice.ai.retention}</dd>
            </div>
            <div>
              <dt>{t('모델 학습 이용')}</dt>
              <dd>{notice.ai.training}</dd>
            </div>
            <div>
              <dt>{t('거부·철회')}</dt>
              <dd>
                {t(
                  '동의하지 않아도 가입, 공고 탐색, 준비된 FAQ를 이용할 수 있습니다. 동의 철회는 개인정보 문의 이메일로 요청할 수 있습니다.',
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="privacy-pending">
            {t(
              '외부 AI의 처리 업체·국외이전·보유기간 안내를 준비 중입니다. 안내와 별도 동의가 갖춰지기 전에는 회원 질문을 외부 AI로 전송하지 않습니다. 공고 탐색과 준비된 FAQ는 계속 이용할 수 있습니다.',
            )}
          </p>
        )}
      </section>
      <section aria-label={t('추가 개인정보와 권리 안내')}>
        <h3>{t('추가 정보와 삭제 요청')}</h3>
        <p>
          {t(
            '소득·재산·가구·차량 정보는 계산기 이용 시 별도로 안내하며, 계정 저장에는 별도 동의를 받습니다. 회원가입 동의에는 금융정보 저장이나 건강·장애 등 민감정보 처리가 포함되지 않습니다.',
          )}
        </p>
        <p>
          {t(
            '회원정보는 ‘내 정보’에서 수정하거나 비울 수 있습니다. ‘내 정보’의 회원 탈퇴에서 계정, 저장한 금융정보, 카카오 연결정보, 동의 기록, 알림 설정과 기기 푸시 토큰을 즉시 삭제하고 모든 로그인 세션을 종료합니다. 개인정보 열람·정정·동의 철회에 관한 문의는 아래 이메일로 접수합니다: ',
          )}
          <a href={`mailto:${notice.contact_email}`}>{notice.contact_email}</a>
        </p>
      </section>
      <details className="privacy-laws">
        <summary>{t('관련 법령 확인')}</summary>
        <p>
          {t(
            '개인정보 보호법 제15조(수집·이용), 제16조(최소 수집), 제21조(파기), 제22조(구분된 동의), 제23조(민감정보), 제26조(처리 위탁), 제28조의8(국외이전), 제30조(처리방침 공개)를 기준으로 안내합니다.',
          )}
        </p>
        <a href="https://www.law.go.kr/법령/개인정보보호법" target="_blank" rel="noreferrer">
          {t('국가법령정보센터에서 법령 보기')}
        </a>
      </details>
      <p className="privacy-version">
        {t('안내문 버전 ')}
        {notice.version}
        {t(' · 운영자 ')}
        {notice.operator_name}
      </p>
    </div>
  );
}

export function usePrivacyNotice() {
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    authRequest('privacy-notice', undefined, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.version !== PRIVACY_NOTICE_VERSION || !result.contact_email || !result.retention)
          throw new Error('최신 개인정보 안내를 확인하지 못했어요. 다시 불러와 주세요.');
        setNotice(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [attempt]);
  return { notice, error, retry: () => setAttempt((value) => value + 1) };
}

export default function PrivacyConsent({ onAccept, buttonLabel = '동의하고 가입 방법 선택' }) {
  const { t } = useI18n();
  const { notice, error, retry } = usePrivacyNotice();
  const [collection, setCollection] = useState(false);
  const [profile, setProfile] = useState(false);
  const [ai, setAi] = useState(false);
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section className="privacy-consent" aria-labelledby="privacy-consent-title">
      <h2 id="privacy-consent-title" ref={headingRef} tabIndex={-1}>
        {t('개인정보 수집·이용 안내')}
      </h2>
      {!notice && !error && <p role="status">{t('개인정보 안내를 불러오고 있어요…')}</p>}
      {error && (
        <>
          <p role="alert" className="auth-error">
            {t(error)}
          </p>
          <button type="button" className="button secondary" onClick={retry}>
            {t('안내 다시 불러오기')}
          </button>
        </>
      )}
      {notice && (
        <>
          <PrivacyNoticeContent notice={notice} />
          <fieldset className="privacy-choices">
            <legend>{t('아래 안내를 확인하고 동의 여부를 선택해 주세요')}</legend>
            <label>
              <input
                type="checkbox"
                checked={collection}
                onChange={(event) => setCollection(event.target.checked)}
              />
              <span>{t('[필수] 회원가입 개인정보 수집·이용에 동의합니다.')}</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={profile}
                onChange={(event) => setProfile(event.target.checked)}
              />
              <span>{t('[선택] 맞춤 안내용 개인정보 수집·이용에 동의합니다.')}</span>
            </label>
            {notice.ai?.enabled && (
              <label>
                <input
                  type="checkbox"
                  checked={ai}
                  onChange={(event) => setAi(event.target.checked)}
                />
                <span>{t('[선택] 외부 AI 처리 및 개인정보 국외이전에 동의합니다.')}</span>
              </label>
            )}
          </fieldset>
        </>
      )}
      <button
        type="button"
        className="button primary full"
        disabled={!notice || !collection}
        onClick={() => {
          if (!notice || !collection) return;
          onAccept({
            notice_version: notice.version,
            collection: true,
            profile,
            ai,
            ...(ai ? { ai_notice_version: notice.ai.notice_version } : {}),
          });
        }}
      >
        {t(buttonLabel)}
      </button>
      <a className="text-button" href="#home">
        {t('동의하지 않고 공고 둘러보기')}
      </a>
    </section>
  );
}
