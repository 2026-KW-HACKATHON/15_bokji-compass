import * as SecureStore from "expo-secure-store";

const key = "bokji.mobile.session.v1";
export const sessionStorage = {
  async read() {
    const value = await SecureStore.getItemAsync(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      await SecureStore.deleteItemAsync(key);
      return null;
    }
  },
  async write(value: unknown) {
    await SecureStore.setItemAsync(key, JSON.stringify(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async clear() {
    await SecureStore.deleteItemAsync(key);
  },
};
