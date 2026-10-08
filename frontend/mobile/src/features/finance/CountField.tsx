import { useState } from "react";
import { View } from "react-native";
import { countChoices, readCount } from "@bokji/core/count-choices";
import { Choice, Copy, Field } from "../../components/ui";
import { useI18n } from "../../i18n/context";

export function CountField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  groupFrom = 3,
  manualFrom = 9,
  allowUnknown = true,
  exactLabel = "실제 인원",
  disabled = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  min?: number;
  max?: number;
  groupFrom?: number;
  manualFrom?: number;
  allowUnknown?: boolean;
  exactLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const count = readCount(value);
  const choices = countChoices({ min, max, groupFrom, manualFrom });
  const [expanded, setExpanded] = useState(false);
  const [manual, setManual] = useState(false);
  const grouped = expanded || (count !== null && count >= groupFrom);
  const direct = manual || (count !== null && count >= manualFrom);
  function pick(next: number | null) {
    setExpanded(false);
    setManual(false);
    onChange(next);
  }
  return (
    <View style={{ gap: 10 }}>
      <Copy>{label}</Copy>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t(label)}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        {allowUnknown && (
          <Choice
            compact
            label="모름"
            selected={count === null && !expanded && !manual}
            onPress={() => pick(null)}
            disabled={disabled}
          />
        )}
        {choices.common.map((n: number) => (
          <Choice
            compact
            key={n}
            label={n === 0 ? "없음" : t("{count}명", { count: n })}
            selected={!grouped && count === n}
            onPress={() => pick(n)}
            disabled={disabled}
          />
        ))}
        {choices.grouped && (
          <Choice
            compact
            label={t("{count}명 이상", { count: groupFrom })}
            selected={grouped}
            onPress={() => {
              setExpanded(true);
              if (!grouped) onChange(null);
            }}
            disabled={disabled}
          />
        )}
      </View>
      {grouped && (
        <View style={{ gap: 10 }}>
          <Copy muted>
            {t("{label}를 선택해 주세요.", { label: t(exactLabel) })}
          </Copy>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t(exactLabel)}
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
          >
            {choices.exact.map((n: number) => (
              <Choice
                compact
                key={n}
                label={t("{count}명", { count: n })}
                selected={!direct && count === n}
                onPress={() => {
                  setManual(false);
                  onChange(n);
                }}
                disabled={disabled}
              />
            ))}
            {choices.manual && (
              <Choice
                label={t("{count}명 이상 직접 입력", { count: manualFrom })}
                selected={direct}
                onPress={() => {
                  setManual(true);
                  if (!direct) onChange(null);
                }}
                disabled={disabled}
              />
            )}
          </View>
          {direct && (
            <Field
              label={t("{label} (명)", { label: t(exactLabel) })}
              value={value == null ? "" : String(value)}
              keyboardType="number-pad"
              placeholder={t("{min}~{max}명", {
                min: manualFrom,
                max: choices.max,
              })}
              onChangeText={onChange}
              editable={!disabled}
            />
          )}
        </View>
      )}
    </View>
  );
}
