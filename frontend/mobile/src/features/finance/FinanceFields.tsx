import { Switch, Text, View } from "react-native";
import { fieldValue, visibleFields } from "@bokji/core/finance-flow";
import {
  formatMoney,
  moneyInput,
  moneyInputValue,
  parseMoney,
} from "@bokji/core/finance-model";
import {
  Button,
  Choice,
  Copy,
  Details,
  Field,
  colors,
} from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import { CountField } from "./CountField";
import { updateDraft } from "./draft";

export type FormField = {
  path: string;
  label: string;
  type: string;
  hint?: string;
  example?: string;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  optional?: boolean;
  countChoices?: {
    groupFrom: number;
    manualFrom: number;
    allowUnknown?: boolean;
    exactLabel?: string;
  };
  options?: (string | number)[][];
};
type Draft = ReturnType<typeof updateDraft>;
type Props = {
  draft: Draft;
  edit: (path: string, value: unknown) => void;
  busy: boolean;
};

function FinanceField({
  field,
  draft,
  edit,
  busy,
}: Props & { field: FormField }) {
  const { easy } = useRuntime();
  const value = fieldValue(draft, field.path);
  const hint = field.hint && (
    <Details collapsible label={`${field.label} 도움말`}>
      <Copy muted>{field.hint}</Copy>
    </Details>
  );
  if (field.countChoices)
    return (
      <View style={{ gap: 8 }}>
        <CountField
          label={field.label}
          value={value}
          onChange={(next) => edit(field.path, next)}
          min={field.min}
          max={field.max}
          {...field.countChoices}
          disabled={busy}
        />
        {hint}
      </View>
    );
  if (field.type === "check")
    return (
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Copy>{field.label}</Copy>
            {field.optional && <Copy muted>선택 · 필수 아님</Copy>}
          </View>
          <Switch
            accessibilityLabel={field.label}
            disabled={busy}
            value={value === true}
            onValueChange={(next) => edit(field.path, next)}
            trackColor={{ true: colors.green }}
          />
        </View>
        {hint}
      </View>
    );
  if (field.type === "select")
    return (
      <View style={{ gap: 10 }}>
        <Copy>{field.label}</Copy>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {field.options?.map(([key, label]) => (
            <Choice
              key={key}
              label={String(label)}
              selected={String(value) === String(key)}
              disabled={busy}
              onPress={() => edit(field.path, key)}
            />
          ))}
        </View>
        {hint}
      </View>
    );
  const money = field.type === "money";
  const presence = value == null ? "unknown" : value === 0 ? "none" : "yes";
  let converted: number | null = null;
  if (money) {
    try {
      converted = parseMoney(value, field.label);
    } catch {
      /* Keep invalid text for correction. */
    }
  }
  return (
    <View style={{ gap: 10 }}>
      {money && <Copy>{field.label}</Copy>}
      {field.example && <Copy muted>{field.example}</Copy>}
      {money && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            ["yes", "있어요"],
            ["none", "없어요 (0원)"],
            ["unknown", "모르겠어요"],
          ].map(([key, label]) => (
            <Choice
              key={key}
              label={label}
              accessibilityLabel={`${field.label} ${label}`}
              selected={presence === key}
              disabled={busy}
              onPress={() =>
                edit(
                  field.path,
                  key === "none"
                    ? 0
                    : key === "unknown"
                      ? null
                      : presence === "yes"
                        ? value
                        : moneyInput(""),
                )
              }
            />
          ))}
        </View>
      )}
      {(!money || presence === "yes") && (
        <Field
          label={
            money
              ? "금액 (만원)"
              : `${field.label}${field.unit ? ` (${field.unit})` : ""}`
          }
          accessibilityLabel={`${field.label}${money ? " 만원" : ""}`}
          value={
            money ? moneyInputValue(value) : value == null ? "" : String(value)
          }
          placeholder={
            field.placeholder || (money ? "예: 300" : "모르면 비워두세요")
          }
          keyboardType={money ? "decimal-pad" : "number-pad"}
          editable={!busy}
          onChangeText={(text) =>
            edit(field.path, money ? moneyInput(text) : text)
          }
        />
      )}
      {money && (
        <Text
          style={{
            color: presence === "yes" ? colors.green : colors.muted,
            fontSize: easy ? 18 : 14,
            lineHeight: easy ? 27 : 22,
          }}
        >
          {presence === "yes"
            ? converted === null
              ? "만원 단위로 입력해요. 예: 300 = 300만 원"
              : `입력한 금액: ${formatMoney(converted)}`
            : presence === "none"
              ? "0원으로 계산해요."
              : "확인할 항목으로 남겨두고 다음으로 갈 수 있어요."}
        </Text>
      )}
      {hint}
    </View>
  );
}

export function QuestionFields({
  question,
  ...props
}: Props & { question: { id: string; title: string; fields: FormField[] } }) {
  const basic = question.id.match(/^member-(\d+)-basic$/);
  return (
    <View style={{ gap: 20 }}>
      {basic && (
        <Button
          secondary
          label="이 가구원의 소득이 모두 없어요"
          disabled={props.busy}
          onPress={() =>
            props.edit(`members.${basic[1]}`, {
              ...props.draft.members[Number(basic[1])],
              earned_income: 0,
              business_income: 0,
              other_income: 0,
              private_transfer_income: 0,
            })
          }
        />
      )}
      {question.id === "debts" && (
        <Button
          secondary
          label="부채가 모두 없어요"
          disabled={props.busy}
          onPress={() => props.edit("debts", { bank: 0, public: 0, other: 0 })}
        />
      )}
      {visibleFields(question, props.draft).map((field: FormField) => (
        <FinanceField key={field.path} field={field} {...props} />
      ))}
    </View>
  );
}
