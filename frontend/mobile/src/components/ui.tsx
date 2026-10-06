import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRuntime, useServerConnection } from "../services/runtime";
import { connectionMessage } from "../services/serverConnection";
import { useAssistant } from "../features/assistant/context";

export const colors = {
  ink: "#16332D",
  muted: "#50665D",
  green: "#047857",
  mint: "#D1FAE5",
  paper: "#F5F8F6",
  line: "#D4E2DB",
  danger: "#A12622",
};
export function Copy({
  children,
  title = false,
  muted = false,
  numberOfLines,
}: React.PropsWithChildren<{
  title?: boolean;
  muted?: boolean;
  numberOfLines?: number;
}>) {
  const { easy } = useRuntime();
  return (
    <Text
      numberOfLines={numberOfLines}
      accessibilityRole={title ? "header" : undefined}
      style={{
        color: muted ? colors.muted : colors.ink,
        fontSize: title ? 24 : easy ? 19 : 16,
        lineHeight: title ? (easy ? 32 : 38) : easy ? 28 : 25,
        fontWeight: title ? "700" : "400",
      }}
    >
      {children}
    </Text>
  );
}
export function Screen({ children }: React.PropsWithChildren) {
  const { easy } = useRuntime();
  const { enabled } = useAssistant();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.paper }}
    >
      <EasyModeBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.page,
            easy && { padding: 16, gap: 14, paddingBottom: 28 },
            enabled && { paddingBottom: 124 },
          ]}
        >
          <ServerConnectionNotice />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function ServerConnectionNotice() {
  const { connection, configError, easy } = useRuntime();
  const { status, reason, checking } = useServerConnection();
  if (configError || status !== "unavailable") return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.connectionNotice}>
      <Text accessibilityRole="header" style={{ color: colors.danger, fontSize: easy ? 21 : 18, fontWeight: "700" }}>
        서버 연결이 원활하지 않아요
      </Text>
      <Copy>{connectionMessage(reason)}</Copy>
      <Copy muted>공고 조회·로그인·계산·저장은 연결이 복구된 뒤 다시 시도해 주세요.</Copy>
      <Button secondary label={checking ? "연결 확인 중…" : "다시 연결"} busy={checking}
        onPress={() => { void connection.check().catch(() => {}); }} />
    </View>
  );
}
function EasyModeBar() {
  const { easy, setEasy } = useRuntime();
  const { openMenu } = useAssistant();
  return (
    <View
      style={{
        backgroundColor: "#FFF",
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 680,
          alignSelf: "center",
          paddingHorizontal: 22,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Switch
          accessibilityLabel="쉬운 화면"
          value={easy}
          onValueChange={setEasy}
          trackColor={{ true: colors.green }}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.ink,
              fontSize: easy ? 20 : 17,
              fontWeight: "700",
            }}
          >
            쉬운 화면
          </Text>
          {!easy && (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              큰 글씨로 편하게 보기
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="전체 메뉴 열기"
          onPress={openMenu}
          style={{
            minWidth: 48,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
          }}
        >
          {[0, 1, 2].map((line) => (
            <View
              key={line}
              style={{
                width: 22,
                height: 2,
                borderRadius: 1,
                backgroundColor: colors.ink,
              }}
            />
          ))}
        </Pressable>
      </View>
    </View>
  );
}
export function Card({ children }: React.PropsWithChildren) {
  const { easy } = useRuntime();
  return (
    <View style={[styles.card, easy && { padding: 16, gap: 12 }]}>
      {children}
    </View>
  );
}
// Secondary information stays available without filling the first mobile screen.
export function Details({
  label,
  accessibilityLabel = label,
  children,
}: React.PropsWithChildren<{ label: string; accessibilityLabel?: string }>) {
  const { easy } = useRuntime();
  const [open, setOpen] = useState(false);
  if (!easy) return <>{children}</>;
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: 48,
          paddingVertical: 10,
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 19,
            lineHeight: 28,
            color: colors.green,
            fontWeight: "600",
            flex: 1,
          }}
        >
          {label}
        </Text>
        <Text
          importantForAccessibility="no"
          aria-hidden
          style={{ fontSize: 22, color: colors.green }}
        >
          {open ? "−" : "+"}
        </Text>
      </Pressable>
      {open && <View style={{ gap: 12 }}>{children}</View>}
    </View>
  );
}

export function ReadableText({
  text,
  label,
  title = false,
}: {
  text: string;
  label: string;
  title?: boolean;
}) {
  const { easy } = useRuntime();
  const [open, setOpen] = useState(false);
  const lengthy = easy && text.length > (title ? 60 : 100);
  return (
    <View style={{ gap: 6 }}>
      <Copy title={title} numberOfLines={lengthy && !open ? 3 : undefined}>
        {text}
      </Copy>
      {lengthy && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          accessibilityLabel={`${label} ${open ? "접기" : "전체 보기"}`}
          onPress={() => setOpen(!open)}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text
            style={{
              fontSize: 19,
              lineHeight: 28,
              color: colors.green,
              fontWeight: "600",
            }}
          >
            {open ? "접기 −" : "전체 보기 +"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
export function Button({
  label,
  onPress,
  disabled = false,
  secondary = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
}) {
  const { easy } = useRuntime();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? "#E8F2ED" : colors.green,
          opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {busy && <ActivityIndicator color={secondary ? colors.green : "#FFF"} />}
      <Text
        style={{
          color: secondary ? colors.ink : "#FFF",
          fontSize: easy ? 20 : 16,
          fontWeight: "700",
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { easy } = useRuntime();
  return (
    <View style={{ gap: 6 }}>
      <Copy>{label}</Copy>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, { fontSize: easy ? 20 : 17 }, props.style]}
      />
    </View>
  );
}
export function Notice({ children }: React.PropsWithChildren) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.notice}>
      <Copy>{children}</Copy>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 22,
    gap: 20,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  card: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: "#829D90",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#FFF",
    color: colors.ink,
  },
  notice: { backgroundColor: colors.mint, padding: 16, borderRadius: 14 },
  connectionNotice: { backgroundColor: "#FFF3E8", borderColor: "#E6B896", borderWidth: 1, padding: 16, borderRadius: 14, gap: 10 },
});
