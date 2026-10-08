import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import { removeStoredValue } from '../../shared/storage.js';
import { authRequest } from './authApi.js';
import { usePrivacyNotice } from './PrivacyConsent.jsx';

function WithdrawalReview({ onCancel }) {
  const { t } = useI18n();
  const { notice, error: noticeError, retry } = usePrivacyNotice();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef(null);
  const errorRef = useRef(null);
  const pending = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
    return () => pending.current?.abort();
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function withdraw() {
    if (!notice || !confirmed || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await authRequest(
        'withdraw',
        { notice_version: notice.version, confirmation: true },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (result.deleted !== true)
        throw new Error('탈퇴 결과를 확인하지 못했어요. 다시 확인해 주세요.');
      removeStoredValue('bokji.profile.v2');
      removeStoredValue('bokji.saved.v2.api');
      removeStoredValue('bokji.saved.v2.demo');
      window.location.hash = 'home';
      window.location.reload();
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <h3 ref={headingRef} tabIndex={-1}>
        {t('탈퇴 전에 삭제할 정보를 확인해 주세요')}
      </h3>
      <p>
        {t(
          '계정과 회원정보, 저장한 금융정보, 카카오 연결정보, 동의 기록, 알림 설정과 기기 푸시 토큰을 즉시 삭제합니다. 모든 기기의 로그인 세션도 종료됩니다. 삭제한 정보는 복구할 수 없습니다.',
        )}
      </p>
      <p>{t('이 브라우저에 기억한 추천 설정과 저장한 공고도 지웁니다.')}</p>
      {!notice && !noticeError && <p role="status">{t('최신 삭제 안내를 확인하고 있어요…')}</p>}
      {noticeError && (
        <>
          <p role="alert" className="auth-error">
            {t(noticeError)}
          </p>
          <button type="button" className="button secondary" onClick={retry}>
            {t('안내 다시 불러오기')}
          </button>
        </>
      )}
      {error && (
        <p role="alert" ref={errorRef} tabIndex={-1} className="auth-error">
          {t(error)}
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || !notice}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>{t('삭제되는 정보를 확인했고 회원 탈퇴에 동의합니다.')}</span>
      </label>
      <button
        type="button"
        className="button secondary"
        disabled={busy || !notice || !confirmed}
        onClick={withdraw}
      >
        {busy ? t('개인정보 삭제 중…') : t('탈퇴하고 개인정보 삭제')}
      </button>
      <button type="button" className="text-button" disabled={busy} onClick={onCancel}>
        {t('취소')}
      </button>
    </>
  );
}

export default function AccountWithdrawal() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <section className="account-withdrawal" aria-label={t('회원 탈퇴')}>
      {open ? (
        <WithdrawalReview onCancel={() => setOpen(false)} />
      ) : (
        <>
          <h3>{t('회원 탈퇴')}</h3>
          <p>{t('탈퇴하면 저장한 개인정보를 즉시 삭제합니다.')}</p>
          <button type="button" className="text-button" onClick={() => setOpen(true)}>
            {t('회원 탈퇴')}
          </button>
        </>
      )}
    </section>
  );
}
