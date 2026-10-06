import type { ExpoConfig } from "expo/config";

const release =
  process.env.BOKJI_RELEASE === "1" ||
  ["preview", "production"].includes(process.env.EAS_BUILD_PROFILE || "");
if (release) {
  const url = new URL(
    process.env.EXPO_PUBLIC_API_BASE_URL || "https://missing.invalid",
  );
  if (
    url.protocol !== "https:" ||
    url.hostname === "missing.invalid" ||
    /(^localhost$|\.invalid$|\.test$|\.example$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|:)/i.test(
      url.hostname,
    ) ||
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
    infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: false } },
  },
  android: {
    package: "com.bokjicompass.app",
    allowBackup: false,
    permissions: ["android.permission.POST_NOTIFICATIONS"],
    ...(process.env.BOKJI_GOOGLE_SERVICES_FILE
      ? { googleServicesFile: process.env.BOKJI_GOOGLE_SERVICES_FILE }
      : {}),
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
      "android.permission.CHANGE_WIFI_MULTICAST_STATE",
      "android.permission.VIBRATE",
      // The app does not read install attribution or manage launcher badges.
      "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE",
      "com.sec.android.provider.badge.permission.READ",
      "com.sec.android.provider.badge.permission.WRITE",
      "com.htc.launcher.permission.READ_SETTINGS",
      "com.htc.launcher.permission.UPDATE_SHORTCUT",
      "com.sonyericsson.home.permission.BROADCAST_BADGE",
      "com.sonymobile.home.permission.PROVIDER_INSERT_BADGE",
      "com.anddoes.launcher.permission.UPDATE_COUNT",
      "com.majeur.launcher.permission.UPDATE_BADGE",
      "com.huawei.android.launcher.permission.CHANGE_BADGE",
      "com.huawei.android.launcher.permission.READ_SETTINGS",
      "com.huawei.android.launcher.permission.WRITE_SETTINGS",
      "android.permission.READ_APP_BADGE",
      "com.oppo.launcher.permission.READ_SETTINGS",
      "com.oppo.launcher.permission.WRITE_SETTINGS",
      "me.everything.badger.permission.BADGE_COUNT_READ",
      "me.everything.badger.permission.BADGE_COUNT_WRITE",
    ],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/brand-logo.png",
  },
  plugins: [
    "expo-router",
    ["expo-notifications", { color: "#047857" }],
    [
      "expo-secure-store",
      { configureAndroidBackup: false, faceIDPermission: false },
    ],
    "./plugins/with-security.cjs",
  ],
  ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    ? { extra: { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } } }
    : {}),
};
export default config;
