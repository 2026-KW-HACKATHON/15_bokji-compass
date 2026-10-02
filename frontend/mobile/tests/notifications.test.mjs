import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "../src/services/client.js";
import {
  allowsNotification,
  createNotificationApi,
  defaultPreferences,
  notificationPolicyId,
  notificationTypes,
  parsePreferences,
} from "../src/features/notifications/model.js";

test("foreground notifications require explicit master/category opt-in; unknown types fail closed", () => {
  for (const { key } of notificationTypes) {
    const data = { category: key };
    assert.equal(allowsNotification(defaultPreferences, data), false);
    assert.equal(
      allowsNotification({ ...defaultPreferences, enabled: true }, data),
      true,
    );
    assert.equal(
      allowsNotification(
        { ...defaultPreferences, enabled: true, [key]: false },
        data,
      ),
      false,
    );
  }
  assert.equal(allowsNotification(null, { category: "policy_changes" }), false);
  assert.equal(
    allowsNotification(
      { ...defaultPreferences, enabled: true },
      { category: "unknown" },
    ),
    false,
  );
});

test("settings reject missing or coerced booleans and discard unrelated account data", () => {
  for (const value of [
    null,
    {},
    { ...defaultPreferences, enabled: "false" },
    { ...defaultPreferences, policy_changes: 1 },
  ])
    assert.throws(() => parsePreferences(value));
  assert.deepEqual(
    parsePreferences({ ...defaultPreferences, account_id: "other" }),
    defaultPreferences,
  );
});

test("notification links use policy IDs and never navigate to arbitrary payload URLs", () => {
  assert.equal(notificationPolicyId({ url: "https://untrusted.test" }), null);
  assert.equal(
    notificationPolicyId({
      policy_id: "주거/지원",
      url: "javascript:alert(1)",
    }),
    "주거/지원",
  );
  for (const policy_id of ["", 1, "x".repeat(129), "bad\nvalue"])
    assert.equal(notificationPolicyId({ policy_id }), null);
});

test("notifications use mobile bearer API and do not transmit user IDs or OS permission as consent", async () => {
  const calls = [];
  const api = createNotificationApi(
    createClient({
      baseUrl: "https://example.test",
      fetchImpl: async (url, options) => {
        calls.push({ url, ...options });
        return new Response(
          JSON.stringify(
            url.endsWith("/devices")
              ? { registered: true }
              : url.endsWith("/disable")
                ? { disabled: true }
                : defaultPreferences,
          ),
        );
      },
    }),
  );
  await api.read("session");
  await api.save("session", {
    ...defaultPreferences,
    application_results: false,
  });
  await api.register("session", "ExpoPushToken[test]", "android");
  await api.disable("session");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].body, undefined);
  assert.deepEqual(JSON.parse(calls[1].body), {
    ...defaultPreferences,
    application_results: false,
  });
  assert.deepEqual(JSON.parse(calls[2].body), {
    push_token: "ExpoPushToken[test]",
    platform: "android",
  });
  assert.deepEqual(JSON.parse(calls[3].body), {});
  for (const call of calls) {
    assert.equal(call.headers.Authorization, "Bearer session");
    assert.equal(call.credentials, "omit");
    assert.equal(call.redirect, "error");
    if (call.method === "POST")
      assert.equal(call.headers["X-Auth-Request"], "1");
  }
});
