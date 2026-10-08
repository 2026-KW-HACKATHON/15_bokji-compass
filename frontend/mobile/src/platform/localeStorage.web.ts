import { localeStorageKey } from "../../../packages/core/src/i18n/index.js";

// Language is a non-sensitive preference; authentication stays in memory.
export const localeStorage = {
  async read() {
    return typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(localeStorageKey);
  },
  async write(locale: string) {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(localeStorageKey, JSON.stringify(locale));
  },
};
