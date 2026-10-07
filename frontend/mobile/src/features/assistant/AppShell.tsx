import { useI18n } from "../../i18n/context";
import { LocalizedText as Text } from "../../i18n/LocalizedText";
import React, { useEffect, useRef } from "react";
import {
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Button, Copy, colors } from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import { useAssistant } from "./context";
import { AssistantChat } from "./AssistantChat";
import { Icon } from "../../components/Icon";

export function AppShell({ children }: React.PropsWithChildren) {
  const { t } = useI18n();
  const chat = useAssistant();
  const { easy, setEasy } = useRuntime();
  const overlayRef = useRef<View>(null);
  const blocking = !!chat.panel || chat.confirm || chat.disabledNotice;
  const { closePanel, cancelDisable } = chat;
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        closePanel();
        cancelDisable();
      }
    });
    return () => listener.remove();
  }, [closePanel, cancelDisable]);
  useEffect(() => {
    if (!blocking) return;
    const back = () => {
      if (chat.confirm) chat.cancelDisable();
      else if (chat.disabledNotice) chat.dismissNotice();
      else chat.closePanel();
      return true;
    };
    const listener = BackHandler.addEventListener("hardwareBackPress", back);
    // Native accessibility uses the modal view; web also traps and restores keyboard focus.
    if (Platform.OS !== "web") return () => listener.remove();
    const previous = document.activeElement as HTMLElement | null;
    const host = overlayRef.current as unknown as HTMLElement;
    const focusable = () =>
      [
        ...host.querySelectorAll<HTMLElement>(
          'button,[role="button"],input,textarea,[tabindex="0"]',
        ),
      ].filter(
        (node) =>
          !node.closest('[aria-hidden="true"]') &&
          !node.hasAttribute("disabled") &&
          node.getClientRects().length,
      );
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        back();
      }
      if (event.key === "Tab") {
        const list = focusable();
        const first = list[0];
        const last = list[list.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !host.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !host.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      listener.remove();
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [
    blocking,
    chat,
    chat.panel,
    chat.confirm,
    chat.disabledNotice,
    chat.cancelDisable,
    chat.closePanel,
    chat.dismissNotice,
  ]);
  function go(path: "/" | "/policies" | "/finance" | "/account") {
    chat.closePanel();
    router.navigate(path);
  }
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        aria-hidden={blocking}
        importantForAccessibility={blocking ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {blocking && (
        <View
          ref={overlayRef}
          style={StyleSheet.absoluteFill}
          accessibilityViewIsModal
          role="dialog"
          aria-modal
          aria-label={t(
            chat.confirm
              ? "챗봇 종료 확인"
              : chat.disabledNotice
                ? "챗봇 다시 켜기 안내"
                : chat.panel === "menu"
                  ? "전체 메뉴"
                  : "챗봇 상담",
          )}
        >
          <View
            style={{ flex: 1 }}
            aria-hidden={chat.confirm || chat.disabledNotice}
            importantForAccessibility={
              chat.confirm || chat.disabledNotice
                ? "no-hide-descendants"
                : "auto"
            }
          >
            {chat.panel === "chat" && (
              <SafeAreaView style={styles.chat}>
                <View style={styles.header}>
                  <View style={styles.headerText}>
                    <Text
                      style={[styles.headerTitle, easy && { fontSize: 24 }]}
                    >
                      복지나침반 챗봇
                    </Text>
                    <Text
                      style={[styles.headerCaption, easy && { fontSize: 17 }]}
                    >
                      공고 원문에 따른 안내
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("상담창 접기")}
                    onPress={chat.closePanel}
                    style={styles.headerButton}
                  >
                    <Text style={styles.headerAction}>접기</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("챗봇 기능 끄기")}
                    onPress={chat.requestDisable}
                    style={styles.headerButton}
                  >
                    <Text style={styles.x}>×</Text>
                  </Pressable>
                </View>
                <KeyboardAvoidingView
                  style={{ flex: 1 }}
                  behavior={Platform.OS === "ios" ? "padding" : "height"}
                >
                  <AssistantChat />
                </KeyboardAvoidingView>
              </SafeAreaView>
            )}
            {chat.panel === "menu" && (
              <View style={styles.backdrop}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("메뉴 바깥을 눌러 닫기")}
                  onPress={chat.closePanel}
                  style={StyleSheet.absoluteFill}
                />
                <SafeAreaView style={styles.drawer}>
                  <View style={styles.header}>
                    <Text style={[styles.headerTitle, { flex: 1 }]}>
                      전체 메뉴
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("전체 메뉴 닫기")}
                      onPress={chat.closePanel}
                      style={styles.headerButton}
                    >
                      <Icon name="close" />
                    </Pressable>
                  </View>
                  <ScrollView contentContainerStyle={styles.menuContent}>
                    <View
                      style={[
                        styles.menuChat,
                        easy && {
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.easyLine,
                        },
                      ]}
                    >
                      <Copy title>궁금할 땐 챗봇</Copy>
                      <Copy muted>
                        {chat.enabled
                          ? "공고를 고르고 질문해 보세요."
                          : "여기서 챗봇을 다시 켤 수 있어요."}
                      </Copy>
                      <Button
                        label={chat.enabled ? "챗봇 상담" : "챗봇 다시 켜기"}
                        onPress={() => chat.openChat()}
                      />
                    </View>
                    <Button secondary label="홈으로" onPress={() => go("/")} />
                    <Button
                      secondary
                      label="복지 공고 찾기"
                      onPress={() => go("/policies")}
                    />
                    <Button
                      secondary
                      label="중위소득 계산기"
                      onPress={() => go("/finance")}
                    />
                    <Button
                      secondary
                      label="내 계정"
                      onPress={() => go("/account")}
                    />
                    <Button
                      secondary
                      label={easy ? "일반 화면으로 보기" : "쉬운 화면으로 보기"}
                      onPress={() => setEasy(!easy)}
                    />
                    <Copy muted>
                      상담창을 접거나 챗봇을 끄면 질문과 답변은 지워져요.
                    </Copy>
                  </ScrollView>
                </SafeAreaView>
              </View>
            )}
          </View>
          {(chat.confirm || chat.disabledNotice) && (
            <View style={[StyleSheet.absoluteFill, styles.dialogBackdrop]}>
              <SafeAreaView style={styles.dialogSafe}>
                <ScrollView contentContainerStyle={styles.dialogScroll}>
                  <View
                    style={[
                      styles.dialog,
                      easy && {
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: colors.easyLine,
                      },
                    ]}
                  >
                    <Copy title>
                      {chat.confirm
                        ? "챗봇 기능을 끄시겠습니까?"
                        : "챗봇을 껐어요"}
                    </Copy>
                    <Copy>하단의 ‘상담’을 누르면 다시 이용할 수 있어요.</Copy>
                    {chat.confirm ? (
                      <>
                        <Copy muted>현재 질문과 답변은 지워져요.</Copy>
                        <Button
                          secondary
                          label="계속 사용하기"
                          onPress={chat.cancelDisable}
                        />
                        <Button label="챗봇 끄기" onPress={chat.disable} />
                      </>
                    ) : (
                      <Button label="확인" onPress={chat.dismissNotice} />
                    )}
                  </View>
                </ScrollView>
              </SafeAreaView>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  launcher: {
    position: "absolute",
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bubble: {
    minHeight: 54,
    borderRadius: 20,
    flexDirection: "row",
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#FFF",
    elevation: 3,
  },
  bubbleLabel: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  dismiss: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  x: { fontSize: 29, color: colors.ink },
  chat: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FFF",
  },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  headerCaption: { color: colors.muted, fontSize: 12 },
  headerButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAction: { color: colors.green, fontSize: 16, fontWeight: "600" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(12,35,28,0.35)",
    alignItems: "flex-end",
  },
  drawer: {
    width: "90%",
    maxWidth: 380,
    flex: 1,
    backgroundColor: colors.paper,
  },
  menuContent: { padding: 18, gap: 14 },
  menuChat: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.mint,
    gap: 12,
  },
  dialogBackdrop: {
    backgroundColor: "rgba(12,35,28,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  dialogSafe: { width: "100%", maxWidth: 440, maxHeight: "100%" },
  dialogScroll: { padding: 20 },
  dialog: { backgroundColor: "#FFF", padding: 22, gap: 16, borderRadius: 24 },
});
