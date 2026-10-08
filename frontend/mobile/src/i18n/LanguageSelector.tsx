import { useState } from "react";
import { Pressable, View } from "react-native";
import { locales } from "../../../packages/core/src/i18n/index.js";
import { useI18n } from "./context";
import { LocalizedText } from "./LocalizedText";
import { colors } from "../components/theme";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t, storageError } = useI18n();
  const [open, setOpen] = useState(!compact);
  const current = locales.find(
    (entry: { code: string }) => entry.code === locale,
  );
  return (
    <View style={{ gap: 8, width: compact ? undefined : "100%" }}>
      {compact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("언어 선택")}
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          onPress={() => setOpen(!open)}
          style={{
            minHeight: 48,
            paddingHorizontal: 8,
            justifyContent: "center",
          }}
        >
          <LocalizedText
            original
            style={{ color: colors.green, fontWeight: "700", fontSize: 14 }}
          >
            🌐 {current?.nativeName}
          </LocalizedText>
        </Pressable>
      ) : (
        <LocalizedText
          style={{ color: colors.ink, fontWeight: "700", fontSize: 18 }}
        >
          언어 선택
        </LocalizedText>
      )}
      {open && (
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {locales.map((entry: { code: string; nativeName: string }) => (
            <Pressable
              key={entry.code}
              accessibilityRole="radio"
              accessibilityLabel={entry.nativeName}
              accessibilityState={{ checked: locale === entry.code }}
              aria-checked={locale === entry.code}
              onPress={() => {
                void setLocale(entry.code);
                if (compact) setOpen(false);
              }}
              style={{
                minHeight: 48,
                justifyContent: "center",
                paddingHorizontal: 12,
                borderWidth: 1,
                borderRadius: 10,
                borderColor: locale === entry.code ? colors.green : colors.line,
                backgroundColor:
                  locale === entry.code ? colors.mint : colors.surface,
              }}
            >
              <LocalizedText
                original
                style={{ color: colors.ink, fontSize: 15 }}
              >
                {entry.nativeName}
              </LocalizedText>
            </Pressable>
          ))}
        </View>
      )}
      {storageError && (
        <LocalizedText
          style={{
            color: colors.danger,
            fontSize: 14,
            lineHeight: 22,
            maxWidth: compact ? 260 : undefined,
          }}
        >
          언어 설정을 저장하지 못했어요. 현재 화면에는 적용되지만 다음 실행 때
          다시 선택해야 할 수 있어요.
        </LocalizedText>
      )}
    </View>
  );
}

export function OriginalContentNotice() {
  const { locale, t } = useI18n();
  if (locale === "ko") return null;
  return (
    <View
      style={{ backgroundColor: colors.mint, padding: 12, borderRadius: 10 }}
    >
      <LocalizedText
        original
        style={{ color: colors.ink, fontSize: 14, lineHeight: 22 }}
      >
        {t(
          "공고는 선택한 언어로 번역합니다. AI 상담 답변은 현재 한국어로 제공됩니다. 신청 조건은 공식 원문에서 확인해 주세요.",
        )}
      </LocalizedText>
    </View>
  );
}
