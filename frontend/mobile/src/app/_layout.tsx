import { Tabs } from "expo-router/js-tabs";
import { ColorValue, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RuntimeProvider, useRuntime } from "../services/runtime";
import { colors } from "../components/ui";
import { Icon, IconName } from "../components/Icon";
import { tabBarHeight } from "../components/theme";
import { AssistantProvider } from "../features/assistant/context";
import { AppShell } from "../features/assistant/AppShell";
import { NotificationProvider } from "../features/notifications/context";
import { AuthProvider } from "../features/auth/context";
import { I18nProvider, useI18n } from "../i18n/context";

export default function Layout() {
  return (
    <I18nProvider>
      <RuntimeProvider>
        <AuthProvider>
          <AssistantProvider>
            <NotificationProvider>
              <StatusBar style="dark" />
              <AppShell>
                <Navigation />
              </AppShell>
            </NotificationProvider>
          </AssistantProvider>
        </AuthProvider>
      </RuntimeProvider>
    </I18nProvider>
  );
}

function Navigation() {
  const { t } = useI18n();
  const { easy } = useRuntime();
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  function tabIcon(name: IconName, color: ColorValue, focused: boolean) {
    return (
      <View
        style={{
          minWidth: 44,
          height: 30,
          borderRadius: easy ? 6 : 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? colors.mint : "transparent",
          borderBottomWidth: focused ? 3 : 0,
          borderColor: colors.green,
        }}
      >
        <Icon name={name} size={23} color={color} />
      </View>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabel: ({ children, color, focused }) => (
          <Text
            allowFontScaling
            style={{
              color,
              fontSize: easy ? 18 : 12,
              lineHeight: easy ? 25 : 18,
              fontWeight: focused ? "800" : "600",
              textAlign: "center",
              alignSelf: "stretch",
              flexShrink: 1,
              marginTop: 3,
            }}
          >
            {children}
          </Text>
        ),
        tabBarLabelPosition: "below-icon",
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#FFF",
          height: tabBarHeight(easy, fontScale) + bottom,
          paddingTop: 9,
          paddingBottom: Math.max(bottom, 8),
          borderTopColor: easy ? colors.easyLine : colors.line,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("홈"),
          tabBarIcon: ({ color, focused }) => tabIcon("home", color, focused),
        }}
      />
      <Tabs.Screen
        name="policies"
        options={{
          title: t("공고"),
          tabBarIcon: ({ color, focused }) =>
            tabIcon("policies", color, focused),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: t("계산기"),
          tabBarIcon: ({ color, focused }) =>
            tabIcon("finance", color, focused),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t("AI 비서"),
          tabBarIcon: ({ color, focused }) => tabIcon("ai", color, focused),
        }}
      />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen
        name="account"
        options={{
          title: t("내 계정"),
          tabBarIcon: ({ color, focused }) =>
            tabIcon("account", color, focused),
        }}
      />
    </Tabs>
  );
}
