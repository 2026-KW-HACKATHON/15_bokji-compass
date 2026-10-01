import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePolicy,
  parsePolicyPage,
  policyPath,
  safeSourceUrl,
} from "../src/features/policies/model.js";
import { createApi } from "../src/services/api.js";
import { createClient } from "../src/services/client.js";

const policy = {
  id: "source/a?b",
  title: "테스트 공고",
  summary: "계약 검사 전용",
  tags: ["주거", "주거"],
  sourceUrl: "https://example.test/notice",
};
test("policy filters are encoded, unfiltered values omitted, cursor preserved", () => {
  const path = policyPath({
    query: " 주거 & 청년 ",
    category: "주거",
    region: "서울",
    cursor: "6",
    limit: 3,
  });
  const params = new URL("https://example.test" + path).searchParams;
  assert.equal(params.get("q"), "주거 & 청년");
  assert.equal(params.get("cursor"), "6");
  assert.equal(params.get("limit"), "3");
  assert.equal(params.get("region"), "서울");
  assert.equal(
    new URL("https://example.test" + policyPath()).searchParams.has("category"),
    false,
  );
});
test("policy parsing rejects malformed/duplicate pages and preserves missing data", () => {
  assert.deepEqual(parsePolicy(policy).tags, ["주거"]);
  assert.equal(parsePolicy(policy).audience, "지원 대상 확인 필요");
  assert.equal(parsePolicy(policy).region, "지역 확인 필요");
  for (const page of [
    null,
    { items: [policy], total: 0, nextCursor: null },
    { items: [policy, policy], total: 2, nextCursor: null },
    { items: [], total: 0, nextCursor: "invalid" },
  ])
    assert.throws(() => parsePolicyPage(page));
  assert.deepEqual(parsePolicyPage({ items: [], total: 0, nextCursor: null }), {
    items: [],
    total: 0,
    nextCursor: null,
  });
});
test("official links allow only HTTP(S) without embedded credentials", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/a",
    "intent://other",
    "https://user:password@example.test",
    null,
  ])
    assert.equal(safeSourceUrl(url), null);
  assert.equal(
    safeSourceUrl("https://example.test/path"),
    "https://example.test/path",
  );
});
test("catalog requests use public API, encoded IDs and cancellation", async () => {
  const calls = [];
  const controller = new AbortController();
  const api = createApi(
    createClient({
      baseUrl: "https://example.test",
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return new Response(
          JSON.stringify(
            url.includes("?")
              ? { items: [policy], total: 1, nextCursor: null }
              : policy,
          ),
        );
      },
    }),
  );
  await api.listPolicies({}, controller.signal);
  await api.getPolicy(policy.id, controller.signal);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[1].url, "https://example.test/v1/policies/source%2Fa%3Fb");
  controller.abort();
  await assert.rejects(api.listPolicies({}, controller.signal), {
    code: "aborted",
  });
  assert.equal(calls.length, 2);
});
