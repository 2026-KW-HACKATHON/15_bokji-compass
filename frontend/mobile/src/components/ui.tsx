import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRuntime, useServerConnection } from "../services/runtime";
import { connectionMessage } from "../services/serverConnection";
import { useAssistant } from "../features/assistant/context";
import { Icon } from "./Icon";
import { colors, typography } from "./theme";
import { LocalizedText as Text } from "../i18n/LocalizedText";
import { useI18n } from "../i18n/context";
import {
  LanguageSelector,
  OriginalContentNotice,
} from "../i18n/LanguageSelector";

export { colors } from "./theme";
const ScreenScroll = createContext<React.RefObject<ScrollView | null> | null>(
  null,
);
export function useScreenStep(key: string | number) {
  const scroll = useContext(ScreenScroll);
  useEffect(() => {
    scroll?.current?.scrollTo({ y: 0, animated: false });
  }, [scroll, key]);
}
export function Copy({
  children,
  title = false,
  muted = false,
  numberOfLines,
  original = false,
}: React.PropsWithChildren<{
  title?: boolean;
  muted?: boolean;
  numberOfLines?: number;
  original?: boolean;
}>) {
  const { easy } = useRuntime();
  return (
    <Text
      original={original}
      numberOfLines={numberOfLines}
      accessibilityRole={title ? "header" : undefined}
      style={{
        color: muted ? colors.muted : colors.ink,
        ...(title
          ? easy
            ? typography.easyTitle
            : typography.title
          : easy
            ? typography.easyBody
            : typography.body),
      }}
    >
      {children}
    </Text>
  );
}
export function Screen({ children }: React.PropsWithChildren) {
  const { easy } = useRuntime();
  const scroll = useRef<ScrollView>(null);
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{
        flex: 1,
        backgroundColor: easy ? colors.easyPaper : colors.paper,
      }}
    >
      <EasyModeBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.page,
            easy && { padding: 16, gap: 24, paddingBottom: 120 },
          ]}
        >
          <ScreenScroll.Provider value={scroll}>
            <ServerConnectionNotice />
            <OriginalContentNotice />
            {children}
          </ScreenScroll.Provider>
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
      <Text
        accessibilityRole="header"
        style={{
          color: colors.danger,
          fontSize: easy ? 21 : 18,
          fontWeight: "700",
        }}
      >
        서버 연결이 원활하지 않아요
      </Text>
      <Copy>{connectionMessage(reason)}</Copy>
      <Copy muted>
        공고 조회·로그인·계산·저장은 연결이 복구된 뒤 다시 시도해 주세요.
      </Copy>
      <Button
        secondary
        label={checking ? "연결 확인 중…" : "다시 연결"}
        busy={checking}
        onPress={() => {
          void connection.check().catch(() => {});
        }}
      />
    </View>
  );
}
function EasyModeBar() {
  const { t, locale } = useI18n();
  const { easy, setEasy } = useRuntime();
  const { openMenu } = useAssistant();
  const { width, fontScale } = useWindowDimensions();
  const stacked = easy || locale !== "ko" || width < 350 || fontScale > 1.2;
  return (
    <View
      style={{
        backgroundColor: easy ? "#FFF" : colors.paper,
        borderBottomWidth: easy ? 1 : 0,
        borderBottomColor: easy ? colors.easyLine : colors.line,
      }}
    >
      <View
        key={stacked ? "stacked-header" : "inline-header"}
        style={{
          width: "100%",
          maxWidth: 680,
          alignSelf: "center",
          paddingHorizontal: 20,
          paddingVertical: 4,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            flex: stacked ? 0 : 1,
            width: stacked ? "100%" : "auto",
            paddingVertical: stacked ? 6 : 0,
          }}
        >
          <Image
            source={require("../../assets/brand-logo.png")}
            style={{ width: 26, height: 26 }}
            resizeMode="contain"
            accessible={false}
          />
          <Text
            style={{
              fontSize: easy ? 18 : 16,
              fontWeight: "800",
              color: colors.ink,
            }}
          >
            복지나침반
          </Text>
        </View>
        <LanguageSelector compact />
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={t("쉬운 화면")}
          accessibilityState={{ checked: easy }}
          onPress={() => setEasy(!easy)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minHeight: easy ? 60 : 48,
            paddingHorizontal: 8,
            borderWidth: easy ? 1.5 : 0,
            borderColor: colors.green,
            borderRadius: 8,
            backgroundColor: easy ? colors.mint : "transparent",
            flexShrink: 1,
          }}
        >
          <Text style={{ fontSize: 14, color: colors.ink, fontWeight: "700" }}>
            쉬운 화면
          </Text>
          <ToggleMark value={easy} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("전체 메뉴 열기")}
          onPress={openMenu}
          style={{
            minWidth: easy ? 52 : 44,
            minHeight: easy ? 60 : 48,
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            borderRadius: easy ? 8 : 16,
            paddingHorizontal: 6,
            backgroundColor: easy ? colors.surface : colors.paper,
            borderWidth: easy ? 1 : 0,
            borderColor: colors.easyLine,
          }}
        >
          {easy ? (
            <Text
              style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}
            >
              메뉴
            </Text>
          ) : (
            <Icon name="menu" size={22} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
export function Card({ children }: React.PropsWithChildren) {
  const { easy } = useRuntime();
  return <View style={[styles.card, easy && styles.easyCard]}>{children}</View>;
}

function ToggleMark({ value }: { value: boolean }) {
  return (
    <View
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 48,
        height: 28,
        padding: 3,
        borderRadius: 16,
        backgroundColor: value ? colors.green : colors.easyLine,
        alignItems: value ? "flex-end" : "flex-start",
        flexShrink: 0,
      }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        {value && <Icon name="check" size={16} color={colors.green} />}
      </View>
    </View>
  );
}

// The label and control form one large target for touch and screen readers.
export function Toggle({ label, accessibilityLabel = label, value, onValueChange, disabled = false }: {
  label: string;
  accessibilityLabel?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { easy } = useRuntime();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={t(accessibilityLabel)}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={{ minHeight: easy ? 60 : 48, padding: 12, gap: 14, flexDirection: "row", alignItems: "center", borderWidth: easy ? 1.5 : 1, borderColor: value ? colors.green : easy ? colors.easyLine : colors.line, borderRadius: easy ? 8 : 14, backgroundColor: value ? colors.mint : colors.surface }}
    >
      <View style={{ flex: 1 }}><Copy>{label}</Copy></View>
      <ToggleMark value={value} />
    </Pressable>
  );
}
// Secondary information stays available without filling the first mobile screen.
export function Details({
  label,
  accessibilityLabel = label,
  children,
  collapsible = false,
}: React.PropsWithChildren<{
  label: string;
  accessibilityLabel?: string;
  collapsible?: boolean;
}>) {
  const { t } = useI18n();
  const { easy } = useRuntime();
  const [open, setOpen] = useState(false);
  if (!easy && !collapsible) return <>{children}</>;
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(accessibilityLabel)}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: easy ? 60 : 56,
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: easy ? colors.easyLine : colors.line,
          borderRadius: easy ? 8 : 14,
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: easy ? 19 : 15,
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
  const { t } = useI18n();
  const { easy } = useRuntime();
  const [open, setOpen] = useState(false);
  const lengthy = easy && text.length > (title ? 60 : 100);
  return (
    <View style={{ gap: 6 }}>
      <Copy
        original
        title={title}
        numberOfLines={lengthy && !open ? 3 : undefined}
      >
        {text}
      </Copy>
      {lengthy && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          accessibilityLabel={t("{label} {action}", {
            label: t(label),
            action: t(open ? "접기" : "전체 보기"),
          })}
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
  original = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
  original?: boolean;
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
          backgroundColor: secondary
            ? easy
              ? colors.surface
              : "#EEF2F4"
            : colors.green,
          opacity: pressed ? 0.8 : 1,
          ...(disabled || busy ? { backgroundColor: "#E2E7EF" } : {}),
        },
        easy && {
          minHeight: 60,
          borderRadius: 8,
          borderWidth: secondary ? 1.5 : 0,
          borderColor: colors.green,
        },
      ]}
    >
      {busy && <ActivityIndicator color={colors.muted} />}
      <Text
        original={original}
        style={{
          color: disabled || busy ? colors.muted : secondary ? colors.ink : "#FFF",
          fontSize: easy ? 20 : 16,
          lineHeight: easy ? 30 : 24,
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
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const { fontScale } = useWindowDimensions();
  return (
    <View style={{ gap: 6 }}>
      <Copy>{label}</Copy>
      <TextInput
        {...props}
        accessibilityLabel={t(props.accessibilityLabel ?? label)}
        placeholder={props.placeholder ? t(props.placeholder) : undefined}
        placeholderTextColor={colors.muted}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        selectionColor={colors.green}
        style={[
          styles.input,
          easy && styles.easyInput,
          { minHeight: Math.max(easy ? 64 : 56, (easy ? 30 : 26) * fontScale + 32) },
          focused && {
            borderColor: colors.green,
            backgroundColor: colors.surface,
            borderWidth: 3,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Notice({ children }: React.PropsWithChildren) {
  const { easy } = useRuntime();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        easy && {
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.easyLine,
        },
      ]}
    >
      <Copy>{children}</Copy>
    </View>
  );
}
export function PageHeading({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
}) {
  const { easy } = useRuntime();
  return (
    <View style={{ gap: easy ? 8 : 6, paddingVertical: easy ? 0 : 4 }}>
      {!easy && eyebrow && (
        <Text
          style={{
            color: colors.green,
            fontSize: 13,
            lineHeight: 20,
            fontWeight: "600",
          }}
        >
          {eyebrow}
        </Text>
      )}
      <Copy title>{title}</Copy>
      {description && <Copy muted>{description}</Copy>}
    </View>
  );
}

export function Choice({
  label,
  accessibilityLabel = label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { easy } = useRuntime();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={t(accessibilityLabel)}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          minHeight: easy ? 60 : 48,
          borderRadius: easy ? 8 : 14,
          borderWidth: easy ? 1.5 : 1,
          borderColor: selected
            ? colors.green
            : easy
              ? colors.easyLine
              : colors.line,
          backgroundColor: selected ? colors.mint : colors.surface,
          opacity: pressed ? 0.7 : 1,
          width: easy ? "100%" : undefined,
          justifyContent: easy ? "flex-start" : "center",
        },
      ]}
    >
      {easy ? (
        <View style={{ width: 26, height: 26, borderRadius: 14, borderWidth: 2, borderColor: selected ? colors.green : colors.easyLine, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {selected && <Icon name="check" size={18} color={colors.green} />}
        </View>
      ) : selected && <Icon name="check" size={18} color={colors.green} />}
      <Text
        style={{
          color: selected ? colors.green : colors.ink,
          fontSize: easy ? 20 : 16,
          lineHeight: easy ? 30 : 24,
          fontWeight: selected ? "700" : "500",
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 18,
    paddingBottom: 100,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 20,
    gap: 16,
  },
  easyCard: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.easyLine,
    padding: 16,
    gap: 20,
  },
  button: {
    minHeight: 54,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    fontSize: 17,
    lineHeight: 26,
    backgroundColor: "#F5F7FB",
    color: colors.ink,
  },
  easyInput: {
    minHeight: 62,
    borderRadius: 8,
    borderColor: colors.easyLine,
    backgroundColor: colors.surface,
    fontSize: 20,
    lineHeight: 30,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "100%",
  },
  notice: { backgroundColor: colors.mint, padding: 16, borderRadius: 16 },
  connectionNotice: {
    backgroundColor: "#FFF3E8",
    borderColor: "#E6B896",
    borderWidth: 1,
    padding: 16,
    borderRadius: 14,
    gap: 10,
  },
});
