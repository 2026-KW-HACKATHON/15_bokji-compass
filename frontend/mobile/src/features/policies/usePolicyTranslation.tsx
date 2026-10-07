import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Copy, colors } from "../../components/ui";
import { useI18n } from "../../i18n/context";
import { useRuntime } from "../../services/runtime";
import { parsePolicy } from "./model";

type Policy = ReturnType<typeof parsePolicy>;
export function usePolicyTranslation(policy: Policy | null, priority = 0) {
  const { locale } = useI18n();
  const { api } = useRuntime();
  const scopeKey = JSON.stringify([locale, policy?.id, policy?.revisionId]);
  const [view, setView] = useState({ scopeKey, original: false });
  // A new policy or language starts with its translated view.
  if (view.scopeKey !== scopeKey) setView({ scopeKey, original: false });
  const original = view.scopeKey === scopeKey && view.original;
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([locale, policy, retry, original]);
  const [result, setResult] = useState<{
    key: string;
    policy?: Policy;
    error?: boolean;
  } | null>(null);
  const current = result?.key === key ? result : null;
  useEffect(() => {
    if (!policy || locale === "ko" || original) return;
    const controller = new AbortController();
    api.policyTranslations
      .translate(policy, locale, { signal: controller.signal, priority })
      .then((translated: Policy) => {
        if (!controller.signal.aborted) setResult({ key, policy: translated });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, error: true });
      });
    return () => controller.abort();
  }, [api, policy, locale, original, key, retry, priority]);
  return {
    display: original || locale === "ko" ? policy : current?.policy || policy,
    active: !!policy && locale !== "ko",
    status: original
      ? "original"
      : current?.policy
        ? "translated"
        : current?.error
          ? "error"
          : "loading",
    original,
    toggleOriginal: () => setView({ scopeKey, original: !original }),
    retry: () => setRetry((value) => value + 1),
  };
}

export function PolicyTranslationControls({
  state,
  compact = false,
}: {
  state: ReturnType<typeof usePolicyTranslation>;
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (!state.active) return null;
  const message =
    state.status === "loading"
      ? "공고를 번역하고 있어요. 한국어 원문을 먼저 표시합니다."
      : state.status === "error"
        ? "공고 번역을 불러오지 못했어요. 한국어 원문을 표시합니다."
        : state.status === "original"
          ? "한국어 원문을 표시하고 있어요."
          : "AI 번역 · 신청 조건은 공식 원문에서 확인해 주세요.";
  return (
    <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
      <Copy muted>{message}</Copy>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            state.original ? "번역 보기" : "한국어 원문 보기",
          )}
          onPress={state.toggleOriginal}
          style={{
            minHeight: compact ? 44 : 48,
            justifyContent: "center",
            paddingHorizontal: 8,
          }}
        >
          <Copy>{state.original ? "번역 보기" : "한국어 원문 보기"}</Copy>
        </Pressable>
        {state.status === "error" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("번역 다시 시도")}
            onPress={state.retry}
            style={{
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: 8,
              backgroundColor: colors.mint,
              borderRadius: 8,
            }}
          >
            <Copy>번역 다시 시도</Copy>
          </Pressable>
        )}
      </View>
    </View>
  );
}
