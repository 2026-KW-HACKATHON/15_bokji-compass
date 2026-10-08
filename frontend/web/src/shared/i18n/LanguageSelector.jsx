import { locales } from '../../../../packages/core/src/i18n/index.js';
import { useI18n } from './I18nProvider.jsx';

export default function LanguageSelector() {
  const { locale, setLocale, t, storageError } = useI18n();
  return (
    <div className="language-control">
      <label className="language-selector">
        <span aria-hidden="true">🌐</span>
        <span className="sr-only">{t('언어 선택')}</span>
        <select value={locale} onChange={(event) => setLocale(event.target.value)}>
          {locales.map((item) => (
            <option key={item.code} value={item.code} lang={item.intlLocale}>
              {item.nativeName}
            </option>
          ))}
        </select>
      </label>
      {storageError && (
        <span className="language-storage-warning" role="status">
          {t('언어를 이 브라우저에 저장하지 못했어요. 현재 화면에는 적용됩니다.')}
        </span>
      )}
    </div>
  );
}
