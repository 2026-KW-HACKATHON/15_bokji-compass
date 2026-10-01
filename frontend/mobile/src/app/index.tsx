import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Button,
  Copy,
  Details,
  Notice,
  Screen,
  colors,
} from "../components/ui";
import { HomeBanner } from "../features/home/HomeBanner";
import { useRuntime } from "../services/runtime";

export default function Home() {
  const { api, configError, easy } = useRuntime();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      await api.health();
      setMessage("서버에 연결됐습니다.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={styles.heading}>
        {!easy && (
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandSymbol}>✳</Text>
            </View>
            <Text style={styles.brand}>복지나침반</Text>
            <Text style={styles.brandNote}>당신의 일상 곁에</Text>
          </View>
        )}
        <Text
          accessibilityRole="header"
          style={[styles.title, easy && styles.easyTitle]}
        >
          {easy ? "무엇을 도와드릴까요?" : "오늘보다 든든한 내일"}
        </Text>
        {!easy && (
          <Text style={styles.subtitle}>
            나에게 필요한 복지, 여기서 시작해요.
          </Text>
        )}
      </View>
      {configError ? <Notice>{configError}</Notice> : null}
      <HomeBanner />
      <View style={styles.shortcuts}>
        {!easy && (
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              자주 찾는 서비스
            </Text>
            <Text style={styles.sectionNote}>로그인 없이도 간편하게</Text>
          </View>
        )}
        <Shortcut
          symbol="▤"
          color="#E6F3EC"
          title="공고 찾아보기"
          description={
            easy
              ? "받을 수 있는 지원 찾기"
              : "지원 내용부터 신청 기간까지 한눈에"
          }
          onPress={() => router.navigate("/policies")}
        />
        <Shortcut
          symbol="₩"
          color="#FAF0D8"
          title="중위소득 계산기"
          label="중위소득 계산하기"
          description={
            easy
              ? "우리 집 소득 비율 확인"
              : "우리 집 소득 비율과 재산 알아보기"
          }
          onPress={() => router.navigate("/finance")}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="내 계정으로 이동"
        onPress={() => router.navigate("/account")}
        style={({ pressed }) => [
          styles.account,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={styles.accountSymbol} aria-hidden>
          ◎
        </Text>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.accountTitle, easy && { fontSize: 19 }]}>
            내 계정
          </Text>
          {!easy && (
            <Text style={styles.subtitle}>
              저장한 정보를 이어서 확인하세요.
            </Text>
          )}
        </View>
        <Text style={styles.chevron} aria-hidden>
          ›
        </Text>
      </Pressable>
      <Details label="연결 도움말">
        <Button
          secondary
          label="서버 연결 확인"
          disabled={!!configError}
          busy={busy}
          onPress={() => void check()}
        />
        {message ? <Notice>{message}</Notice> : null}
      </Details>
      {!easy && (
        <View style={styles.footer}>
          <Copy muted>필요한 순간, 복지나침반</Copy>
        </View>
      )}
    </Screen>
  );
}

function Shortcut({
  symbol,
  color,
  title,
  label = title,
  description,
  onPress,
}: {
  symbol: string;
  color: string;
  title: string;
  label?: string;
  description: string;
  onPress: () => void;
}) {
  const { easy } = useRuntime();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcut,
        { opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: color }]} aria-hidden>
        <Text style={styles.iconText}>{symbol}</Text>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text
          style={[
            styles.shortcutTitle,
            easy && { fontSize: 20, lineHeight: 28 },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.shortcutDescription,
            easy && { fontSize: 17, lineHeight: 24 },
          ]}
        >
          {description}
        </Text>
      </View>
      <Text style={styles.chevron} aria-hidden>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 8 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  brandMark: {
    width: 28,
    height: 28,
    backgroundColor: colors.green,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  brandSymbol: { color: "#FFF", fontSize: 23, lineHeight: 28 },
  brand: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  brandNote: { color: colors.muted, fontSize: 12, marginLeft: "auto" },
  title: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "700",
    lineHeight: 36,
    letterSpacing: -1,
  },
  easyTitle: { fontSize: 24, lineHeight: 32 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  shortcuts: { gap: 10 },
  sectionHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  sectionNote: { color: colors.muted, fontSize: 11 },
  shortcut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E3EBE5",
  },
  icon: {
    width: 44,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { fontSize: 25, color: colors.green, fontWeight: "600" },
  shortcutTitle: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  shortcutDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: -0.3,
  },
  chevron: { color: colors.muted, fontSize: 25 },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 56,
  },
  accountSymbol: {
    color: colors.green,
    fontSize: 28,
    width: 44,
    textAlign: "center",
  },
  accountTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  footer: { alignItems: "center", paddingVertical: 12, opacity: 0.8 },
});
