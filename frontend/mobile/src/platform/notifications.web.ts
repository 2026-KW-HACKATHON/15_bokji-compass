import type { Permission } from "./notifications";

const permission: Permission = {
  granted: false,
  canAskAgain: false,
  supported: false,
};
export const notificationPlatform = {
  supported: false,
  platform: "android" as "android" | "ios",
  readPermission: async () => permission,
  requestPermission: async () => permission,
  getPushToken: async (): Promise<string> => {
    throw new Error("안드로이드 앱에서 이용해 주세요.");
  },
  readIntro: async () => true,
  writeIntro: async () => {},
  openSettings: async () => {},
  listen:
    async (
      _allowed: (data: Record<string, unknown>) => boolean,
      _open: (data: Record<string, unknown>) => void,
    ) =>
    () => {},
};
