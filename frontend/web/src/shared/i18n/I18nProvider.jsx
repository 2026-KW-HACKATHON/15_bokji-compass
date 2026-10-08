import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  detectLocale,
  intlLocaleFor,
  isSupportedLocale,
  localeStorageKey,
  normalizeLocale,
  parseStoredLocale,
  translate,
} from '../../../../packages/core/src/i18n/index.js';
import { writeStoredValue } from '../storage.js';
import './i18n.css';
import { I18nContext } from './I18nContext.js';

const browserLocale = () =>
  detectLocale(globalThis.navigator?.languages ?? [globalThis.navigator?.language]);

function initialLocale() {
  try {
    const raw = localStorage.getItem(localeStorageKey);
    if (raw !== null) {
      const value = parseStoredLocale(raw);
      if (value) return value;
    }
  } catch {
    /* A blocked or corrupt store does not prevent language selection. */
  }
  return browserLocale();
}

export function I18nProvider({ children }) {
  const [locale, updateLocale] = useState(initialLocale);
  const [storageError, setStorageError] = useState(false);
  const setLocale = useCallback((value) => {
    const next = normalizeLocale(value);
    updateLocale(next);
    setStorageError(!writeStoredValue(localeStorageKey, next));
  }, []);
  useEffect(() => {
    document.documentElement.lang = intlLocaleFor(locale);
    document.documentElement.dataset.locale = locale;
    document.title = translate(locale, '복지나침반');
  }, [locale]);
  useEffect(() => {
    const syncLocale = (event) => {
      if (event.key !== localeStorageKey) return;
      try {
        const next = event.newValue === null ? browserLocale() : parseStoredLocale(event.newValue);
        if (isSupportedLocale(next)) updateLocale(next);
      } catch {
        /* Ignore another tab's invalid value. */
      }
    };
    window.addEventListener('storage', syncLocale);
    return () => window.removeEventListener('storage', syncLocale);
  }, []);
  const t = useCallback((source, values) => translate(locale, source, values), [locale]);
  const value = useMemo(
    () => ({ locale, setLocale, t, intlLocale: intlLocaleFor(locale), storageError }),
    [locale, setLocale, t, storageError],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within I18nProvider');
  return value;
}
