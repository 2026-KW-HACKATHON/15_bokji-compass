import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { Linking, View } from "react-native";
import {
  medianForHousehold,
  medianPercents,
  medianReference,
  monthlyIncomeRatio,
} from "@bokji/core/median-income";
import { MAX_HOUSEHOLD_SIZE } from "@bokji/core/finance-model";
import { useI18n } from "../../i18n/context";
import { Button, Card, Copy, Field, Notice, colors } from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import { CountField } from "./CountField";
import { financeError } from "./i18n";

export function QuickCalculator({
  draft,
  onChange,
  onDetail,
  onMessage,
}: {
  draft: { householdSize: string; monthlyIncome: string };
  onChange: (key: string, value: unknown) => void;
  onDetail: () => void;
  onMessage: (message: string) => void;
}) {
  const { t, formatMoney } = useI18n();
  const { easy } = useRuntime();
  let base: number | null = null;
  let error = "";
  let ratio: { income: number; percent: number } | null = null;
  try {
    base = medianForHousehold(draft.householdSize);
  } catch (err) {
    error = financeError((err as Error).message, t);
  }
  if (base !== null) {
    try {
      ratio = monthlyIncomeRatio(draft.monthlyIncome, base);
    } catch (err) {
      error = financeError((err as Error).message, t);
    }
  }
  return (
    <>
      <Card>
        <CountField
          label="함께 사는 가구원은 몇 명인가요?"
          value={draft.householdSize}
          onChange={(value) =>
            onChange("householdSize", value == null ? "" : String(value))
          }
          min={1}
          max={MAX_HOUSEHOLD_SIZE}
          groupFrom={7}
          manualFrom={12}
          allowUnknown={false}
          exactLabel="실제 가구원 수"
        />
        <Copy muted>본인을 포함한 인원을 선택하세요.</Copy>
      </Card>
      {base !== null && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            backgroundColor: easy ? colors.surface : colors.green,
            borderRadius: easy ? 10 : 24,
            borderWidth: easy ? 1.5 : 0,
            borderColor: colors.easyLine,
            padding: 24,
            gap: 10,
          }}
        >
          <Text
            style={{
              fontSize: easy ? 20 : 15,
              color: easy ? colors.muted : "#E2EBFF",
              lineHeight: 27,
            }}
          >
            {t("{year}년 · {count}인 가구 기준 중위소득", {
              year: medianReference.year,
              count: draft.householdSize,
            })}
          </Text>
          <Text
            style={{
              fontSize: 32,
              lineHeight: 44,
              color: easy ? colors.ink : "#FFF",
              fontWeight: "800",
              letterSpacing: -0.6,
            }}
          >
            {formatMoney(base)}
          </Text>
          <Text
            style={{
              fontSize: easy ? 19 : 14,
              color: easy ? colors.green : "#FFF",
              fontWeight: "600",
            }}
          >
            매월 · 기준 중위소득 100%
          </Text>
        </View>
      )}
      <Card>
        <Field
          label="가구 전체 월소득 (선택 · 만원)"
          value={draft.monthlyIncome}
          onChangeText={(value) => onChange("monthlyIncome", value)}
          placeholder="예: 300"
          keyboardType="decimal-pad"
        />
        <Copy muted>
          근로소득은 세전, 사업소득은 필요경비 차감 후 금액이에요. 소득이 없으면
          0을 입력하세요.
        </Copy>
        {ratio !== null && (
          <View
            style={{
              backgroundColor: colors.mint,
              borderRadius: easy ? 8 : 16,
              padding: 18,
              gap: 6,
            }}
          >
            <Copy>
              {t("입력한 월소득 {amount}", {
                amount: formatMoney(ratio.income),
              })}
            </Copy>
            <Text
              style={{
                color: colors.green,
                fontSize: 26,
                lineHeight: 36,
                fontWeight: "800",
              }}
            >
              {t("기준 중위소득의 {percent}%", { percent: ratio.percent })}
            </Text>
          </View>
        )}
        {!!error && <Notice>{error}</Notice>}
      </Card>
      {base !== null && (
        <Card>
          <Copy title>비율별 기준 금액</Copy>
          {medianPercents.map((percent: number) => (
            <View
              key={percent}
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                paddingVertical: 11,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <Text
                style={{
                  fontSize: easy ? 20 : 16,
                  color: percent === 100 ? colors.green : colors.muted,
                  fontWeight: "600",
                }}
              >
                {percent}%
              </Text>
              <Text
                style={{
                  fontSize: easy ? 20 : 17,
                  color: colors.ink,
                  fontWeight: percent === 100 ? "800" : "600",
                }}
              >
                {formatMoney(Math.round((base! * percent) / 100))}
              </Text>
            </View>
          ))}
          <Button
            secondary
            label="보건복지부 공식 기준 보기"
            onPress={() => {
              void Linking.openURL(medianReference.source).catch(() =>
                onMessage("공식 기준을 열지 못했어요."),
              );
            }}
          />
        </Card>
      )}
      <Card>
        <Copy title>소득과 재산까지 알아보려면</Copy>
        <Copy muted>
          소득 공제와 재산 환산을 반영하는 상세 계산으로 이어갈 수 있어요.
        </Copy>
        <Button label="소득·재산 상세 계산" onPress={onDetail} />
      </Card>
      <Copy muted>
        빠른 확인은 월소득의 단순 비율 비교예요. 지원 자격과 지급액을 확정하지
        않습니다.
      </Copy>
    </>
  );
}
