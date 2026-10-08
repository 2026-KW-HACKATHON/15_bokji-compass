import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import { safeSourceUrl } from './policyModel.js';
import { safeTelephoneUrl } from './applicationGuideModel.js';
import { policyDeadline } from './deadlineModel.js';
import { isApplicationNotice, noticeStagePresentation } from './noticeSeriesModel.js';
import useSeoulToday from './useSeoulToday.js';
import './application-guide.css';

export default function ApplicationGuide({
  policy,
  preparation = null,
  onPrepared,
  disabled = false,
  applicationUnavailable = false,
}) {
  const { t } = useI18n();
  const id = useId();
  const heading = useRef(null);
  const [open, setOpen] = useState(false);
  const guide = policy.applicationGuide;
  const today = useSeoulToday();
  const closed = policyDeadline(policy, today).state === 'closed';
  const { note: stageNote } = noticeStagePresentation(policy);
  const unavailable =
    applicationUnavailable || closed || !isApplicationNotice(policy, { grouped: true });
  const source = safeSourceUrl(policy.sourceUrl);
  const documents = guide?.documents || [];
  const preparedIds =
    preparation?.revision_id === policy.revisionId
      ? preparation.prepared_document_ids.filter((documentId) =>
          documents.some((document) => document.id === documentId),
        )
      : [];
  const methodText = guide?.methodText || policy.applicationMethod || '';
  const onlineUnconfirmed = !guide?.onlineUrl && /온라인|인터넷|online|웹사이트/i.test(methodText);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);
  const applicationLink = (href, children) =>
    unavailable ? (
      <span className="button secondary application-guide-action" aria-disabled="true">
        {children}
      </span>
    ) : (
      <a
        className="button secondary application-guide-action"
        href={href}
        {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
        {href.startsWith('http') && <Icon name="external" size={16} />}
        {href.startsWith('http') && <span className="sr-only">{t('새 창')}</span>}
      </a>
    );
  return (
    <section className="application-guide">
      <button
        type="button"
        className="button primary application-guide-trigger"
        aria-expanded={open}
        aria-controls={`${id}-guide`}
        onClick={() => setOpen(!open)}
      >
        {t(unavailable ? '신청 방법과 서류 확인' : '이 공고 신청하기')}
        <Icon name="down" size={17} />
      </button>
      {open && (
        <div
          id={`${id}-guide`}
          className="application-guide-panel"
          aria-labelledby={`${id}-heading`}
        >
          <h3 id={`${id}-heading`} ref={heading} tabIndex={-1}>
            {t('신청 방법과 서류 준비')}
          </h3>
          {unavailable && (
            <p className="application-guide-note">
              {t(
                stageNote ||
                  (closed
                    ? '접수가 마감된 공고예요. 최신 접수 여부는 담당 기관에 확인해 주세요.'
                    : '현재 접수 상태를 먼저 확인해 주세요.'),
              )}
            </p>
          )}
          <div className="application-guide-method">
            <h4>{t('신청 방법')}</h4>
            {methodText ? (
              <p className="application-guide-source-text">{methodText}</p>
            ) : (
              <p>{t('신청 방법은 공식 공고에서 확인해 주세요.')}</p>
            )}
            {guide?.onlineUrl && (
              <div className="application-guide-actions">
                {applicationLink(guide.onlineUrl, t('온라인으로 신청하기'))}
              </div>
            )}
            {onlineUnconfirmed && (
              <p className="fine-print">
                {t('온라인 신청 주소를 확인하지 못했어요. 공식 공고의 신청 방법을 확인해 주세요.')}
              </p>
            )}
            {guide?.phones?.length > 0 && (
              <ul className="application-guide-phones">
                {guide.phones.map((phone, index) => (
                  <li key={`${phone.kind}-${phone.number}-${index}`}>
                    {phone.label && (
                      <span className="application-guide-phone-label">{phone.label}</span>
                    )}
                    {phone.kind === 'application' ? (
                      applicationLink(
                        safeTelephoneUrl(phone.number),
                        <>
                          <span>{t('전화로 신청하기')}</span>
                          <strong>{phone.number}</strong>
                        </>,
                      )
                    ) : (
                      <a
                        className="application-guide-inquiry"
                        href={safeTelephoneUrl(phone.number)}
                      >
                        <span>{t('신청 방법 전화 문의')}</span>
                        <strong>{phone.number}</strong>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {guide?.visitText && (
              <div className="application-guide-visit">
                <h4>{t('방문 신청 안내')}</h4>
                <p className="application-guide-source-text">{guide.visitText}</p>
              </div>
            )}
            {source && (
              <a
                className="application-guide-source"
                href={source}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('공식 공고에서 신청 방법 확인')}
                <Icon name="external" size={15} />
                <span className="sr-only">{t('새 창')}</span>
              </a>
            )}
          </div>
          <div className="application-guide-documents">
            {documents.length > 0 ? (
              onPrepared ? (
                <fieldset disabled={disabled || unavailable}>
                  <legend>{t('필요한 서류')}</legend>
                  <p className="application-guide-progress" aria-live="polite">
                    {t('준비한 서류 {count}/{total}', {
                      count: preparedIds.length,
                      total: documents.length,
                    })}
                  </p>
                  <p className="fine-print">
                    {t(
                      '준비한 서류를 직접 확인해 주세요. 파일을 제출하거나 신청한 것으로 처리하지 않아요.',
                    )}
                  </p>
                  <div className="application-guide-checklist">
                    {documents.map((document) => (
                      <label key={document.id}>
                        <input
                          type="checkbox"
                          checked={preparedIds.includes(document.id)}
                          onChange={(event) => onPrepared(document.id, event.target.checked)}
                        />
                        <span className="application-guide-source-text">{document.label}</span>
                      </label>
                    ))}
                  </div>
                  {preparedIds.length === documents.length && (
                    <p className="application-guide-note" role="status">
                      {t('서류 준비를 확인했어요. 신청 완료를 뜻하지 않아요.')}
                    </p>
                  )}
                </fieldset>
              ) : (
                <>
                  <h4>{t('필요한 서류')}</h4>
                  <ul className="application-guide-document-list">
                    {documents.map((document) => (
                      <li key={document.id} className="application-guide-source-text">
                        {document.label}
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : (
              <>
                <h4>{t('필요한 서류')}</h4>
                <p>
                  {guide?.documentsStatus === 'none'
                    ? t('공고에 제출 서류가 없다고 안내되어 있어요.')
                    : t(
                        '필요한 서류가 원문에 명확히 안내되지 않았어요. 신청 전에 담당 기관에 확인해 주세요.',
                      )}
                </p>
              </>
            )}
            {guide?.documentsNote && (
              <p className="fine-print application-guide-source-text">{guide.documentsNote}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
