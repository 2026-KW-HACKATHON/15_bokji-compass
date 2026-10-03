import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Modal, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Copy, Notice, colors } from "../../components/ui";
import { useRuntime, useSession } from "../../services/runtime";
import {
  notificationPlatform,
  type Permission,
} from "../../platform/notifications";
import {
  allowsNotification,
  defaultPreferences,
  notificationPolicyId,
  notificationTypes,
} from "./model";

type Preferences = { [Key in keyof typeof defaultPreferences]: boolean };
const Context = createContext({
  permission: null as Permission | null,
  preferences: null as Preferences | null,
  loading: false,
  saving: false,
  error: "",
  deliveryWarning: "",
  saved: false,
  retry: () => {},
  save: async (_key: keyof Preferences, _value: boolean) => {},
  requestPermission: async () => {},
  openSettings: async () => {},
});

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "알림 설정을 처리하지 못했어요. 다시 시도해 주세요.";

export function NotificationProvider({ children }: React.PropsWithChildren) {
  const { api, session, configError } = useRuntime();
  const auth = useSession();
  const token = auth.status === "signedIn" ? auth.token : null;
  const [permission, setPermission] = useState<Permission | null>(null);
  const [intro, setIntro] = useState(false);
  const [introBusy, setIntroBusy] = useState(false);
  const [introError, setIntroError] = useState("");
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loadedToken, setLoadedToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [deliveryWarning, setDeliveryWarning] = useState("");
  const [saved, setSaved] = useState(false);
  const visiblePreferences =
    loadedToken === token && token ? preferences : null;
  const latest = useRef({ token, preferences: visiblePreferences });
  useEffect(() => {
    latest.current = { token, preferences: visiblePreferences };
  }, [token, visiblePreferences]);
  const pending = useRef<Record<string, unknown> | null>(null);
  const current = (value: string) => {
    const state = session.getSnapshot();
    return state.status === "signedIn" && state.token === value;
  };

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      notificationPlatform.readIntro(),
      notificationPlatform.readPermission(),
    ])
      .then(([seen, value]) => {
        if (disposed) return;
        setPermission(value);
        setIntro(!seen && value.supported && !value.granted);
      })
      .catch(() => {
        if (!disposed)
          setError(
            "알림 기능을 열지 못했어요. 새 버전의 앱으로 다시 설치한 뒤 확인해 주세요.",
          );
      });
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && !savingRef.current)
        setRevision((value) => value + 1);
    });
    return () => {
      disposed = true;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (disposed) return;
      setSaved(false);
      setDeliveryWarning("");
      if (!token || configError) {
        setPreferences(null);
        setLoadedToken(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const value = (await api.notifications.read(
          token,
          controller.signal,
        )) as Preferences;
        if (disposed || !current(token)) return;
        setPreferences(value);
        setLoadedToken(token);
        setLoading(false);
        try {
          const access = await notificationPlatform.readPermission();
          if (disposed || !current(token)) return;
          setPermission(access);
          if (!access.supported) return;
          if (!access.granted || !value.enabled) {
            await api.notifications.disable(token);
          } else {
            // Ensure category channels exist even when permission was already granted.
            await notificationPlatform.requestPermission();
            const pushToken = await notificationPlatform.getPushToken();
            if (disposed || !current(token)) return;
            await api.notifications.register(
              token,
              pushToken,
              notificationPlatform.platform,
            );
          }
        } catch (failure) {
          if (!disposed && current(token)) setDeliveryWarning(message(failure));
        }
      } catch (failure) {
        if (!disposed && current(token)) setError(message(failure));
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
    };
    // A foreground transition reloads settings changed on another device and OS permissions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token, configError, revision]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const open = (data: Record<string, unknown>) => {
      const active = latest.current;
      if (!active.token || !active.preferences) {
        pending.current = data;
        return;
      }
      if (!allowsNotification(active.preferences, data)) return;
      const id = notificationPolicyId(data);
      if (id) router.push({ pathname: "/policies/[id]", params: { id } });
    };
    void notificationPlatform
      .listen(
        (data) =>
          !!latest.current.token &&
          allowsNotification(latest.current.preferences, data),
        open,
      )
      .then((remove) => {
        if (disposed) remove();
        else cleanup = remove;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!token || !visiblePreferences || !pending.current) return;
    const data = pending.current;
    pending.current = null;
    const id = notificationPolicyId(data);
    if (id && allowsNotification(visiblePreferences, data))
      router.push({ pathname: "/policies/[id]", params: { id } });
  }, [token, visiblePreferences]);

  async function requestPermission() {
    try {
      const access = await notificationPlatform.requestPermission();
      setPermission(access);
      if (!access.granted)
        setError(
          "기기에서 알림을 허용해 주세요. 권한을 거절했다면 기기 알림 설정에서 켤 수 있어요.",
        );
      setRevision((value) => value + 1);
    } catch {
      setError(
        "알림 권한을 확인하지 못했어요. 앱을 다시 설치한 뒤 확인해 주세요.",
      );
    }
  }

  async function save(key: keyof Preferences, value: boolean) {
    if (!token || !visiblePreferences || savingRef.current || loading) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setSaved(false);
    setDeliveryWarning("");
    const next = { ...visiblePreferences, [key]: value };
    try {
      if (key === "enabled" && value && notificationPlatform.supported) {
        const access = await notificationPlatform.requestPermission();
        if (!current(token)) return;
        setPermission(access);
        if (!access.granted) {
          setError(
            "기기에서 알림을 허용해 주세요. 권한을 거절했다면 기기 알림 설정에서 켤 수 있어요.",
          );
          return;
        }
      }
      if (!current(token)) return;
      const result = (await api.notifications.save(token, next)) as Preferences;
      if (!current(token)) return;
      setPreferences(result);
      setLoadedToken(token);
      setSaved(true);
      // Preference persistence succeeded; enrollment failures must not look like save failures.
      try {
        if (notificationPlatform.supported) {
          const access = await notificationPlatform.readPermission();
          if (!current(token)) return;
          setPermission(access);
          if (!result.enabled || !access.granted)
            await api.notifications.disable(token);
          else {
            const pushToken = await notificationPlatform.getPushToken();
            if (current(token))
              await api.notifications.register(
                token,
                pushToken,
                notificationPlatform.platform,
              );
          }
        }
      } catch (failure) {
        if (current(token)) setDeliveryWarning(message(failure));
      }
    } catch (failure) {
      if (current(token)) setError(message(failure));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function dismissIntro() {
    await notificationPlatform.writeIntro();
    setIntro(false);
  }
  async function handleIntro(allow: boolean) {
    if (introBusy) return;
    setIntroBusy(true);
    setIntroError("");
    try {
      if (allow) {
        const access = await notificationPlatform.requestPermission();
        setPermission(access);
      }
      await dismissIntro();
      if (allow) router.navigate("/account");
    } catch {
      setIntroError(
        "알림 권한을 확인하지 못했어요. 다시 시도하거나 나중에 설정해 주세요.",
      );
    } finally {
      setIntroBusy(false);
    }
  }

  return (
    <Context.Provider
      value={{
        permission,
        preferences: visiblePreferences,
        loading,
        saving,
        error,
        deliveryWarning,
        saved,
        retry: () => setRevision((value) => value + 1),
        save,
        requestPermission,
        openSettings: async () => {
          try {
            await notificationPlatform.openSettings();
          } catch {
            setError(
              "기기 설정을 열지 못했어요. 휴대전화 설정에서 복지나침반 알림을 확인해 주세요.",
            );
          }
        },
      }}
    >
      {children}
      <Modal
        visible={intro}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!introBusy) void handleIntro(false);
        }}
      >
        <View style={styles.backdrop}>
          <SafeAreaView
            style={{ width: "100%", maxWidth: 460, maxHeight: "100%" }}
          >
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={styles.dialog} accessibilityViewIsModal>
                <Copy title>필요한 공고 소식을 알려드릴까요?</Copy>
                <Copy>다음 소식을 알림으로 받을 수 있어요.</Copy>
                {notificationTypes.map((type) => (
                  <Copy key={type.key}>• {type.title}</Copy>
                ))}
                <Copy muted>
                  알림은 선택사항이에요. 로그인 후 내 계정에서 전체 수신을 켜고,
                  받고 싶은 알림을 고를 수 있어요.
                </Copy>
                {introError ? <Notice>{introError}</Notice> : null}
                <Button
                  label="알림 허용하기"
                  busy={introBusy}
                  onPress={() => void handleIntro(true)}
                />
                <Button
                  label="나중에 설정"
                  secondary
                  disabled={introBusy}
                  onPress={() => void handleIntro(false)}
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </Context.Provider>
  );
}

export const useNotifications = () => useContext(Context);
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(12,35,28,0.55)",
  },
  dialog: {
    gap: 16,
    padding: 22,
    borderRadius: 24,
    backgroundColor: colors.paper,
  },
});
