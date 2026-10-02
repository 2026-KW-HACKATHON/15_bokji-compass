import { Tabs } from "expo-router/js-tabs";
import { Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RuntimeProvider } from "../services/runtime";
import { colors } from "../components/ui";
import { AssistantProvider } from "../features/assistant/context";
import { AppShell } from "../features/assistant/AppShell";
import { NotificationProvider } from "../features/notifications/context";

export default function Layout() {
  const { bottom } = useSafeAreaInsets();
  return (
    <RuntimeProvider>
      <AssistantProvider>
        <NotificationProvider>
          <StatusBar style="dark" />
          <AppShell>
            <Tabs
              screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.green,
                tabBarInactiveTintColor: colors.muted,
                tabBarLabelStyle: { fontSize: 13 },
                tabBarStyle: {
                  backgroundColor: "#FFF",
                  height: 64 + bottom,
                  paddingTop: 6,
                  paddingBottom: Math.max(bottom, 8),
                },
              }}
            >
              <Tabs.Screen
                name="index"
                options={{
                  title: "홈",
                  tabBarIcon: ({ color }) => (
                    <Text style={{ color, fontSize: 23 }}>⌂</Text>
                  ),
                }}
              />
              <Tabs.Screen
                name="policies"
                options={{
                  title: "공고",
                  tabBarIcon: ({ color }) => (
                    <Text style={{ color, fontSize: 22 }}>▤</Text>
                  ),
                }}
              />
              <Tabs.Screen
                name="finance"
                options={{
                  title: "계산기",
                  tabBarIcon: ({ color }) => (
                    <Text style={{ color, fontSize: 22 }}>₩</Text>
                  ),
                }}
              />
              <Tabs.Screen
                name="account"
                options={{
                  title: "내 계정",
                  tabBarIcon: ({ color }) => (
                    <Text style={{ color, fontSize: 23 }}>◎</Text>
                  ),
                }}
              />
            </Tabs>
          </AppShell>
        </NotificationProvider>
      </AssistantProvider>
    </RuntimeProvider>
  );
}
