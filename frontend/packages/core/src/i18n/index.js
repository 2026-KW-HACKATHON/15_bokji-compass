import { assistantMessages } from "./assistantMessages.js";
import { commonMessages } from "./commonMessages.js";
import { accountMessages } from "./accountMessages.js";
import { featureMessages } from "./featureMessages.js";
import { mobileMessages } from "./mobileMessages.js";
import { financeMessages } from "./financeMessages.js";
import { policyMessages } from "./policyMessages.js";
export { translateFinanceError } from "./financeErrors.js";

export const localeStorageKey = "bokji.locale.v1";
export const locales = Object.freeze(
  [
    { code: "ko", nativeName: "한국어", intlLocale: "ko-KR" },
    { code: "en", nativeName: "English", intlLocale: "en-US" },
    { code: "zh", nativeName: "中文", intlLocale: "zh-CN" },
    { code: "vi", nativeName: "Tiếng Việt", intlLocale: "vi-VN" },
    { code: "ja", nativeName: "日本語", intlLocale: "ja-JP" },
  ].map((locale) => Object.freeze(locale)),
);

export const messageCatalogs = Object.freeze({
  assistantMessages,
  commonMessages,
  accountMessages,
  featureMessages,
  mobileMessages,
  financeMessages,
  policyMessages,
});
export const messages = Object.freeze(
  Object.assign(
    Object.create(null),
    accountMessages,
    featureMessages,
    mobileMessages,
    financeMessages,
    policyMessages,
    commonMessages,
    assistantMessages,
  ),
);

/** Supported regional variants use the same UI catalog. Unsupported locales fall back to Korean. */
export function normalizeLocale(value) {
  if (typeof value !== "string") return "ko";
  const code = value.trim().toLowerCase().replaceAll("_", "-").split("-")[0];
  return locales.some((locale) => locale.code === code) ? code : "ko";
}

export function isSupportedLocale(value) {
  return (
    typeof value === "string" && locales.some((locale) => locale.code === value)
  );
}

/** Accept legacy raw codes and JSON browser storage; invalid values never override detection. */
export function parseStoredLocale(raw) {
  if (isSupportedLocale(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw);
    return isSupportedLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** Pick the first supported language from the user's ordered preferences. */
export function detectLocale(languages = []) {
  for (const language of Array.isArray(languages) ? languages : [languages]) {
    if (typeof language !== "string") continue;
    const code = language
      .trim()
      .toLowerCase()
      .replaceAll("_", "-")
      .split("-")[0];
    if (isSupportedLocale(code)) return code;
  }
  return "ko";
}

export function intlLocaleFor(locale) {
  return locales.find((item) => item.code === normalizeLocale(locale))
    .intlLocale;
}

/** Exact UI copy only: never rewrites API enums, user input, or policy data. */
export function translate(locale, source, values = {}) {
  if (typeof source !== "string") return source == null ? "" : String(source);
  const code = normalizeLocale(locale);
  const entry = Object.hasOwn(messages, source) ? messages[source] : undefined;
  const template =
    code === "ko"
      ? (entry?.ko ?? source)
      : (entry?.[code] ?? entry?.ko ?? source);
  return template.replace(
    /\{\{(\w+)\}\}|\{(\w+)\}/g,
    (match, doubleKey, singleKey) => {
      const key = doubleKey ?? singleKey;
      return Object.hasOwn(values, key) ? String(values[key]) : match;
    },
  );
}
