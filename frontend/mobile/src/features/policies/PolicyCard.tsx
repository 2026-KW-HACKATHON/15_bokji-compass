import { useI18n } from "../../i18n/context";
import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Icon, IconName } from "../../components/Icon";
import { colors } from "../../components/theme";
import { useRuntime } from "../../services/runtime";
import { parsePolicy } from "./model";
import { Details, Copy } from "../../components/ui";
import {
  PolicyTranslationControls,
  usePolicyTranslation,
} from "./usePolicyTranslation";

export const categoryAppearance: Record<
  string,
  { icon: IconName; color: string; background: string }
> = {
  "생활·금융": { icon: "wallet", color: "#245FE5", background: "#EBF1FF" },
  주거: { icon: "home", color: "#8161B8", background: "#F1ECFA" },
  일자리: { icon: "work", color: "#A16623", background: "#FFF3E0" },
  교육: { icon: "education", color: "#167F6E", background: "#E7F5EE" },
  "건강·돌봄": { icon: "health", color: "#B34E6B", background: "#FCEFF3" },
};
export function policyAppearance(category: string) {
  return (
    categoryAppearance[category] ?? {
      icon: "policies" as IconName,
      color: colors.green,
      background: colors.mint,
    }
  );
}

export function PolicyCard({
  policy,
  showReason = false,
}: {
  policy: ReturnType<typeof parsePolicy>;
  showReason?: boolean;
}) {
  const { t } = useI18n();
  const { easy } = useRuntime();
  const translation = usePolicyTranslation(policy);
  const display = translation.display || policy;
  const tone = policyAppearance(policy.category);
  const open = () =>
    router.push({ pathname: "/policies/[id]", params: { id: policy.id } });
  return (
    <View style={[styles.card, easy && styles.easyCard]}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: tone.background }]}>
          <Icon name={tone.icon} size={16} color={tone.color} />
          <Text
            style={[
              styles.badgeText,
              { color: tone.color },
              easy && { fontSize: 17 },
            ]}
          >
            {policy.category}
          </Text>
        </View>
        <Text style={[styles.region, easy && { fontSize: 16 }]}>
          {policy.region}
        </Text>
      </View>
      <PolicyTranslationControls state={translation} compact />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("{title} 자세히 보기", { title: display.title })}
        onPress={open}
        style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.65 : 1 })}
      >
        <Text
          original
          style={[styles.title, easy && { fontSize: 23, lineHeight: 33 }]}
        >
          {display.title}
        </Text>
        <View style={[styles.benefit, easy && { borderRadius: 6 }]}>
          <Text style={[styles.label, easy && { fontSize: 17 }]}>
            지원 내용
          </Text>
          <Text
            original
            numberOfLines={easy ? 3 : 2}
            style={[
              styles.benefitText,
              easy && { fontSize: 20, lineHeight: 30 },
            ]}
          >
            {display.benefit === "공식 공고에서 확인"
              ? display.summary || display.benefit
              : display.benefit}
          </Text>
        </View>
        <PolicyFact
          icon="account"
          label="대상"
          value={display.audience}
          lines={2}
        />
        <PolicyFact
          icon="calendar"
          label="기간"
          value={display.applicationPeriod}
          lines={2}
        />
        <View style={styles.footer}>
          <Text
            original
            numberOfLines={2}
            style={[
              styles.organization,
              easy && { fontSize: 16, lineHeight: 24 },
            ]}
          >
            {display.organization}
          </Text>
          <View style={[styles.action, easy && styles.easyAction]}>
            <Text style={[styles.actionText, easy && { fontSize: 18 }]}>
              자세히 보기
            </Text>
            <Icon name="next" size={18} color={colors.green} />
          </View>
        </View>
      </Pressable>
      {showReason && policy.searchMatch && (
        <Details collapsible label="이 공고를 찾은 이유">
          <Copy original>{policy.searchMatch.reason}</Copy>
          {policy.searchMatch.evidence.map(({ quote }, index) => (
            <Copy original key={index} muted>
              {quote}
            </Copy>
          ))}
        </Details>
      )}
    </View>
  );
}

export function PolicyFact({
  icon,
  label,
  value,
  lines,
}: {
  icon: IconName;
  label: string;
  value: string;
  lines?: number;
}) {
  const { easy } = useRuntime();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={colors.muted} />
      <Text
        style={[styles.factLabel, easy && { fontSize: 17, lineHeight: 27 }]}
      >
        {label}
      </Text>
      <Text
        original
        numberOfLines={lines}
        style={[styles.factValue, easy && { fontSize: 18, lineHeight: 27 }]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "#E9EDF5",
  },
  easyCard: {
    borderRadius: 10,
    borderColor: colors.easyLine,
    borderWidth: 1.5,
    padding: 18,
  },
  top: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: { fontSize: 13, fontWeight: "700" },
  region: { color: colors.muted, fontSize: 13, flexShrink: 1 },
  title: {
    color: colors.ink,
    fontSize: 21,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.45,
  },
  benefit: {
    backgroundColor: "#F5F7FB",
    padding: 14,
    borderRadius: 12,
    gap: 5,
  },
  label: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  benefitText: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "600",
  },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  factLabel: { color: colors.muted, fontSize: 13, lineHeight: 22 },
  factValue: { color: colors.ink, fontSize: 14, lineHeight: 22, flex: 1 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  organization: {
    flex: 1,
    minWidth: 80,
    fontSize: 12,
    lineHeight: 19,
    color: colors.muted,
  },
  action: { minHeight: 44, flexDirection: "row", gap: 4, alignItems: "center" },
  easyAction: {
    borderWidth: 1,
    borderColor: colors.green,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  actionText: { color: colors.green, fontWeight: "700", fontSize: 14 },
});
