import type { ExpoConfig } from "expo/config";

const release = ["preview", "production"].includes(
  process.env.EAS_BUILD_PROFILE || "",
);
if (release) {
  const url = new URL(
    process.env.EXPO_PUBLIC_API_BASE_URL || "https://missing.invalid",
  );
  if (
    url.protocol !== "https:" ||
    url.hostname === "missing.invalid" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "배포 빌드에는 EXPO_PUBLIC_API_BASE_URL을 실제 HTTPS API 주소로 설정하세요.",
    );
  }
}
const config: ExpoConfig = {
  name: "복지나침반",
  slug: "bokji-compass-mobile",
  version: "0.1.0",
  scheme: "bokji-compass",
  orientation: "default",
  userInterfaceStyle: "light",
  icon: "./assets/brand-logo.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.bokjicompass.app",
    config: { usesNonExemptEncryption: false },
  },
  android: { package: "com.bokjicompass.app" },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/brand-logo.png",
  },
  plugins: ["expo-router", "expo-secure-store"],
};
export default config;
