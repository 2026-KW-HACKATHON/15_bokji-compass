import { useCallback, useState } from "react";
import { Keyboard, Linking, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Button,
  Card,
  Copy,
  Details,
  Field,
  Notice,
  useScreenStep,
} from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import { safeSourceUrl } from "../policies/model";
import { CandidateCard, Consent } from "./controls";
import { confirmedFacts } from "./dialogueModel";
import { Dialogue, Snapshot } from "./types";
import { useTask } from "./useTask";

export function GuidedConversation({
  token,
  initialQuestion = "",
  onSaved,
  onClose,
}: {
  token: string;
  initialQuestion?: string;
  onSaved: (value: Snapshot) => void;
  onClose: () => void;
}) {
  const { api } = useRuntime();
  const { busy, error, setError, run, cancel } = useTask();
  const [question, setQuestion] = useState(initialQuestion);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [input, setInput] = useState("");
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState("");
  const [history, setHistory] = useState<
    { question: string; answer: string }[]
  >([]);
  const [limit, setLimit] = useState(3);
  useScreenStep(history.length);
  useFocusEffect(
    useCallback(
      () => () => {
        cancel();
        setConsent(false);
      },
      [cancel],
    ),
  );
  function receive(value: Dialogue, label: string) {
    Keyboard.dismiss();
    setDialogue(value);
    setHistory((old) => [...old, { question: label, answer: value.answer }]);
    if (value.answer_accepted !== false) setInput("");
    setConsent(false);
    setSaved("");
    setLimit(3);
  }
  function start() {
    if (!question.trim() || busy) return;
    run(
      (signal) =>
        api.dialogue.start(question, { token, signal, revisionId: undefined }),
      (value) => receive(value, question.trim()),
    );
  }
  const follow = dialogue?.follow_up;
  function answer(value: string | number | boolean | null, label: string) {
    if (!dialogue || !follow) return;
    run(
      (signal) =>
        api.dialogue.answer(dialogue.continuation, follow.slot, value, {
          token,
          signal,
        }),
      (next) => receive(next, `${follow.question} → ${label}`),
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <Button
        secondary
        label="지원 현황으로 돌아가기"
        onPress={() => {
          cancel();
          Keyboard.dismiss();
          onClose();
        }}
      />
      <Card>
        <Copy title>내 상황을 더 알려주세요</Copy>
        <Copy muted>
          모르는 정보는 건너뛰어도 괜찮아요. 확인한 정보는 동의 후에만 저장해요.
        </Copy>
        {!dialogue ? (
          <>
            <Field
              label="어떤 도움이 필요하세요?"
              value={question}
              onChangeText={setQuestion}
              multiline
              maxLength={2000}
              editable={!busy}
              placeholder="예: 집수리 비용 지원을 알아보고 싶어요"
            />
            <Copy muted>이름·전화번호·정확한 주소는 적지 마세요.</Copy>
            <Button
              label="대화 시작하기"
              disabled={busy || !question.trim()}
              busy={busy}
              onPress={start}
            />
          </>
        ) : (
          <>
            {history.length > 1 && (
              <Details collapsible label={`이전 대화 ${history.length - 1}개`}>
                {history.slice(0, -1).map((entry, index) => (
                  <View key={index} style={{ gap: 8 }}>
                    <Copy>{entry.question}</Copy>
                    <Copy muted>{entry.answer}</Copy>
                  </View>
                ))}
              </Details>
            )}
            <Copy muted>{history.at(-1)?.question}</Copy>
            {!!dialogue.practical_steps.length && (
              <>
                <Copy title>먼저 이렇게 해보세요</Copy>
                {dialogue.practical_steps.map((step, index) => (
                  <Copy key={index}>
                    {index + 1}. {step}
                  </Copy>
                ))}
              </>
            )}
            <Copy>{dialogue.answer}</Copy>
            {dialogue.catalog_status === "unavailable" && (
              <Notice>
                공고 정보를 확인하지 못했어요. 아래 안내와 추가 질문을 먼저
                확인해 주세요.
              </Notice>
            )}
            {follow && (
              <View style={{ gap: 10 }}>
                <Copy title>{follow.question}</Copy>
                {follow.input_type === "select" ? (
                  follow.options.map((option, index) => (
                    <Button
                      key={index}
                      secondary
                      label={option.label}
                      disabled={busy}
                      onPress={() => answer(option.value, option.label)}
                    />
                  ))
                ) : (
                  <>
                    <Field
                      label={follow.question}
                      value={input}
                      onChangeText={setInput}
                      editable={!busy}
                      maxLength={
                        follow.input_type === "number"
                          ? 4
                          : follow.input_type === "date"
                            ? 10
                            : 2000
                      }
                      keyboardType={
                        follow.input_type === "number"
                          ? "number-pad"
                          : "default"
                      }
                      placeholder={
                        follow.input_type === "date"
                          ? "YYYY-MM-DD"
                          : follow.input_type === "number"
                            ? "예: 1995"
                            : "답변을 입력해 주세요"
                      }
                    />
                    <Button
                      label="답변 보내기"
                      disabled={busy || !input.trim()}
                      onPress={() => answer(input.trim(), input.trim())}
                    />
                  </>
                )}
                <Button
                  secondary
                  label="모르겠어요 · 건너뛰기"
                  disabled={busy}
                  onPress={() => answer(null, "모르겠어요")}
                />
              </View>
            )}
            {!!dialogue.missing_fields.length && (
              <Details collapsible label="앞으로 확인할 정보">
                {dialogue.missing_fields.map((field) => (
                  <Copy key={field.slot}>• {field.label}</Copy>
                ))}
              </Details>
            )}
            {!!dialogue.source_links.length && (
              <Details collapsible label="안내 근거 보기">
                {dialogue.source_links.map((link, index) => (
                  <Button
                    key={index}
                    secondary
                    label={link.label}
                    onPress={() => {
                      const url = safeSourceUrl(link.url);
                      if (url)
                        void Linking.openURL(url).catch(() =>
                          setError("링크를 열지 못했어요."),
                        );
                    }}
                  />
                ))}
              </Details>
            )}
            {dialogue.can_save_profile && (
              <View style={{ gap: 12 }}>
                <Copy title>확인한 내 정보</Copy>
                {confirmedFacts(dialogue).map(
                  (fact: {
                    field: string;
                    label: string;
                    value: string | number;
                  }) => (
                    <Copy key={fact.field}>
                      {fact.label} · {fact.value}
                    </Copy>
                  ),
                )}
                <Consent
                  label="위 내용을 확인했으며 내 계정에 저장하는 데 동의해요."
                  value={consent}
                  disabled={busy}
                  onChange={setConsent}
                />
                <Button
                  label="확인한 정보 저장"
                  disabled={busy || !consent}
                  onPress={() =>
                    run(
                      (signal) =>
                        api.dialogue.save(dialogue.continuation, {
                          token,
                          signal,
                          consent,
                          confirmed: true,
                        }),
                      (value) => {
                        setConsent(false);
                        setSaved(
                          "확인한 정보를 저장했어요. 지원 현황에 반영했어요.",
                        );
                        onSaved(value as Snapshot);
                      },
                    )
                  }
                />
              </View>
            )}
            {saved && <Notice>{saved}</Notice>}
            <Button
              secondary
              label="새 대화 시작"
              disabled={busy}
              onPress={() => {
                setDialogue(null);
                setHistory([]);
                setQuestion("");
                setInput("");
                setConsent(false);
                setSaved("");
                setError("");
              }}
            />
          </>
        )}
        {error && <Notice>{error}</Notice>}
        {busy && (
          <>
            <Notice>내용을 확인하고 있어요.</Notice>
            <Button secondary label="요청 취소" onPress={cancel} />
          </>
        )}
        <Copy muted>
          안내는 신청 자격 확정이 아니에요. 공식 공고와 담당 기관에서 확인해
          주세요.
        </Copy>
      </Card>
      {dialogue?.selected_policy && (
        <Card>
          <Copy title>선택한 공고의 조건 비교</Copy>
          {dialogue.selected_policy.comparison.notes.map((note, index) => (
            <Copy key={index}>{note}</Copy>
          ))}
          <Details collapsible label="비교 근거 보기">
            {dialogue.selected_policy.comparison.checks.map((check, index) => (
              <View key={index} style={{ gap: 8 }}>
                <Copy>
                  {check.label} ·{" "}
                  {check.state === "match"
                    ? "조건 일치"
                    : check.state === "mismatch"
                      ? "조건 불일치"
                      : "추가 확인"}
                </Copy>
                <Copy>{check.note}</Copy>
                {!!check.quote && <Copy muted>{check.quote}</Copy>}
              </View>
            ))}
          </Details>
        </Card>
      )}
      {!!dialogue?.candidates.length && (
        <>
          <Copy title>함께 확인할 지원 공고</Copy>
          {dialogue.candidates.slice(0, limit).map((item) => (
            <CandidateCard
              key={`${item.need_id}:${item.policy_id}`}
              item={item}
            />
          ))}
          {dialogue.candidates.length > limit && (
            <Button
              secondary
              label="지원 후보 더 보기"
              onPress={() => setLimit((old) => old + 3)}
            />
          )}
        </>
      )}
    </View>
  );
}
