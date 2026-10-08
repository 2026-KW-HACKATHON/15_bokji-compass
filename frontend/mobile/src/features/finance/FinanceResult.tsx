import { useI18n } from "../../i18n/context";
import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { Linking, View } from "react-native";
import { officialSourceUrl } from "@bokji/core/finance-model";
import { Button, Card, Copy, Details, colors } from "../../components/ui";
import { useRuntime } from "../../services/runtime";

type Calculation = {
  reference_year: number;
  median: { monthly_income: number | null; ratio_percent: number | null };
  assets: { gross_total: number | null };
  assessments: {
    rule_id: string;
    label: string;
    status: string;
    notice?: string | null;
    comparison_note?: string | null;
    notes: string[];
    missing: string[];
    checks: {
      label: string;
      state: string;
      value: number | null;
      limit: number | null;
    }[];
    breakdown: { label: string; amount: number | null }[];
  }[];
  notes: string[];
  sources: { title: string; url: string }[];
};
export function FinanceResult({
  result,
  onMessage,
}: {
  result: Calculation;
  onMessage: (message: string) => void;
}) {
  const { t, formatMoney } = useI18n();
  const { easy } = useRuntime();
  return (
    <>
      <View
        style={{
          backgroundColor: colors.mint,
          borderRadius: easy ? 10 : 24,
          padding: 24,
          gap: 12,
        }}
      >
        <Copy>
          {t("{year}년 기준 · 입력한 월소득 합계", {
            year: result.reference_year,
          })}
        </Copy>
        <Text
          style={{
            color: colors.ink,
            fontWeight: "800",
            fontSize: 30,
            lineHeight: 42,
          }}
        >
          {formatMoney(result.median.monthly_income)}
        </Text>
        <Text
          style={{
            color: colors.green,
            fontWeight: "700",
            fontSize: easy ? 22 : 20,
            lineHeight: 31,
          }}
        >
          {result.median.ratio_percent === null
            ? "중위소득 비율은 확인이 필요해요"
            : t("기준 중위소득의 {percent}%", {
                percent: result.median.ratio_percent,
              })}
        </Text>
        <Copy muted>
          {result.median.monthly_income === null
            ? "모르는 소득을 0원으로 계산하지 않아요. 모든 소득 금액을 확인하면 합계를 볼 수 있어요."
            : "입력한 소득의 단순 비교입니다. 세전 소득 또는 사업별 소득인정액과 다를 수 있어요."}
        </Copy>
      </View>
      <Card>
        <Copy title>재산 합계</Copy>
        <Copy>
          {t("차량 포함 {amount}", {
            amount: formatMoney(result.assets.gross_total),
          })}
        </Copy>
      </Card>
      <Copy title>사업별 참고 결과</Copy>
      {result.assessments.map((item) => (
        <Card key={item.rule_id}>
          <Text
            style={{
              color: colors.green,
              fontSize: easy ? 18 : 13,
              fontWeight: "700",
            }}
          >
            {item.status === "estimated" ? "입력값으로 추정" : "추가 확인 필요"}
          </Text>
          <Copy original title>
            {item.label}
          </Copy>
          {item.notice && <Copy original>{item.notice}</Copy>}
          {item.checks.map((check, i) => (
            <View
              key={i}
              style={{
                gap: 6,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                paddingTop: 12,
              }}
            >
              <Copy original>{check.label}</Copy>
              <Copy>
                {item.comparison_note ??
                  (check.state === "within"
                    ? "입력값은 기준 이내"
                    : check.state === "over"
                      ? "입력값은 기준 초과"
                      : "확인 필요")}
              </Copy>
              <Copy muted>
                {t("계산값 {value} · 기준 {limit}", {
                  value: formatMoney(check.value),
                  limit: formatMoney(check.limit),
                })}
              </Copy>
            </View>
          ))}
          {[...item.missing, ...item.notes].map((note, i) => (
            <Copy original key={i} muted>
              {note}
            </Copy>
          ))}
          <Details
            collapsible
            label="계산 내역 보기"
            accessibilityLabel={t("{label} 계산 내역", { label: item.label })}
          >
            {item.breakdown.map((part, i) => (
              <Copy original key={i}>
                {part.label}: {formatMoney(part.amount)}
              </Copy>
            ))}
          </Details>
        </Card>
      ))}
      <Card>
        {result.notes.map((note, i) => (
          <Copy original key={i}>
            {note}
          </Copy>
        ))}
        <Details collapsible label="공식 출처 보기">
          {result.sources.map((source, i) => {
            const url = officialSourceUrl(source.url);
            return url ? (
              <Button
                original
                key={i}
                secondary
                label={source.title}
                onPress={() => {
                  void Linking.openURL(url).catch(() =>
                    onMessage("공식 안내를 열지 못했어요."),
                  );
                }}
              />
            ) : (
              <Copy original key={i}>
                {source.title}
              </Copy>
            );
          })}
        </Details>
      </Card>
      <Copy muted>
        지원 자격과 지급액을 확정하는 결과가 아닙니다. 신청 전 공식 공고와 담당
        기관에서 확인해 주세요.
      </Copy>
    </>
  );
}
