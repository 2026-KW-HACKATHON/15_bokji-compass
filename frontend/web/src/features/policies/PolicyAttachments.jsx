import { appConfig } from '../../shared/config.js';
import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { attachmentHref } from './attachmentModel.js';
import './policy-attachments.css';

export default function PolicyAttachments({ attachments = [] }) {
  const { t, intlLocale } = useI18n();
  if (!attachments.length) return null;
  return (
    <section className="policy-attachments" aria-label={t('첨부 파일')}>
      <h3>
        {t('첨부 파일')} <span>({attachments.length})</span>
      </h3>
      <ul>
        {attachments.map((file) => (
          <li key={file.id}>
            <div className="policy-attachment-name">
              <span>{file.name}</span>
              {file.sizeBytes && (
                <small>
                  {new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(
                    file.sizeBytes / (file.sizeBytes >= 1_000_000 ? 1_000_000 : 1000),
                  )}{' '}
                  {file.sizeBytes >= 1_000_000 ? 'MB' : 'KB'}
                </small>
              )}
            </div>
            <div className="policy-attachment-actions">
              {file.previewUrl && (
                <a
                  href={attachmentHref(file.previewUrl, appConfig.apiBaseUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${file.name} ${t('PDF 보기')}`}
                >
                  {t('PDF 보기')}
                  <span className="sr-only"> {t('새 창')}</span>
                </a>
              )}
              <a
                href={attachmentHref(file.downloadUrl, appConfig.apiBaseUrl)}
                download={file.name}
                aria-label={`${file.name} ${t('다운로드')}`}
              >
                {t('다운로드')}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
