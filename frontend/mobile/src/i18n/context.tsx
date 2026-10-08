import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { locales } from "../../../packages/core/src/i18n/index.js";
import { localeStorage } from "../platform/localeStorage";
import { createLocalePreference, translateUi } from "./model";
import { formatMoney as koreanMoney } from "@bokji/core/finance-model";

type I18n = {
  locale: string;
  intlLocale: string;
  storageError: boolean;
  setLocale: (locale: string) => Promise<void>;
  t: (source: string, values?: Record<string, unknown>) => string;
  formatMoney: (amount: number | null) => string;
};
const I18nContext = createContext<I18n | null>(null);

function deviceLanguages(): string[] {
  try {
    if (typeof navigator !== "undefined" && navigator.languages?.length)
      return [...navigator.languages];
    // Hermes provides the system locale through Intl; no native dependency is needed.
    return [Intl.DateTimeFormat().resolvedOptions().locale];
  } catch {
    return [];
  }
}

export function I18nProvider({ children }: React.PropsWithChildren) {
  const [preference] = useState(() =>
    createLocalePreference(localeStorage, deviceLanguages()),
  );
  const locale = useSyncExternalStore(
    preference.subscribe,
    preference.getSnapshot,
    preference.getSnapshot,
  );
  const storageError = useSyncExternalStore(
    preference.subscribe,
    preference.getStorageError,
    preference.getStorageError,
  );
  useEffect(() => {
    void preference.restore();
  }, [preference]);
  const value = useMemo<I18n>(() => {
    const intlLocale =
      locales.find((entry: { code: string }) => entry.code === locale)
        ?.intlLocale || "ko-KR";
    return {
      locale,
      storageError,
      intlLocale,
      setLocale: preference.setLocale,
      t: (source, values = {}) => translateUi(locale, source, values),
      formatMoney: (amount) =>
        locale === "ko"
          ? koreanMoney(amount)
          : !Number.isSafeInteger(amount)
            ? translateUi(locale, "확인 필요")
            : new Intl.NumberFormat(intlLocale, {
                style: "currency",
                currency: "KRW",
                maximumFractionDigits: 0,
              }).format(amount as number),
    };
  }, [locale, storageError, preference]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is required");
  return value;
}
