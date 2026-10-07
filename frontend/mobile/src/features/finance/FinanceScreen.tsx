import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Switch, View } from "react-native";
import {
  emptyFinancialProfile,
  emptyVehicle,
  formatMoney,
  moneyInput,
  moneyInputValue,
  officialSourceUrl,
} from "@bokji/core/finance-model";
import {
  fieldValue,
  financeGroups,
  financeQuestions,
  validateQuestion,
  visibleFields,
} from "@bokji/core/finance-flow";
import {
  Button,
  Card,
  Copy,
  Details,
  Field,
  Notice,
  Screen,
  colors,
} from "../../components/ui";
import { useRuntime, useSession } from "../../services/runtime";
import { updateDraft } from "./draft";

type Draft = ReturnType<typeof updateDraft>;
type Calculation = {
  reference_year: number;
  rules_version: string;
  median: {
    monthly_income: number | null;
    ratio_percent: number | null;
    base: number | null;
  };
  assets: { gross_total: number | null; net_total: number | null };
  assessments: {
    rule_id: string;
    label: string;
    status: string;
    notes: string[];
    missing: string[];
    checks: {
      label: string;
      value: number | null;
      limit: number | null;
      state: string;
    }[];
    breakdown: { label: string; amount: number | null }[];
  }[];
  notes: string[];
  sources: { title: string; url: string }[];
};
type FormField = {
  path: string;
  label: string;
  type: string;
  hint?: string;
  unit?: string;
  options?: [string | number, string][];
};

export default function FinanceScreen() {
  const { api, session, configError, easy } = useRuntime();
  const auth = useSession();
  const [draft, setDraft] = useState<Draft>(emptyFinancialProfile);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Calculation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "delete" | "load" | "clear" | null
  >(null);
  const [pendingEdit, setPendingEdit] = useState<{
    path: string;
    value: unknown;
  } | null>(null);
  const current = useRef<AbortController | null>(null);
  const questions = financeQuestions(draft);
  const question = questions[Math.min(index, questions.length - 1)];
  useEffect(
    () => () => {
      current.current?.abort();
    },
    [],
  );
  function edit(path: string, value: unknown) {
    if (busy) return;
    if (
      (path === "household_size" && Number(value) < draft.members.length) ||
      (path === "vehicle_status" && value !== "owned" && draft.vehicles.length)
    ) {
      setPendingEdit({ path, value });
      return;
    }
    applyEdit(path, value);
  }
  function applyEdit(path: string, value: unknown) {
    setDraft(updateDraft(draft, path, value));
    setResult(null);
    setConsent(false);
    setMessage("");
    setPendingEdit(null);
  }
  async function run(action: "calculate" | "load" | "save" | "delete") {
    if (busy || configError) return;
    const token = auth.token;
    if (action !== "calculate" && (!token || auth.status !== "signedIn"))
      return;
    const controller = new AbortController();
    current.current?.abort();
    current.current = controller;
    setBusy(true);
    setMessage("");
    setConfirmation(null);
    try {
      if (action === "calculate") {
        const calculation = await api.calculate(draft, controller.signal);
        if (!controller.signal.aborted) {
          setResult(calculation);
          setMessage("참고 계산을 완료했습니다.");
        }
      } else if (action === "delete") {
        await api.deleteProfile(token, controller.signal);
        if (!controller.signal.aborted) {
          setDraft(emptyFinancialProfile());
          setResult(null);
          setConsent(false);
          setIndex(0);
          setMessage("계정에 저장한 금융정보와 화면의 입력을 삭제했습니다.");
        }
      } else {
        const data =
          action === "load"
            ? await api.getProfile(token, controller.signal)
            : await api.saveProfile(token, draft, consent, controller.signal);
        if (!controller.signal.aborted) {
          if (data.profile) {
            setDraft(data.profile);
            setResult(data.calculation);
            setConsent(false);
            setIndex(0);
          }
          setMessage(
            !data.profile
              ? "계정에 저장한 정보가 없습니다. 현재 입력은 유지했습니다."
              : action === "load"
                ? "저장한 정보를 불러왔습니다."
                : "내 계정에 저장했습니다.",
          );
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessage((error as Error).message);
        if ((error as { status?: number }).status === 401 && token)
          void session.invalidate(token);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function next() {
    const invalid = validateQuestion(question, draft);
    if (invalid) {
      setMessage(invalid.message);
      return;
    }
    setIndex(Math.min(index + 1, questions.length - 1));
    setMessage("");
  }
  function renderField(field: FormField) {
    const value = fieldValue(draft, field.path);
    if (field.type === "check")
      return (
        <View key={field.path} style={{ gap: 8 }}>
          <Copy>{field.label}</Copy>
          <Switch
            accessibilityLabel={field.label}
            disabled={busy}
            value={value === true}
            onValueChange={(v) => edit(field.path, v)}
            trackColor={{ true: colors.green }}
          />
        </View>
      );
    if (field.type === "select")
      return (
        <View key={field.path} style={{ gap: 8 }}>
          <Copy>{field.label}</Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {field.options?.map(([key, label]) => (
              <Pressable
                key={key}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: String(value) === String(key),
                  disabled: busy,
                }}
                disabled={busy}
                onPress={() => edit(field.path, key)}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.green,
                  backgroundColor:
                    String(value) === String(key) ? colors.mint : "#FFF",
                }}
              >
                <Copy>{label}</Copy>
              </Pressable>
            ))}
          </View>
          {field.hint ? (
            <Details
              label="입력 도움말"
              accessibilityLabel={`${field.label} 도움말`}
            >
              <Copy muted>{field.hint}</Copy>
            </Details>
          ) : null}
        </View>
      );
    return (
      <View key={field.path} style={{ gap: 6 }}>
        <Field
          label={`${field.label} (${field.type === "money" ? "만원" : field.unit || "숫자"})`}
          value={
            field.type === "money"
              ? moneyInputValue(value)
              : value == null
                ? ""
                : String(value)
          }
          placeholder="모르면 비워두세요"
          keyboardType={field.type === "money" ? "decimal-pad" : "number-pad"}
          editable={!busy}
          onChangeText={(text) =>
            edit(field.path, field.type === "money" ? moneyInput(text) : text)
          }
        />
        {field.hint ? (
          <Details
            label="입력 도움말"
            accessibilityLabel={`${field.label} 도움말`}
          >
            <Copy muted>{field.hint}</Copy>
          </Details>
        ) : null}
      </View>
    );
  }
  return (
    <Screen>
      <Copy title>중위소득 계산기</Copy>
      <Copy muted>
        {easy
          ? "금액은 만원 단위예요.\n모르면 빈칸 · 없으면 0"
          : "모르는 금액은 빈칸, 없는 금액은 0으로 입력해 주세요. 모든 금액 입력은 만원 단위입니다."}
      </Copy>
      {configError ? <Notice>{configError}</Notice> : null}
      {auth.status === "signedIn" ? (
        <Details label="저장한 정보 관리">
          <Card>
            <Copy>내 계정의 금융정보</Copy>
            <Button
              secondary
              label="저장한 정보 불러오기"
              disabled={busy}
              onPress={() => setConfirmation("load")}
            />
            <Button
              secondary
              label="계정에 저장한 정보 삭제"
              disabled={busy}
              onPress={() => setConfirmation("delete")}
            />
          </Card>
        </Details>
      ) : (
        <Details label="계산·저장 안내">
          <Notice>
            로그인 없이 계산할 수 있어요. 입력한 정보는 앱을 종료하면
            사라집니다.
          </Notice>
        </Details>
      )}
      {confirmation ? (
        <Card>
          <Copy>
            {confirmation === "delete"
              ? "계정에 저장한 금융정보와 현재 입력을 삭제할까요?"
              : confirmation === "clear"
                ? "이 화면의 입력만 지울까요? 계정에 저장한 정보는 유지됩니다."
                : "계정에 저장한 정보로 현재 입력을 바꿀까요?"}
          </Copy>
          <Button
            label={
              confirmation === "delete"
                ? "저장 정보 삭제하기"
                : confirmation === "load"
                  ? "불러오기"
                  : "화면 입력 지우기"
            }
            disabled={busy}
            onPress={() => {
              if (confirmation === "clear") {
                setDraft(emptyFinancialProfile());
                setResult(null);
                setConsent(false);
                setIndex(0);
                setConfirmation(null);
                setMessage("화면 입력을 지웠습니다.");
              } else void run(confirmation);
            }}
          />
          <Button
            secondary
            label="취소"
            disabled={busy}
            onPress={() => setConfirmation(null)}
          />
        </Card>
      ) : null}
      {pendingEdit ? (
        <Card>
          <Copy>
            제외되는 가구원 또는 차량의 입력 정보가 지워집니다. 변경할까요?
          </Copy>
          <Button
            label="변경하기"
            onPress={() => applyEdit(pendingEdit.path, pendingEdit.value)}
          />
          <Button
            secondary
            label="유지하기"
            onPress={() => setPendingEdit(null)}
          />
        </Card>
      ) : null}
      <Card>
        <Copy muted>
          {financeGroups[question.group]} · {index + 1} / {questions.length}
        </Copy>
        <Copy title>{question.title}</Copy>
        {visibleFields(question, draft).map((field: FormField) =>
          renderField(field),
        )}
        {question.id === "vehicles" && draft.vehicle_status === "owned" ? (
          <>
            <Copy>차량 {draft.vehicles.length}대</Copy>
            <Button
              secondary
              label="차량 한 대 추가"
              disabled={busy || draft.vehicles.length >= 10}
              onPress={() => {
                setDraft({
                  ...draft,
                  vehicles: [...draft.vehicles, emptyVehicle()],
                });
                setResult(null);
                setConsent(false);
              }}
            />
            <Details label="차량 수정 도움말">
              <Copy muted>
                차량 정보를 다시 입력하려면 보유 여부를 없음으로 바꾼 뒤 다시
                선택해 주세요.
              </Copy>
            </Details>
          </>
        ) : null}
        <Button
          secondary
          label="이전"
          disabled={busy || index === 0}
          onPress={() => {
            setIndex(index - 1);
            setMessage("");
          }}
        />
        {index < questions.length - 1 ? (
          <Button
            label="다음"
            disabled={busy || !!pendingEdit}
            onPress={next}
          />
        ) : (
          <Button
            label="참고 금액 계산하기"
            disabled={!!configError || !!pendingEdit}
            busy={busy}
            onPress={() => void run("calculate")}
          />
        )}
      </Card>
      {busy ? <Notice>요청을 처리하고 있어요.</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {result ? (
        <>
          <Card>
            <Copy title>계산 결과</Copy>
            <Copy>
              {result.reference_year}년 기준
              {!easy ? ` · ${result.rules_version}` : ""}
            </Copy>
            <Copy>
              입력한 월 소득 합계: {formatMoney(result.median.monthly_income)}
            </Copy>
            <Copy>
              기준 중위소득 대비:{" "}
              {result.median.ratio_percent === null
                ? "확인 필요"
                : `${result.median.ratio_percent}%`}
            </Copy>
            {result.median.monthly_income === null ? (
              <Copy muted>
                소득 합계와 비율은 가구원별 금액이 모두 확인될 때 표시합니다. 모르는 소득은 0원으로
                계산하지 않으므로 전체 합계가 확인 필요로 표시될 수 있어요.
              </Copy>
            ) : null}
            {result.median.monthly_income !== null &&
            result.median.ratio_percent === null ? (
              <Copy muted>
                입력한 금액의 합계는 표시했지만, 해당 연도의 기준 중위소득이 등록되지 않아 비율을
                계산하지 않았어요.
              </Copy>
            ) : null}
            <Copy>
              차량 포함 재산: {formatMoney(result.assets.gross_total)}
            </Copy>
            <Copy muted>
              {easy
                ? "참고용 계산입니다. 신청 자격은 공식 공고에서 확인하세요."
                : "중위소득 비율은 입력 금액을 이용한 단순 참고값으로, 실제 세전 소득이나 사업별 소득인정액과 다를 수 있습니다. 신청 자격은 공식 공고와 담당 기관에서 확인해 주세요."}
            </Copy>
          </Card>
          {result.assessments.map((item) => (
            <Card key={item.rule_id}>
              <Copy title>{item.label}</Copy>
              <Copy>
                {item.status === "estimated"
                  ? "입력값으로 추정"
                  : "추가 확인 필요"}
              </Copy>
              {item.checks.map((check, i) => (
                <Copy key={i}>
                  {check.label}:{" "}
                  {check.state === "within"
                    ? "입력값은 기준 이내"
                    : check.state === "over"
                      ? "입력값은 기준 초과"
                      : "확인 필요"}
                  {"\n"}계산값 {formatMoney(check.value)} / 기준{" "}
                  {formatMoney(check.limit)}
                </Copy>
              ))}
              {[...item.missing, ...item.notes].map((note, i) => (
                <Copy key={i} muted>
                  • {note}
                </Copy>
              ))}
              <Details
                label="계산 내역 보기"
                accessibilityLabel={`${item.label} 계산 내역`}
              >
                {item.breakdown.map((part, i) => (
                  <Copy key={i} muted>
                    {part.label}: {formatMoney(part.amount)}
                  </Copy>
                ))}
              </Details>
            </Card>
          ))}
          <Card>
            {result.notes.map((note, i) => (
              <Copy key={i}>{note}</Copy>
            ))}
            <Details label="공식 출처 보기">
              <Copy title>공식 출처</Copy>
              {result.sources.map((source, i) => {
                const url = officialSourceUrl(source.url);
                return url ? (
                  <Button
                    key={i}
                    secondary
                    label={source.title}
                    onPress={() => {
                      void Linking.openURL(url).catch(() =>
                        setMessage("공식 안내를 열지 못했습니다."),
                      );
                    }}
                  />
                ) : (
                  <Copy key={i}>{source.title}</Copy>
                );
              })}
            </Details>
          </Card>
          {auth.status === "signedIn" ? (
            <Card>
              <Copy>입력한 금융정보를 내 계정에 저장하는 데 동의합니다.</Copy>
              <Switch
                accessibilityLabel="금융정보 계정 저장 동의"
                disabled={busy}
                value={consent}
                onValueChange={setConsent}
                trackColor={{ true: colors.green }}
              />
              <Button
                label="내 계정에 저장"
                disabled={!consent || !!configError}
                busy={busy}
                onPress={() => void run("save")}
              />
            </Card>
          ) : null}
        </>
      ) : null}
      <Button
        secondary
        label="이 화면의 입력 지우기"
        disabled={busy}
        onPress={() => setConfirmation("clear")}
      />
    </Screen>
  );
}
