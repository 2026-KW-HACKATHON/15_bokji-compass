import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { useState } from 'react';
import { PrivacyNoticeContent, usePrivacyNotice } from './PrivacyConsent.jsx';

function Content() {
  const { t } = useI18n();
  const { notice, error, retry } = usePrivacyNotice();
  if (error)
    return (
      <>
        <p role="alert">{t(error)}</p>
        <button type="button" className="text-button" onClick={retry}>
          {t('다시 불러오기')}
        </button>
      </>
    );
  return notice ? (
    <PrivacyNoticeContent notice={notice} />
  ) : (
    <p role="status">{t('안내를 불러오고 있어요…')}</p>
  );
}

export default function PrivacyPolicyAccess() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <details
      className="privacy-policy-access"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{t('개인정보 처리 안내 다시 보기')}</summary>
      {open && <Content />}
    </details>
  );
}
