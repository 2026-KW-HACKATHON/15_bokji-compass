import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";

const key = "bokji.mobile.kakao.pending.v1";
export const kakaoPlatform = {
  browser: (url: string, callback: string) =>
    WebBrowser.openAuthSessionAsync(url, callback),
  async proof() {
    const bytes = await Crypto.getRandomBytesAsync(32);
    const verifier = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 },
    );
    return {
      verifier,
      challenge: hash
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, ""),
    };
  },
  storage: {
    async read() {
      const value = await SecureStore.getItemAsync(key);
      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    },
    write: (value: unknown) =>
      SecureStore.setItemAsync(key, JSON.stringify(value), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    clear: () => SecureStore.deleteItemAsync(key),
  },
};
