import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Button, Card, Copy, Field, Notice, colors } from "../../components/ui";
import { useRuntime, useSession } from "../../services/runtime";
import { useAssistant } from "./context";
import { parseAnswer, parseFaqs } from "./model";
import { parsePolicyPage } from "../policies/model";

type Answer = ReturnType<typeof parseAnswer>;
type Faqs = ReturnType<typeof parseFaqs>;

export function AssistantChat() {
  const { policy, choosePolicy, closePanel } = useAssistant();
  const { configError, easy } = useRuntime();
  const auth = useSession();
  const scroll = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.page}
    >
      <View style={styles.welcome}>
        <Copy title>어떤 공고가 궁금하세요?</Copy>
        <Copy>
          {easy
            ? "공고를 고르고 질문해 주세요."
            : "준비된 질문을 고르거나 직접 물어보세요. 공고 원문을 바탕으로 안내해 드려요."}
        </Copy>
      </View>
      {configError ? (
        <Notice>{configError}</Notice>
      ) : auth.status !== "signedIn" || !auth.token ? (
        <Card>
          <Copy>로그인하면 웹과 같은 공고 상담을 이용할 수 있어요.</Copy>
          <Button
            label="로그인하러 가기"
            onPress={() => {
              closePanel();
              router.navigate("/account");
            }}
          />
        </Card>
      ) : !policy ? (
        <PolicyChooser />
      ) : (
        <>
          <View style={styles.selected}>
            <Text style={styles.tag}>상담 중인 공고</Text>
            <Copy>{policy.title}</Copy>
            <Button
              secondary
              label="다른 공고 선택"
              onPress={() => choosePolicy(null)}
            />
          </View>
          {!policy.revisionId ? (
            <Notice>
              최신 공고를 다시 선택해 주세요. 이 공고의 질문 정보를 확인할 수
              없어요.
            </Notice>
          ) : (
            <QuestionPanel
              key={`${auth.user?.id}:${auth.token}:${policy.revisionId}`}
              token={auth.token}
              revisionId={policy.revisionId}
              onAnswer={() => {
                Keyboard.dismiss();
                scroll.current?.scrollTo({ y: 0, animated: false });
              }}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

function PolicyChooser() {
  const { api } = useRuntime();
  const { choosePolicy } = useAssistant();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [retry, setRetry] = useState(0);
  const cursor = cursors[cursors.length - 1];
  const key = JSON.stringify([search, cursor, retry]);
  const [result, setResult] = useState<{
    key: string;
    page?: ReturnType<typeof parsePolicyPage>;
    error?: string;
  } | null>(null);
  const current = result?.key === key ? result : null;
  useEffect(() => {
    const controller = new AbortController();
    api
      .listPolicies({ query: search, cursor, limit: 6 }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ key, page });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: error.message });
      });
    return () => controller.abort();
  }, [api, search, cursor, key]);
  function submit() {
    setSearch(query.trim());
    setCursors([null]);
    setRetry((value) => value + 1);
    Keyboard.dismiss();
  }
  return (
    <View style={{ gap: 12 }}>
      <Field
        label="상담할 공고 검색"
        placeholder="공고 이름이나 관심 단어"
        value={query}
        onChangeText={setQuery}
        maxLength={200}
        returnKeyType="search"
        onSubmitEditing={submit}
      />
      <Button label="공고 검색" onPress={submit} />
      {!current ? (
        <Notice>공고를 가져오고 있어요.</Notice>
      ) : current.error ? (
        <>
          <Notice>{current.error}</Notice>
          <Button
            secondary
            label="공고 다시 불러오기"
            onPress={() => setRetry((value) => value + 1)}
          />
        </>
      ) : (
        <>
          {!current.page?.items.length && (
            <Notice>
              상담할 수 있는 공개 공고가 없어요. 다른 검색어로 찾아보거나 나중에
              다시 확인해 주세요.
            </Notice>
          )}
          {current.page?.items.map((item) => (
            <Button
              key={item.id}
              secondary
              label={item.title}
              onPress={() => choosePolicy(item)}
            />
          ))}
          {cursors.length > 1 && (
            <Button
              secondary
              label="이전 공고 목록"
              onPress={() => setCursors((values) => values.slice(0, -1))}
            />
          )}
          {current.page?.nextCursor && (
            <Button
              secondary
              label="다음 공고 목록"
              onPress={() =>
                setCursors((values) => [...values, current.page!.nextCursor])
              }
            />
          )}
        </>
      )}
    </View>
  );
}

function QuestionPanel({
  token,
  revisionId,
  onAnswer,
}: {
  token: string;
  revisionId: string;
  onAnswer: () => void;
}) {
  const { api, session, easy } = useRuntime();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [selected, setSelected] = useState("");
  const [faqs, setFaqs] = useState<Faqs>([]);
  const [faqState, setFaqState] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [citationsOpen, setCitationsOpen] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    api.assistant
      .faqs(token, revisionId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setFaqs(items);
          setFaqState("ready");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setFaqState("error");
          if (err.status === 401) void session.invalidate(token);
        }
      });
    return () => controller.abort();
  }, [api, session, token, revisionId, retry]);
  function select(item: Faqs[number]) {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setError("");
    setCitationsOpen(false);
    setSelected(item.question);
    setAnswer(item.response);
    onAnswer();
  }
  async function submit() {
    if (active.current || !question.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setAnswer(null);
    setCitationsOpen(false);
    setSelected(question.trim());
    Keyboard.dismiss();
    try {
      const response = await api.assistant.ask(
        token,
        revisionId,
        question,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setAnswer(response);
        onAnswer();
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const failure = err as {
          status?: number;
          code?: string;
          message: string;
        };
        setError(
          failure.status === 503
            ? "원문 근거를 확인한 답변을 만들지 못했어요. 준비된 질문을 선택하거나 잠시 후 다시 질문해 주세요."
            : failure.status === 404
              ? "공개된 공고를 찾을 수 없어요. 다른 공고를 선택해 주세요."
              : failure.code === "timeout"
                ? "답변이 늦어지고 있어요. 잠시 후 다시 질문해 주세요."
                : failure.message,
        );
        if (failure.status === 401) void session.invalidate(token);
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <View style={{ gap: 16 }}>
      {answer && (
        <View accessibilityLiveRegion="polite" style={styles.answer}>
          <Text style={styles.tag}>{selected}</Text>
          <Copy title>
            {answer.response_type === "prepared"
              ? "준비된 안내"
              : "공고에 따른 안내"}
          </Copy>
          <Copy>{answer.answer}</Copy>
          {!!answer.citations.length && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="원문 근거 보기"
                accessibilityState={{ expanded: citationsOpen }}
                aria-expanded={citationsOpen}
                onPress={() => setCitationsOpen(!citationsOpen)}
                style={styles.disclosure}
              >
                <Text
                  style={{
                    color: colors.green,
                    fontSize: easy ? 19 : 16,
                    fontWeight: "700",
                  }}
                >
                  원문 근거 {citationsOpen ? "접기 −" : "보기 +"}
                </Text>
              </Pressable>
              {citationsOpen &&
                answer.citations.map((item, index) => (
                  <View key={index} style={styles.quote}>
                    <Copy>{item.quote}</Copy>
                  </View>
                ))}
            </>
          )}
          {!!answer.follow_up_questions.length && (
            <>
              <Copy title>추가로 확인할 내용</Copy>
              {answer.follow_up_questions.map((item, index) => (
                <Copy key={index}>• {item}</Copy>
              ))}
            </>
          )}
          <Copy muted>
            신청 자격과 현재 접수 여부는 담당 기관에서 확인해 주세요.
          </Copy>
          {!!faqs.length && (
            <Button
              secondary
              label="다른 질문 고르기"
              onPress={() => {
                setAnswer(null);
                setSelected("");
              }}
            />
          )}
        </View>
      )}
      <Copy title>자주 묻는 질문</Copy>
      {faqState === "loading" ? (
        <Notice>기본 질문을 준비하고 있어요.</Notice>
      ) : faqState === "error" ? (
        <>
          <Notice>
            기본 질문을 불러오지 못했어요. 다시 시도하거나 직접 질문해 주세요.
          </Notice>
          <Button
            secondary
            label="기본 질문 다시 불러오기"
            onPress={() => {
              setFaqState("loading");
              setRetry((value) => value + 1);
            }}
          />
        </>
      ) : (
        faqs.map((item) => (
          <Button
            key={item.id}
            secondary
            label={item.question}
            onPress={() => select(item)}
          />
        ))
      )}
      <Card>
        <Copy title>직접 질문하기</Copy>
        <Copy muted>
          {easy
            ? "이름·전화번호는 적지 마세요."
            : "가입한 지역·연령대를 참고해 답변해요. 이름과 전화번호는 적지 마세요."}
        </Copy>
        <Field
          label="궁금한 내용"
          placeholder="어떤 지원을 받을 수 있나요?"
          value={question}
          onChangeText={setQuestion}
          maxLength={2000}
          multiline
          style={{ minHeight: 100, textAlignVertical: "top" }}
          editable={!busy}
        />
        <Button
          label="질문 보내기"
          busy={busy}
          disabled={!question.trim()}
          onPress={() => void submit()}
        />
        {busy && <Notice>원문을 확인하고 있어요. 잠시 기다려 주세요.</Notice>}
        {!!error && <Notice>{error}</Notice>}
      </Card>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 32,
    gap: 18,
  },
  welcome: { gap: 8 },
  selected: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#E8F2ED",
    gap: 10,
  },
  tag: { fontSize: 15, lineHeight: 23, color: colors.muted, fontWeight: "600" },
  answer: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  disclosure: { minHeight: 48, justifyContent: "center" },
  quote: {
    borderLeftWidth: 3,
    borderColor: colors.green,
    paddingLeft: 12,
    paddingVertical: 6,
  },
});
