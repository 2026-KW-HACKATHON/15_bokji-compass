import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { translateFinanceError } from '../../../../packages/core/src/i18n/index.js';

export function translateFinanceTitle(title, t) {
  const entry = title.match(/^(가구원|차량) (\d+)(?: \/ (\d+))?(?: · (.+))?$/);
  if (entry) {
    const prefix = t(entry[3] ? `${entry[1]} {index} / {total}` : `${entry[1]} {index}`, {
      index: entry[2],
      total: entry[3],
    });
    return entry[4] ? `${prefix} · ${t(entry[4])}` : prefix;
  }
  const group = title.match(/^(가구|소득|재산|부채|차량|확인) 정보$/);
  if (group) return t('{group} 정보', { group: t(group[1]) });
  return t(title);
}

export default function useFinanceI18n() {
  const { t, intlLocale, locale } = useI18n();
  const formatNumber = (value) =>
    typeof value === 'number' && Number.isFinite(value)
      ? new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(value)
      : t('확인 필요');
  const formatMoney = (value) =>
    typeof value === 'number' && Number.isSafeInteger(value)
      ? locale === 'ko'
        ? `${new Intl.NumberFormat(intlLocale).format(value)}원`
        : new Intl.NumberFormat(intlLocale, {
            style: 'currency',
            currency: 'KRW',
            maximumFractionDigits: 0,
          }).format(value)
      : t('확인 필요');
  return {
    t,
    intlLocale,
    locale,
    formatNumber,
    formatMoney,
    translateTitle: (title) => translateFinanceTitle(title, t),
    translateError: (message) => translateFinanceError(message, t),
  };
}
