import {
  detectLocale,
  normalizeLocale,
  parseStoredLocale,
  translate,
} from "../../../packages/core/src/i18n/index.js";

/** Known UI copy only. Unknown text (including server and user content) is preserved. */
export function translateUi(locale, source, values = {}) {
  if (typeof source !== "string") return source;
  const direct = translate(locale, source, values);
  if (direct !== source || normalizeLocale(locale) === "ko") return direct;
  const compact = source.replace(/\s+/g, " ").trim();
  const translated = translate(locale, compact, values);
  return translated === compact ? source : translated;
}

export function initialLocale(languages = []) {
  return detectLocale(languages);
}

/** Prevent a slow storage read from replacing an explicit selection. */
export function createLocalePreference(storage, languages = []) {
  let locale = initialLocale(languages);
  let revision = 0;
  let storageError = false;
  let writes = Promise.resolve();
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => locale,
    getStorageError: () => storageError,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore() {
      const currentRevision = revision;
      try {
        const saved = parseStoredLocale(await storage.read());
        if (saved && revision === currentRevision) {
          locale = saved;
          emit();
        }
      } catch {
        if (revision === currentRevision) {
          storageError = true;
          emit();
        }
      }
    },
    setLocale(next) {
      revision += 1;
      locale = normalizeLocale(next);
      emit();
      const selected = locale;
      const selectedRevision = revision;
      // Serialize writes so rapidly switching languages persists the last choice.
      writes = writes
        .catch(() => {})
        .then(() => storage.write(selected))
        .then(() => {
          if (revision === selectedRevision) {
            storageError = false;
            emit();
          }
        })
        .catch(() => {
          if (revision === selectedRevision) {
            storageError = true;
            emit();
          }
        });
      return writes;
    },
  };
}
