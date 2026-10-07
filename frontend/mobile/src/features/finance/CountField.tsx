import { useState } from "react";
import { View } from "react-native";
import { countChoices, readCount } from "@bokji/core/count-choices";
import { Choice, Copy, Field } from "../../components/ui";

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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {allowUnknown && (
          <Choice
            label="모름"
            selected={count === null && !expanded && !manual}
            onPress={() => pick(null)}
            disabled={disabled}
          />
        )}
        {choices.common.map((n: number) => (
          <Choice
            key={n}
            label={n === 0 ? "없음" : `${n}명`}
            selected={!grouped && count === n}
            onPress={() => pick(n)}
            disabled={disabled}
          />
        ))}
        {choices.grouped && (
          <Choice
            label={`${groupFrom}명 이상`}
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
          <Copy muted>{exactLabel}를 선택해 주세요.</Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {choices.exact.map((n: number) => (
              <Choice
                key={n}
                label={`${n}명`}
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
                label={`${manualFrom}명 이상 직접 입력`}
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
              label={`${exactLabel} (명)`}
              value={value == null ? "" : String(value)}
              keyboardType="number-pad"
              placeholder={`${manualFrom}~${choices.max}명`}
              onChangeText={onChange}
              editable={!disabled}
            />
          )}
        </View>
      )}
    </View>
  );
}
