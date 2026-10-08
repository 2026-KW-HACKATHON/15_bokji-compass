import { useI18n } from "../../i18n/context";
import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { emptyVehicle } from "@bokji/core/finance-model";
import { financeGroups } from "@bokji/core/finance-flow";
import {
  Button,
  Card,
  Copy,
  Details,
  Notice,
  Screen,
  PageHeading,
  Toggle,
  colors,
} from "../../components/ui";
import { useRuntime, useSession } from "../../services/runtime";
import { createFinanceState } from "./state";
import { financeSections, reviewRows, validateSection } from "./flow";
import { QuickCalculator } from "./QuickCalculator";
import { QuestionFields } from "./FinanceFields";
import { FinanceResult } from "./FinanceResult";
import { financeError, questionTitle } from "./i18n";
import { Icon } from "../../components/Icon";

export default function FinanceScreen() {
  const { t, formatMoney } = useI18n();
  const { api, session, configError, easy } = useRuntime();
  const auth = useSession();
  const [form] = useState(() => createFinanceState(api));
  const state = useSyncExternalStore(
    form.subscribe,
    form.getSnapshot,
    form.getSnapshot,
  );
  const [consentedDraft, setConsentedDraft] = useState<unknown>(null);
  const consent = consentedDraft === state.draft;
  const setConsent = (value: boolean) =>
    setConsentedDraft(value ? state.draft : null);
  const [confirmation, setConfirmation] = useState<{
    action: "load" | "clear" | "delete";
    draft: unknown;
  } | null>(null);
  const confirm =
    confirmation?.draft === state.draft ? confirmation.action : null;
  const setConfirm = (action: "load" | "clear" | "delete" | null) =>
    setConfirmation(action ? { action, draft: state.draft } : null);
  const [validationKey, setValidationKey] = useState(0);
  useEffect(() => {
    void Promise.resolve(form.setIdentity(auth)).then((result) => {
      if (result?.unauthorized) void session.invalidate(result.unauthorized);
    });
  }, [form, auth, session]);
  useEffect(() => () => form.dispose(), [form]);
  const sections = financeSections(state.draft);
  const current = sections[state.step];
  function error(message: string) {
    form.message(message);
    setValidationKey((key) => key + 1);
  }
  function next() {
    const invalid = validateSection(current, state.draft);
    if (invalid) {
      error(financeError(invalid.message, t));
      return;
    }
    form.show("detail", state.step + 1);
  }
  async function run(action: string) {
    if (configError) return;
    if (action === "calculate" || action === "save") {
      for (const section of sections) {
        const invalid = validateSection(section, state.draft);
        if (invalid) {
          form.show("detail", section.index);
          error(financeError(invalid.message, t));
          return;
        }
      }
    }
    setConfirm(null);
    const result =
      action === "load"
        ? await form.load(true)
        : await form.run(action, consent);
    if (result?.unauthorized) void session.invalidate(result.unauthorized);
    if (action === "save") setConsent(false);
  }
  const protectedState =
    state.owner &&
    (auth.status !== "signedIn" || state.owner !== auth.user?.id);
  if (protectedState)
    return (
      <Screen>
        <Notice>로그인 상태를 확인하고 있어요.</Notice>
      </Screen>
    );
  return (
    <Screen key={`${state.view}:${state.step}:${validationKey}`}>
      <PageHeading
        title={
          state.view === "quick"
            ? "우리 집 소득 기준 알아보기"
            : state.view === "result"
              ? "계산 결과를 확인하세요"
              : state.step === 5
                ? "입력한 내용을 확인해 주세요"
                : t("{section} 정보를 알려주세요", {
                    section: t(current.title),
                  })
        }
        eyebrow={
          state.view === "quick" ? "중위소득 빠른 확인" : "소득·재산 상세 계산"
        }
        description={
          state.view === "quick"
            ? "가구원 수만 선택하면 기준 금액이 바로 나와요."
            : state.view === "result"
              ? undefined
              : "모르는 정보는 모름으로 남겨두어도 괜찮아요."
        }
      />
      {configError && <Notice>{configError}</Notice>}
      <View
        style={{
          flexDirection: easy ? "column" : "row",
          backgroundColor: "#E7ECF5",
          borderRadius: easy ? 8 : 16,
          padding: 4,
          gap: 4,
        }}
      >
        {[
          ["quick", "빠른 확인"],
          ["detail", "상세 계산"],
        ].map(([view, label]) => (
          <Pressable
            key={view}
            accessibilityRole="button"
            accessibilityState={{
              selected:
                view === "quick"
                  ? state.view === "quick"
                  : state.view !== "quick",
              disabled: state.busy,
            }}
            disabled={state.busy}
            onPress={() => form.show(view)}
            style={{
              flex: easy ? undefined : 1,
              flexDirection: "row",
              gap: 8,
              minHeight: easy ? 58 : 48,
              padding: 10,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: (
                view === "quick"
                  ? state.view === "quick"
                  : state.view !== "quick"
              )
                ? "#FFF"
                : "transparent",
              borderRadius: easy ? 6 : 12,
            }}
          >
            {(view === "quick" ? state.view === "quick" : state.view !== "quick") && <Icon name="check" size={22} color={colors.green} />}
            <Text
              style={{
                fontSize: easy ? 20 : 16,
                color: colors.ink,
                fontWeight: "700",
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {state.prefill === "loading" && (
        <Notice>저장한 소득·재산 정보를 불러오고 있어요.</Notice>
      )}
      {state.message && <Notice>{state.message}</Notice>}
      {state.prefill === "error" && (
        <Button
          secondary
          label="저장 정보 다시 불러오기"
          onPress={() => {
            void form.load().then((result) => {
              if (result?.unauthorized)
                void session.invalidate(result.unauthorized);
            });
          }}
        />
      )}
      {state.view === "quick" ? (
        <QuickCalculator
          draft={state.quick}
          onChange={form.editQuick}
          onDetail={() => form.show("detail")}
          onMessage={form.message}
        />
      ) : state.view === "result" && state.result ? (
        <>
          <FinanceResult result={state.result} onMessage={form.message} />
          <Button
            secondary
            label="입력 내용 확인·수정"
            onPress={() => form.show("detail", 5)}
          />
          {auth.status === "signedIn" && (
            <Card>
              <Toggle
                label="입력한 금융정보를 내 계정에 저장하는 데 동의합니다."
                accessibilityLabel={t("금융정보 계정 저장 동의")}
                value={consent}
                onValueChange={setConsent}
                disabled={state.busy}
              />
              <Button
                label="내 계정에 저장"
                disabled={!consent || !!configError}
                busy={state.busy}
                onPress={() => {
                  void run("save");
                }}
              />
            </Card>
          )}
        </>
      ) : (
        <>
          <View style={{ gap: 10 }}>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel={t("상세 계산 진행")}
              accessibilityValue={{ min: 1, max: 6, now: state.step + 1 }}
              style={{
                height: 6,
                borderRadius: 4,
                backgroundColor: "#DDE5F2",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  backgroundColor: colors.green,
                  height: "100%",
                  width: `${((state.step + 1) / 6) * 100}%`,
                }}
              />
            </View>
            <ScrollView
              horizontal={!easy}
              showsHorizontalScrollIndicator={!easy}
              contentContainerStyle={{ gap: 8, ...(easy ? { flexDirection: "row", flexWrap: "wrap" } : {}) }}
            >
              {financeGroups.map((group: string, i: number) => (
                <Pressable
                  key={group}
                  accessibilityRole="button"
                  accessibilityLabel={t("{step}단계 {group}", {
                    step: i + 1,
                    group: t(group),
                  })}
                  accessibilityState={{
                    selected: state.step === i,
                    disabled: i > state.step || state.busy,
                  }}
                  disabled={i > state.step || state.busy}
                  onPress={() => form.show("detail", i)}
                  style={{
                    minHeight: easy ? 56 : 46,
                    paddingVertical: 10,
                    maxWidth: "100%",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    justifyContent: "center",
                    borderRadius: easy ? 6 : 12,
                    borderWidth: easy && i === state.step ? 2 : 0,
                    borderColor: colors.green,
                    backgroundColor:
                      i === state.step ? colors.mint : "transparent",
                  }}
                >
                  {easy && i < state.step && <Icon name="check" size={20} color={colors.green} />}
                  <Text
                    style={{
                      color: i === state.step ? colors.green : colors.muted,
                      fontSize: easy ? 18 : 14,
                      fontWeight: i === state.step ? "700" : "500",
                    }}
                  >
                    {i + 1} {t(group)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Copy muted>
              {t("{step} / 6단계 · 금액은 만원 단위", { step: state.step + 1 })}
            </Copy>
          </View>
          {state.step === 5 ? (
            <>
              {sections.map((section) => (
                <Card key={section.index}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Copy title>
                        {t("{section} 정보", { section: t(section.title) })}
                      </Copy>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("{section} 정보 수정", {
                        section: t(section.title),
                      })}
                      onPress={() => form.show("detail", section.index)}
                      style={{ minHeight: 48, padding: 12 }}
                    >
                      <Text
                        style={{
                          color: colors.green,
                          fontWeight: "700",
                          fontSize: easy ? 19 : 15,
                        }}
                      >
                        수정
                      </Text>
                    </Pressable>
                  </View>
                  <Details
                    collapsible
                    label={t("{section} 입력 내역 펼치기", {
                      section: t(section.title),
                    })}
                  >
                    {reviewRows(section, state.draft, { t, formatMoney }).map(
                      (row: { key: string; label: string; value: string }) => (
                        <View
                          key={row.key}
                          style={{
                            gap: 5,
                            paddingVertical: 8,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.line,
                          }}
                        >
                          <Copy muted>{row.label}</Copy>
                          <Copy>{row.value}</Copy>
                        </View>
                      ),
                    )}
                  </Details>
                </Card>
              ))}
            </>
          ) : (
            current.questions.map((question) => (
              <Card key={question.id}>
                <Text
                  accessibilityRole="header"
                  style={{
                    fontSize: easy ? 23 : 19,
                    lineHeight: easy ? 33 : 28,
                    fontWeight: "700",
                    color: colors.ink,
                  }}
                >
                  {questionTitle(question, state.draft, t)}
                </Text>
                <QuestionFields
                  question={question}
                  draft={state.draft}
                  edit={form.edit}
                  busy={state.busy}
                />
                {question.id === "vehicles" &&
                  state.draft.vehicle_status === "owned" && (
                    <View style={{ gap: 12 }}>
                      <Copy>
                        {t("차량 {count}대", {
                          count: state.draft.vehicles.length,
                        })}
                      </Copy>
                      {state.draft.vehicles.length > 1 &&
                        state.draft.vehicles.map(
                          (_: unknown, index: number) => (
                            <Button
                              key={index}
                              secondary
                              label={t("차량 {index} 삭제", {
                                index: index + 1,
                              })}
                              disabled={state.busy}
                              onPress={() =>
                                form.edit(
                                  "vehicles",
                                  state.draft.vehicles.filter(
                                    (__: unknown, i: number) => i !== index,
                                  ),
                                )
                              }
                            />
                          ),
                        )}
                      <Button
                        secondary
                        label="차량 한 대 추가"
                        disabled={
                          state.busy || state.draft.vehicles.length >= 10
                        }
                        onPress={() =>
                          form.edit("vehicles", [
                            ...state.draft.vehicles,
                            emptyVehicle(),
                          ])
                        }
                      />
                    </View>
                  )}
              </Card>
            ))
          )}
          <View style={{ gap: 10 }}>
            <Button
              label={
                state.step === 5
                  ? "참고 금액 계산하기"
                  : t("다음 · {section}", {
                      section: t(financeGroups[state.step + 1]),
                    })
              }
              busy={state.busy}
              disabled={!!configError && state.step === 5}
              onPress={() =>
                state.step === 5 ? void run("calculate") : next()
              }
            />
            {state.step > 0 && (
              <Button
                secondary
                label="이전 단계"
                disabled={state.busy}
                onPress={() => form.show("detail", state.step - 1)}
              />
            )}
          </View>
        </>
      )}
      <Details collapsible label="입력·저장 정보 관리">
        <Copy muted>
          {auth.status === "signedIn"
            ? "저장 정보는 자동으로 불러옵니다. 수정 내용은 동의 후 저장 버튼을 눌러야 계정에 반영돼요."
            : "로그인 없이 계산할 수 있어요. 입력 내용은 앱을 종료하면 사라집니다."}
        </Copy>
        {auth.status === "signedIn" && (
          <>
            <Button
              secondary
              label="저장한 정보로 다시 불러오기"
              disabled={state.busy}
              onPress={() => setConfirm("load")}
            />
            <Button
              secondary
              label="계정에 저장한 정보 삭제"
              disabled={state.busy}
              onPress={() => setConfirm("delete")}
            />
          </>
        )}
        <Button
          secondary
          label="화면 입력 지우기"
          disabled={state.busy}
          onPress={() => setConfirm("clear")}
        />
      </Details>
      {confirm && (
        <Card>
          <Copy title>
            {confirm === "delete"
              ? "저장 정보를 삭제할까요?"
              : confirm === "clear"
                ? "화면 입력을 지울까요?"
                : "저장한 정보로 바꿀까요?"}
          </Copy>
          <Copy>
            {confirm === "clear"
              ? "계정에 저장한 정보는 유지됩니다."
              : confirm === "delete"
                ? "계정에 저장한 금융정보와 현재 입력이 삭제됩니다."
                : "작성 중인 입력을 저장한 정보로 바꿉니다."}
          </Copy>
          <Button
            label="확인"
            busy={state.busy}
            onPress={() => {
              if (confirm === "clear") {
                form.clear();
                setConfirm(null);
              } else void run(confirm);
            }}
          />
          <Button secondary label="취소" onPress={() => setConfirm(null)} />
        </Card>
      )}
    </Screen>
  );
}
