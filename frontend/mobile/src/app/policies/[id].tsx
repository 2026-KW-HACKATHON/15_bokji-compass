import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, View } from "react-native";
import { colors } from "../../components/theme";
import { Icon } from "../../components/Icon";
import {
  PolicyFact,
  policyAppearance,
} from "../../features/policies/PolicyCard";
import {
  Button,
  Card,
  Copy,
  Details,
  ReadableText,
  Notice,
  Screen,
} from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import { parsePolicy } from "../../features/policies/model";
import { useAssistant } from "../../features/assistant/context";
import {
  PolicyTranslationControls,
  usePolicyTranslation,
} from "../../features/policies/usePolicyTranslation";

export default function PolicyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DetailContent key={id} id={id} />;
}

function DetailContent({ id }: { id: string }) {
  const { openChat } = useAssistant();
  const { api, configError, easy } = useRuntime();
  const [policy, setPolicy] = useState<ReturnType<typeof parsePolicy> | null>(
    null,
  );
  const [requestError, setError] = useState("");
  const error =
    configError ||
    (!id || Array.isArray(id) ? "공고 주소를 확인해 주세요." : requestError);
  const [linkError, setLinkError] = useState("");
  const [retry, setRetry] = useState(0);
  const translation = usePolicyTranslation(policy, 10);
  const display = translation.display || policy;
  useEffect(() => {
    const controller = new AbortController();
    if (configError || !id || Array.isArray(id)) {
      return;
    }
    api
      .getPolicy(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPolicy(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err.status === 404
              ? "공개된 공고를 찾을 수 없어요. 목록에서 다시 선택해 주세요."
              : err.message,
          );
      });
    return () => controller.abort();
  }, [api, id, configError, retry]);
  return (
    <Screen>
      <Button
        secondary
        label="공고 목록으로"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/policies")
        }
      />
      {error ? (
        <Card>
          <Notice>{error}</Notice>
          <Button
            label="다시 시도하기"
            onPress={() => {
              setPolicy(null);
              setError("");
              setRetry((value) => value + 1);
            }}
          />
        </Card>
      ) : !display ? (
        <Notice>공고 내용을 가져오고 있어요.</Notice>
      ) : (
        <>
          <PolicyTranslationControls state={translation} />
          <Card>
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Icon
                name={policyAppearance(display.category).icon}
                color={policyAppearance(display.category).color}
              />
              <Text
                style={{
                  color: policyAppearance(display.category).color,
                  fontSize: easy ? 19 : 14,
                  fontWeight: "700",
                }}
              >
                {display.category}
              </Text>
              <Text style={{ color: colors.muted, fontSize: easy ? 18 : 14 }}>
                {display.region}
              </Text>
            </View>
            <ReadableText title text={display.title} label="공고 제목" />
            <Copy original muted>
              {display.organization}
            </Copy>
            <View
              style={{
                backgroundColor: colors.mint,
                padding: 18,
                borderRadius: easy ? 8 : 16,
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: colors.green,
                  fontSize: easy ? 19 : 14,
                  fontWeight: "700",
                }}
              >
                이런 지원을 받을 수 있어요
              </Text>
              <ReadableText text={display.benefit} label="지원 내용" />
            </View>
            <PolicyFact
              icon="calendar"
              label="신청 기간"
              value={display.applicationPeriod}
            />
          </Card>
          <Card>
            <Copy title>누가 받을 수 있나요?</Copy>
            <ReadableText text={display.audience} label="지원 대상" />
          </Card>
          <Card>
            <Details collapsible label="공고 요약 전체 보기">
              <Copy original={!!display.summary}>
                {display.summary ||
                  "공식 공고에서 자세한 내용을 확인해 주세요."}
              </Copy>
            </Details>
          </Card>
          {[
            ["지급 시기", display.paymentSchedule],
            ["신청 방법", display.applicationMethod],
            ["문의처", display.contact],
            ["성별 조건", display.gender],
          ]
            .filter(([, value]) => !!value)
            .map(([label, value]) => (
              <Card key={label}>
                <Copy title>{label}</Copy>
                <ReadableText text={value} label={label} />
              </Card>
            ))}
          {!!display.otherConditions.length && (
            <Card>
              <Copy title>기타 조건</Copy>
              <ReadableText
                text={display.otherConditions.join("\n")}
                label="기타 조건"
              />
            </Card>
          )}
          {!!display.content && (
            <Card>
              <Details collapsible label="공고 본문 보기">
                <ReadableText text={display.content} label="공고 본문" />
              </Details>
            </Card>
          )}
          {!!Object.keys(display.sourceFields).length && (
            <Card>
              <Details collapsible label="공고의 전체 항목 확인">
                {Object.entries(display.sourceFields).map(([key, value]) => (
                  <View key={key} style={{ gap: 6 }}>
                    <Copy title original={!Object.hasOwn(sourceLabels, key)}>
                      {Object.hasOwn(sourceLabels, key)
                        ? sourceLabels[key]
                        : key}
                    </Copy>
                    <ReadableText
                      text={String(value)}
                      label={
                        Object.hasOwn(sourceLabels, key)
                          ? sourceLabels[key]
                          : key
                      }
                    />
                  </View>
                ))}
              </Details>
            </Card>
          )}
          {!!display.budgetNotice && (
            <Copy original muted>
              {display.budgetNotice}
            </Copy>
          )}
          <Notice>
            {easy
              ? "신청 전 공식 공고의 조건을 꼭 확인하세요."
              : "신청 전 공식 공고에서 자세한 조건과 신청 방법을 확인해 주세요."}
          </Notice>
          {display.sourceUrl ? (
            <Button
              label="공식 공고 보기"
              onPress={() => {
                setLinkError("");
                void Linking.openURL(display.sourceUrl!).catch(() =>
                  setLinkError(
                    "공식 공고를 열지 못했어요. 잠시 후 다시 시도해 주세요.",
                  ),
                );
              }}
            />
          ) : (
            <Notice>등록된 공식 공고 링크가 없습니다.</Notice>
          )}
          <Button
            secondary
            label="이 공고에 대해 질문하기"
            onPress={() => {
              if (policy) openChat(policy);
            }}
          />
          {linkError ? <Notice>{linkError}</Notice> : null}
        </>
      )}
    </Screen>
  );
}

const sourceLabels: Record<string, string> = {
  text: "공고 본문",
  purpose_summary: "사업 목적",
  eligibility: "지원 대상",
  selection: "선정 기준",
  benefits: "지원 내용",
  application_period: "신청 기간",
  application_method: "신청 방법",
  application_url: "신청 주소",
  contact: "문의처",
  documents: "제출 서류",
  published_date: "게시일",
  modified_date: "수정일",
};
