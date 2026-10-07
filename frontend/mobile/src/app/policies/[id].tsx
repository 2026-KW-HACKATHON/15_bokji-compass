import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, Text, View } from "react-native";
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
      ) : !policy ? (
        <Notice>공고 내용을 가져오고 있어요.</Notice>
      ) : (
        <>
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
                name={policyAppearance(policy.category).icon}
                color={policyAppearance(policy.category).color}
              />
              <Text
                style={{
                  color: policyAppearance(policy.category).color,
                  fontSize: easy ? 19 : 14,
                  fontWeight: "700",
                }}
              >
                {policy.category}
              </Text>
              <Text style={{ color: colors.muted, fontSize: easy ? 18 : 14 }}>
                {policy.region}
              </Text>
            </View>
            <ReadableText title text={policy.title} label="공고 제목" />
            <Copy muted>{policy.organization}</Copy>
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
              <ReadableText text={policy.benefit} label="지원 내용" />
            </View>
            <PolicyFact
              icon="calendar"
              label="신청 기간"
              value={policy.applicationPeriod}
            />
          </Card>
          <Card>
            <Copy title>누가 받을 수 있나요?</Copy>
            <ReadableText text={policy.audience} label="지원 대상" />
          </Card>
          <Card>
            <Details collapsible label="공고 요약 전체 보기">
              <Copy>
                {policy.summary || "공식 공고에서 자세한 내용을 확인해 주세요."}
              </Copy>
            </Details>
          </Card>
          <Notice>
            {easy
              ? "신청 전 공식 공고의 조건을 꼭 확인하세요."
              : "신청 전 공식 공고에서 자세한 조건과 신청 방법을 확인해 주세요."}
          </Notice>
          {policy.sourceUrl ? (
            <Button
              label="공식 공고 보기"
              onPress={() => {
                setLinkError("");
                void Linking.openURL(policy.sourceUrl!).catch(() =>
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
            onPress={() => openChat(policy)}
          />
          {linkError ? <Notice>{linkError}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
