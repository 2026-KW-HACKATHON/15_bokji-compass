import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Choice, Copy, Details, colors } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useRuntime } from "../../services/runtime";
import { candidateStates } from "./monitoringModel";
import { Candidate, Policy } from "./types";

export function Consent({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { easy } = useRuntime();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: value ? colors.green : colors.easyLine,
        borderRadius: easy ? 8 : 14,
        minHeight: easy ? 60 : 52,
        padding: 14,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: value ? colors.green : colors.muted,
          backgroundColor: value ? colors.green : "#FFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {value && <Icon name="check" size={18} color="#FFF" />}
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: easy ? 20 : 16,
          lineHeight: easy ? 30 : 25,
          color: colors.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Options({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: unknown;
  options: (readonly [unknown, string])[];
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Copy>{label}</Copy>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map(([key, text]) => (
          <Choice
            key={String(key)}
            label={text}
            selected={key === value}
            onPress={() => onChange(key)}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}
export function openPolicy(policy: Pick<Policy, "id">) {
  router.push({ pathname: "/policies/[id]", params: { id: policy.id } });
}
export function CandidateCard({
  item,
  disabled = false,
  onState,
}: {
  item: Candidate;
  disabled?: boolean;
  onState?: (state: string) => void;
}) {
  const { easy } = useRuntime();
  return (
    <View
      style={{
        backgroundColor: "#FFF",
        padding: easy ? 18 : 20,
        borderRadius: easy ? 10 : 20,
        borderWidth: 1,
        borderColor: easy ? colors.easyLine : colors.line,
        gap: 12,
      }}
    >
      <Text
        style={{
          color: colors.green,
          fontSize: easy ? 18 : 13,
          fontWeight: "700",
        }}
      >
        {item.active === false
          ? "이전 지원 기록"
          : item.schedule_status === "upcoming"
            ? "접수 예정 · 조건 확인 필요"
            : "관련 지원 후보 · 조건 확인 필요"}
      </Text>
      <Copy title>{item.policy.title}</Copy>
      <Copy muted>
        {item.policy.region} · {item.policy.organization}
      </Copy>
      <Copy>{item.reason}</Copy>
      <Copy>{item.policy.benefit}</Copy>
      <Copy muted>신청 기간 · {item.policy.applicationPeriod}</Copy>
      {!!item.questions.length && (
        <Details collapsible label="신청 전에 확인할 조건">
          {item.questions.map((question, index) => (
            <Copy key={index}>• {question}</Copy>
          ))}
        </Details>
      )}
      {item.active === false && (
        <Copy muted>
          현재 탐색 결과에 없는 기록이에요. 공식 공고에서 최신 조건을 확인해
          주세요.
        </Copy>
      )}
      <Button
        secondary
        label="공고 상세 보기"
        onPress={() => openPolicy(item.policy)}
      />
      {onState && (
        <Details
          collapsible
          label={`진행 상태 · ${candidateStates.find(([key]) => key === item.state)?.[1] || "살펴보는 중"}`}
        >
          <Options
            label="내가 표시한 신청 진행 상태"
            value={item.state}
            options={candidateStates as [string, string][]}
            disabled={disabled}
            onChange={(value) => onState(String(value))}
          />
        </Details>
      )}
    </View>
  );
}
