import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssistantApi,
  parseAnswer,
  parseFaqs,
} from "../src/features/assistant/model.js";
import { createClient } from "../src/services/client.js";
import { parsePolicy } from "../src/features/policies/model.js";
const revision = "11111111-1111-1111-1111-111111111111";
const answer = {
  revision_id: revision,
  status: "grounded",
  answer: "원문에 따른 안내",
  citations: [{ source_field: "지원내용", quote: "지원 원문" }],
  follow_up_questions: ["기관 확인"],
  preview: false,
  eligibility_decided: false,
};
const faq = {
  id: "benefits",
  question: "어떤 지원을 받을 수 있나요?",
  response: { ...answer, response_type: "prepared" },
};

test("assistant uses mobile bearer, same web endpoints, minimal body and redirect protection", async () => {
  const calls = [];
  const api = createAssistantApi(
    createClient({
      baseUrl: "https://example.test",
      fetchImpl: async (url, options) => {
        calls.push({ url, ...options });
        return new Response(
          JSON.stringify(
            url.includes("/faqs?")
              ? { revision_id: revision, items: [faq] }
              : answer,
          ),
        );
      },
    }),
  );
  const choices = await api.faqs("member-token", revision);
  assert.equal(choices[0].response.response_type, "prepared");
  await api.ask("member-token", revision, "  지원 내용?  ");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/v1\/assistant\/faqs\?revision_id=/);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].body, undefined);
  assert.match(calls[1].url, /\/v1\/assistant\/questions$/);
  assert.deepEqual(JSON.parse(calls[1].body), {
    revision_id: revision,
    question: "지원 내용?",
  });
  for (const call of calls) {
    assert.equal(call.headers.Authorization, "Bearer member-token");
    assert.equal(call.credentials, "omit");
    assert.equal(call.redirect, "error");
  }
  assert.equal(calls[1].headers["X-Auth-Request"], "1");
});
test("rejects unpublished, mismatched, unsupported and ungrounded responses", () => {
  for (const patch of [
    { revision_id: "other" },
    { preview: true },
    { eligibility_decided: true },
    { status: "approved" },
    { citations: [] },
    { citations: [{ quote: "text" }] },
    { answer: "" },
    { follow_up_questions: [null] },
  ]) {
    assert.throws(() => parseAnswer({ ...answer, ...patch }, revision), {
      code: "invalid_response",
    });
  }
  assert.equal(
    parseAnswer(
      { ...answer, status: "insufficient_source", citations: [] },
      revision,
    ).status,
    "insufficient_source",
  );
});
test("FAQ answers match the requested published revision and prepared contract", () => {
  for (const patch of [
    { revision_id: "other" },
    { items: [] },
    { items: [faq, faq] },
    { items: [{ ...faq, response: answer }] },
    {
      items: [{ ...faq, response: { ...faq.response, revision_id: "other" } }],
    },
  ]) {
    assert.throws(() =>
      parseFaqs({ revision_id: revision, items: [faq], ...patch }, revision),
    );
  }
});
test("no requests for guest, missing revision or invalid free text", async () => {
  let calls = 0;
  const api = createAssistantApi(async () => {
    calls++;
    return answer;
  });
  await assert.rejects(api.faqs(null, revision), { status: 401 });
  await assert.rejects(api.faqs("token", "invalid"), {
    code: "invalid_revision",
  });
  await assert.rejects(api.ask("token", revision, " "));
  await assert.rejects(api.ask("token", revision, "x".repeat(2001)));
  assert.equal(calls, 0);
});
test("free text gets web-equivalent 70s timeout while FAQ keeps normal timeout", async () => {
  const options = [];
  const api = createAssistantApi(async (path, value) => {
    options.push(value);
    return path.includes("faqs")
      ? { revision_id: revision, items: [faq] }
      : answer;
  });
  await api.faqs("token", revision);
  await api.ask("token", revision, "질문");
  assert.equal(options[0].timeoutMs, undefined);
  assert.equal(options[1].timeoutMs, 70000);
});
test("cancelled or unauthorized responses do not become an answer and server secrets stay hidden", async () => {
  const cancelled = new AbortController();
  const api = createAssistantApi(
    createClient({
      baseUrl: "https://example.test",
      fetchImpl: async () => {
        cancelled.abort();
        return new Response(JSON.stringify(answer));
      },
    }),
  );
  await assert.rejects(api.ask("token", revision, "질문", cancelled.signal), {
    code: "aborted",
  });
  const denied = createAssistantApi(
    createClient({
      baseUrl: "https://example.test",
      fetchImpl: async () =>
        new Response(JSON.stringify({ detail: "private database password" }), {
          status: 401,
        }),
    }),
  );
  await assert.rejects(
    denied.faqs("token", revision),
    (error) => error.status === 401 && !error.message.includes("private"),
  );
});
test("policy model retains revision required by web-equivalent questions", () => {
  const policy = {
    id: "policy",
    title: "공고",
    summary: "요약",
    tags: [],
    revisionId: revision,
  };
  assert.equal(parsePolicy(policy).revisionId, revision);
  assert.equal(
    parsePolicy({ ...policy, revisionId: "invalid" }).revisionId,
    null,
  );
});
