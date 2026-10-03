import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Linking } from "react-native";
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
          <Copy muted>
            {policy.category} · {policy.region}
          </Copy>
          <ReadableText title text={policy.title} label="공고 제목" />
          <Button
            label="이 공고에 챗봇 질문하기"
            onPress={() => openChat(policy)}
          />
          <Details label="공고 요약 보기">
            <Copy>{policy.summary}</Copy>
          </Details>
          <Card>
            <Copy title>지원 내용</Copy>
            <ReadableText text={policy.benefit} label="지원 내용" />
          </Card>
          <Card>
            <Copy title>신청 정보</Copy>
            <ReadableText
              text={`지원 대상: ${policy.audience}`}
              label="지원 대상"
            />
            <Copy>신청 기간: {policy.applicationPeriod}</Copy>
            <Details label="담당 기관 보기">
              <Copy>담당 기관: {policy.organization}</Copy>
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
          {linkError ? <Notice>{linkError}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
