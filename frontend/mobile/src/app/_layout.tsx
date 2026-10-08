import { Tabs } from "expo-router/js-tabs";
import { ColorValue, View, useWindowDimensions } from "react-native";
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

export default function Layout() {
  return (
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
  );
}

function Navigation() {
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
        tabBarLabelStyle: {
          fontSize: easy ? 15 : 12,
          fontWeight: "600",
          marginTop: 3,
        },
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
          title: "홈",
          tabBarIcon: ({ color, focused }) => tabIcon("home", color, focused),
        }}
      />
      <Tabs.Screen
        name="policies"
        options={{
          title: "공고",
          tabBarIcon: ({ color, focused }) =>
            tabIcon("policies", color, focused),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: "계산기",
          tabBarIcon: ({ color, focused }) =>
            tabIcon("finance", color, focused),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: "AI 비서",
          tabBarIcon: ({ color, focused }) => tabIcon("ai", color, focused),
        }}
      />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen
        name="account"
        options={{
          title: "내 계정",
          tabBarIcon: ({ color, focused }) =>
            tabIcon("account", color, focused),
        }}
      />
    </Tabs>
  );
}
