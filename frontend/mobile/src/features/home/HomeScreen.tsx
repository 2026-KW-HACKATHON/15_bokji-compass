import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Button,
  Copy,
  Field,
  Notice,
  Screen,
  colors,
} from "../../components/ui";
import { Icon, IconName } from "../../components/Icon";
import { useRuntime } from "../../services/runtime";
import { parsePolicyPage } from "../policies/model";
import { PolicyCard, policyAppearance } from "../policies/PolicyCard";

const topics: { label: string; category: string; icon: IconName }[] = [
  { label: "생활 지원", category: "생활·금융", icon: "wallet" },
  { label: "주거", category: "주거", icon: "home" },
  { label: "일자리", category: "일자리", icon: "work" },
  { label: "교육", category: "교육", icon: "education" },
  { label: "건강·돌봄", category: "건강·돌봄", icon: "health" },
  { label: "전체 보기", category: "전체", icon: "compass" },
];

export default function HomeScreen() {
  const { api, easy, configError } = useRuntime();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<ReturnType<typeof parsePolicyPage> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (configError) return;
    api
      .listPolicies({ limit: 3, sort: "popular" }, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) { setPage(value); setError(""); }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [api, configError, retry]);
  const search = (category = "전체") =>
    router.navigate({
      pathname: "/policies",
      params: { q: query.trim(), category, searchKey: String(Date.now()) },
    });
  return (
    <Screen>
      <View style={{ gap: 8, paddingVertical: 8 }}>
        <Text style={styles.eyebrow}>생활에 보탬이 되는 정보</Text>
        <Text
          accessibilityRole="header"
          style={[styles.heading, easy && { fontSize: 27, lineHeight: 38 }]}
        >
          {easy
            ? "어떤 도움이 필요하세요?"
            : "나에게 필요한 지원,\n여기서 찾아보세요"}
        </Text>
      </View>
      <View style={[styles.search, easy && styles.easyBox]}>
        <View style={styles.searchHeading}>
          <Icon name="search" color={colors.green} />
          <Text style={[styles.sectionTitle, easy && { fontSize: 22 }]}>
            복지 공고 찾기
          </Text>
        </View>
        <Field
          label="궁금한 지원을 적어 주세요"
          value={query}
          onChangeText={setQuery}
          placeholder="예: 청년 주거 지원"
          returnKeyType="search"
          maxLength={200}
          onSubmitEditing={() => search()}
        />
        <Button label="지원 찾아보기" onPress={() => search()} />
      </View>
      <View style={[styles.topics, easy && { gap: 12 }]}>
        {topics.map((topic) => {
          const tone = policyAppearance(topic.category);
          return (
            <Pressable
              key={topic.category}
              accessibilityRole="button"
              accessibilityLabel={`${topic.label} 공고 찾기`}
              onPress={() => search(topic.category)}
              style={({ pressed }) => [
                styles.topic,
                easy && styles.easyTopic,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View
                style={[styles.topicIcon, { backgroundColor: tone.background }]}
              >
                <Icon name={topic.icon} color={tone.color} size={25} />
              </View>
              <Text style={[styles.topicLabel, easy && { fontSize: 18 }]}>
                {topic.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="중위소득 빠르게 확인하기"
        onPress={() => router.navigate("/finance")}
        style={({ pressed }) => [
          styles.calculator,
          easy && styles.easyCalculator,
          { opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.calcEyebrow, easy && { color: colors.muted }]}>
            2026년 기준 중위소득
          </Text>
          <Text style={[styles.calcTitle, easy && { color: colors.ink }]}>
            {"우리 집 기준은\n얼마일까요?"}
          </Text>
          <Text style={[styles.calcAction, easy && { color: colors.green }]}>
            가구원 수로 바로 확인
          </Text>
        </View>
        <View style={styles.calcIcon}>
          <Icon name="finance" size={42} color={easy ? colors.green : "#FFF"} />
        </View>
        <Icon name="next" size={20} color={easy ? colors.green : "#FFF"} />
      </Pressable>
      <View style={styles.sectionRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, easy && { fontSize: 23 }]}
          >
            많이 찾는 공고
          </Text>
          <Text style={styles.caption}>지원 내용을 비교해 보세요</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate("/policies")}
          style={styles.more}
        >
          <Text style={[styles.moreText, easy && { fontSize: 18 }]}>
            전체 보기
          </Text>
          <Icon name="next" size={18} color={colors.green} />
        </Pressable>
      </View>
      {configError || error ? (
        <View style={{ gap: 12 }}>
          <Notice>{configError || error}</Notice>
          <Button
            secondary
            label="공고 다시 불러오기"
            onPress={() => setRetry(retry + 1)}
          />
        </View>
      ) : !page ? (
        <Notice>공고를 불러오고 있어요.</Notice>
      ) : !page.items.length ? (
        <Notice>현재 공개된 공고가 없어요. 다른 분야를 살펴보세요.</Notice>
      ) : (
        page.items.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} />
        ))
      )}
      <Copy muted>신청 전에는 공식 공고에서 조건과 기간을 확인해 주세요.</Copy>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 21,
  },
  heading: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 41,
    letterSpacing: -0.8,
    fontWeight: "800",
  },
  search: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 24,
    gap: 14,
  },
  easyBox: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.easyLine,
    padding: 18,
  },
  searchHeading: { flexDirection: "row", gap: 10, alignItems: "center" },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 30,
    fontWeight: "700",
  },
  topics: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 4,
  },
  topic: {
    width: "30%",
    alignItems: "center",
    gap: 9,
    paddingVertical: 7,
    minHeight: 86,
  },
  easyTopic: {
    width: "47%",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.easyLine,
    borderRadius: 8,
    padding: 12,
  },
  topicIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  topicLabel: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 23,
    fontWeight: "600",
    textAlign: "center",
  },
  calculator: {
    backgroundColor: colors.green,
    borderRadius: 24,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 5,
  },
  easyCalculator: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.easyLine,
    borderRadius: 10,
  },
  calcEyebrow: {
    color: "#DEE8FF",
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "500",
  },
  calcTitle: { color: "#FFF", fontSize: 23, lineHeight: 32, fontWeight: "700" },
  calcAction: {
    color: "#FFF",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
    fontWeight: "600",
  },
  calcIcon: {
    width: 64,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  caption: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  more: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  moreText: { color: colors.green, fontSize: 14, fontWeight: "600" },
});
