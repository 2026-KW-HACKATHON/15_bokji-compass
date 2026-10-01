import assert from "node:assert/strict";
import test from "node:test";
import { createClient, resolveApiUrl } from "../src/services/client.js";
import { createApi } from "../src/services/api.js";
import {
  emptyFinancialProfile,
  toFinancialProfile,
  moneyInput,
} from "@bokji/core/finance-model";
import { updateDraft } from "../src/features/finance/draft.js";

test("production requires HTTPS and rejects credentials/query/hash", () => {
  for (const url of [
    "",
    "/api",
    "http://localhost:8000",
    "https://user:pass@example.test",
    "https://api.test?q=1",
    "https://api.test/#hash",
  ])
    assert.throws(() => resolveApiUrl(url));
  assert.equal(
    resolveApiUrl("http://10.0.2.2:8000/", true),
    "http://10.0.2.2:8000",
  );
  assert.equal(resolveApiUrl("https://api.test/api/"), "https://api.test/api");
});
test("public calls omit authorization and private calls use bearer, not cookies", async () => {
  const calls = [];
  const request = createClient({
    baseUrl: "https://api.test",
    fetchImpl: async (...args) => {
      calls.push(args);
      return new Response("{}");
    },
  });
  await request("/v1/finance/calculate", { body: { profile: {} } });
  await request("/v1/finance/profile", { token: "test" });
  assert.equal(calls[0][1].headers.Authorization, undefined);
  assert.equal(calls[0][1].headers["X-Auth-Request"], "1");
  assert.equal(calls[1][1].headers.Authorization, "Bearer test");
  assert.equal(calls[1][1].credentials, "omit");
  assert.equal(calls[1][1].redirect, "error");
});
test("HTTP failures do not echo private server details and invalid JSON fails closed", async () => {
  const request = createClient({
    baseUrl: "https://api.test",
    fetchImpl: async () => new Response("sensitive detail", { status: 500 }),
  });
  await assert.rejects(
    request("/private"),
    (error) => error.status === 500 && !error.message.includes("sensitive"),
  );
  const invalid = createClient({
    baseUrl: "https://api.test",
    fetchImpl: async () => new Response("not json"),
  });
  await assert.rejects(
    invalid("/private"),
    (error) => error.code === "invalid_response",
  );
});
test("timeout and abort remain distinguishable, without retries", async () => {
  let count = 0;
  const request = createClient({
    baseUrl: "https://api.test",
    timeoutMs: 10,
    fetchImpl: (_, { signal }) => {
      count++;
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("abort")), {
          once: true,
        }),
      );
    },
  });
  await assert.rejects(
    request("/private"),
    (error) => error.code === "timeout",
  );
  assert.equal(count, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    request("/private", { signal: controller.signal }),
    (error) => error.code === "aborted",
  );
  assert.equal(count, 1);
});
test("late body after cancellation cannot be applied", async () => {
  const controller = new AbortController();
  const request = createClient({
    baseUrl: "https://api.test",
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        controller.abort();
        return {};
      },
    }),
  });
  await assert.rejects(
    request("/private", { signal: controller.signal }),
    (error) => error.code === "aborted",
  );
});
test("financial edits keep null distinct from zero and preserve only current members", () => {
  let draft = emptyFinancialProfile();
  draft = updateDraft(draft, "household_size", 2);
  assert.equal(draft.members.length, 2);
  draft = updateDraft(draft, "members.0.earned_income", moneyInput("123.4567"));
  draft = updateDraft(draft, "assets.financial", moneyInput("0"));
  const profile = toFinancialProfile(draft);
  assert.equal(profile.members[0].earned_income, 1234567);
  assert.equal(profile.assets.financial, 0);
  assert.equal(profile.assets.general, null);
  draft = updateDraft(draft, "household_size", 1);
  assert.equal(draft.members.length, 1);
  draft = updateDraft(draft, "vehicle_status", "owned");
  assert.equal(draft.vehicles.length, 1);
  draft = updateDraft(draft, "vehicle_status", "none");
  assert.deepEqual(draft.vehicles, []);
});
test("save without consent never sends a request; no-profile response stays empty", async () => {
  const calls = [];
  const api = createApi(async (...args) => {
    calls.push(args);
    return { profile: null, calculation: null, updated_at: null };
  });
  await assert.rejects(
    api.saveProfile("token", emptyFinancialProfile(), false),
  );
  assert.equal(calls.length, 0);
  assert.equal((await api.getProfile("token")).profile, null);
});
