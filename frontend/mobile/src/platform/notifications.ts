import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { notificationTypes } from "../features/notifications/model";

export type Permission = {
  granted: boolean;
  canAskAgain: boolean;
  supported: boolean;
};
const introKey = "bokji.mobile.notifications.intro.v1";
const getModule = () => import("expo-notifications");

async function readPermission(): Promise<Permission> {
  const notifications = await getModule();
  const value = await notifications.getPermissionsAsync();
  return {
    granted:
      value.granted ||
      value.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL,
    canAskAgain: value.canAskAgain,
    supported: true,
  };
}

export const notificationPlatform = {
  supported: true,
  platform: Platform.OS as "android" | "ios",
  readPermission,
  async requestPermission(): Promise<Permission> {
    const notifications = await getModule();
    // Android 13 requires a channel before displaying the notification prompt.
    if (Platform.OS === "android") {
      for (const type of notificationTypes) {
        await notifications.setNotificationChannelAsync(type.key, {
          name: type.title,
          importance: notifications.AndroidImportance.DEFAULT,
        });
      }
    }
    const current = await readPermission();
    if (!current.granted && current.canAskAgain) {
      await notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
    }
    return readPermission();
  },
  async getPushToken(): Promise<string> {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId)
      throw new Error(
        "푸시 서비스 연결을 준비 중이에요. 알림 권한과 수신 설정은 저장할 수 있어요.",
      );
    const notifications = await getModule();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        notifications.getExpoPushTokenAsync({ projectId }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "알림 기기를 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.",
                ),
              ),
            15000,
          );
        }),
      ]);
      return value.data;
    } finally {
      clearTimeout(timer);
    }
  },
  readIntro: async () => (await SecureStore.getItemAsync(introKey)) === "seen",
  writeIntro: async () => SecureStore.setItemAsync(introKey, "seen"),
  openSettings: () => Linking.openSettings(),
  async listen(
    allowed: (data: Record<string, unknown>) => boolean,
    open: (data: Record<string, unknown>) => void,
  ) {
    const notifications = await getModule();
    notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const show = allowed(notification.request.content.data ?? {});
        return {
          shouldShowBanner: show,
          shouldShowList: show,
          shouldPlaySound: show,
          shouldSetBadge: false,
        };
      },
    });
    const listener = notifications.addNotificationResponseReceivedListener(
      (response) => {
        open(response.notification.request.content.data ?? {});
        void notifications.clearLastNotificationResponseAsync();
      },
    );
    const initial = notifications.getLastNotificationResponse();
    if (initial) {
      open(initial.notification.request.content.data ?? {});
      void notifications.clearLastNotificationResponseAsync();
    }
    return () => {
      listener.remove();
      notifications.setNotificationHandler(null);
    };
  },
};
