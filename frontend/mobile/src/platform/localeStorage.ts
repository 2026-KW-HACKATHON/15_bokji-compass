import * as SecureStore from "expo-secure-store";
import { localeStorageKey } from "../../../packages/core/src/i18n/index.js";

export const localeStorage = {
  read: () => SecureStore.getItemAsync(localeStorageKey),
  write: (locale: string) => SecureStore.setItemAsync(localeStorageKey, locale),
};
