import assert from "node:assert/strict";
import test from "node:test";
import { createApi, parseLoginResult } from "../src/services/api.js";
import { createSession } from "../src/services/session.js";
import {
  authorizeUrl,
  callbackValues,
  createKakaoLogin,
  KAKAO_CALLBACK,
} from "../src/features/auth/kakao.js";
import {
  credentialsError,
  emailError,
  signupConsent,
  NOTICE_VERSION,
} from "../src/features/auth/signupModel.js";

const baseUrl = "https://bokji.commitnaru.com/api";
const flow = "f".repeat(43),
  code = "c".repeat(43),
  token = "t".repeat(43);
const url = `${KAKAO_CALLBACK}?flow=${flow}&code=${code}`;
const authorization_url = `${baseUrl}/v1/mobile/auth/kakao/authorize?flow=${flow}`;
const result = {
  token,
  expiresIn: 600,
  user: { id: "member", username: "k_member", name: null },
};
function fixture(options = {}) {
  let stored = options.stored || null;
  const calls = [];
  const storage = {
    read: async () => stored,
    write: async (v) => {
      stored = v;
    },
    clear: async () => {
      stored = null;
    },
  };
  let status = "signedOut";
  const session = {
    getSnapshot: () => ({ status }),
    signIn: async (perform) => {
      calls.push(["session", await perform()]);
      status = "signedIn";
    },
  };
  const api = {
    logout: async (value) => calls.push(["revoke", value]),
    auth: {
      startKakao: async () => ({ flow, authorization_url, expires_in: 600 }),
      exchangeKakao: async (body) => {
        calls.push(["exchange", body]);
        return options.exchange || { status: "signed_in", session: result };
      },
      cancelKakao: async (body) => calls.push(["cancel", body]),
      cancelSignup: async (value) => calls.push(["cancelSignup", value]),
      completeKakao: async (body) => {
        calls.push(["complete", body]);
        return result;
      },
    },
  };
  const controller = createKakaoLogin({
    api,
    session,
    storage,
    proof: async () => ({
      verifier: "v".repeat(64),
      challenge: "h".repeat(43),
    }),
    browser: options.browser || (async () => ({ type: "success", url })),
    baseUrl,
    now: () => 1000,
  });
  return { controller, calls, api, session, storage, stored: () => stored };
}

test("app callback and authorization URL reject foreign hosts, flows, duplicate parameters and token redirects", () => {
  assert.equal(
    authorizeUrl(authorization_url, baseUrl, flow),
    authorization_url,
  );
  assert.equal(callbackValues(url, flow), code);
  for (const bad of [
    url.replace("bokji-compass", "other"),
    url.replace(flow, "x".repeat(43)),
    url + "&flow=" + flow,
    url + "&code=" + code,
    url + "#fragment",
    `${KAKAO_CALLBACK}?flow=${flow}&access_token=${token}`,
  ])
    assert.throws(() => callbackValues(bad, flow));
  for (const bad of [
    authorization_url.replace("bokji.commitnaru.com", "evil.example"),
    authorization_url.replace("https:", "http:"),
    authorization_url + "&next=evil",
  ])
    assert.throws(() => authorizeUrl(bad, baseUrl, flow));
  assert.throws(
    () =>
      callbackValues(`${KAKAO_CALLBACK}?flow=${flow}&error=cancelled`, flow),
    /취소/,
  );
});

test("Kakao existing login exchanges proof once then persists a native session", async () => {
  const f = fixture();
  await f.controller.start();
  assert.equal(f.session.getSnapshot().status, "signedIn");
  assert.deepEqual(f.calls[0], [
    "exchange",
    { flow, code, code_verifier: "v".repeat(64) },
  ]);
  assert.equal(f.stored(), null);
  assert.equal(f.controller.getSnapshot().busy, false);
});

test("Kakao new account waits for explicit email and consent and supports cancellation", async () => {
  const f = fixture({
    exchange: {
      status: "signup_required",
      signup_token: token,
      expires_in: 600,
    },
  });
  await f.controller.start();
  assert.equal(f.session.getSnapshot().status, "signedOut");
  assert.equal(f.controller.getSnapshot().pending.token, token);
  const consent = {
    notice_version: NOTICE_VERSION,
    collection: true,
    profile: false,
    ai: false,
  };
  await f.controller.complete("native@example.com", consent);
  assert.deepEqual(f.calls[1], [
    "complete",
    { email: "native@example.com", consent, signup_token: token },
  ]);
  assert.equal(f.session.getSnapshot().status, "signedIn");
  const cancelled = fixture({
    exchange: {
      status: "signup_required",
      signup_token: token,
      expires_in: 600,
    },
  });
  await cancelled.controller.start();
  await cancelled.controller.cancel();
  assert.equal(cancelled.controller.getSnapshot().pending, null);
  assert.equal(cancelled.stored(), null);
});

test("browser cancel and provider failure never exchange or sign in", async () => {
  for (const browser of [
    async () => ({ type: "cancel" }),
    async () => ({
      type: "success",
      url: `${KAKAO_CALLBACK}?flow=${flow}&error=failed`,
    }),
  ]) {
    const f = fixture({ browser });
    await f.controller.start();
    assert.equal(f.session.getSnapshot().status, "signedOut");
    assert.equal(
      f.calls.some(([kind]) => kind === "exchange"),
      false,
    );
    assert.equal(f.stored(), null);
  }
});

test("cold app return restores proof, rejects expired/server-mismatched state and serializes callbacks", async () => {
  const stored = {
    kind: "oauth",
    baseUrl,
    flow,
    verifier: "v".repeat(64),
    expiresAt: 10000,
  };
  const f = fixture({ stored });
  await Promise.all([f.controller.resume(url), f.controller.resume(url)]);
  assert.equal(f.calls.filter(([kind]) => kind === "exchange").length, 1);
  for (const bad of [
    { ...stored, expiresAt: 1 },
    { ...stored, baseUrl: "https://other.test" },
    null,
  ]) {
    const f = fixture({ stored: bad });
    await f.controller.resume(url);
    assert.equal(f.calls.length, 0);
    assert.equal(f.stored(), null);
  }
});

test("secure storage failure prevents launching authentication and revokes received sessions", async () => {
  let opened = false;
  const f = fixture({
    browser: async () => {
      opened = true;
      return { type: "success", url };
    },
  });
  f.storage.write = async () => {
    throw new Error("storage locked");
  };
  await f.controller.start();
  assert.equal(opened, false);
  const cold = fixture({
    stored: {
      kind: "oauth",
      baseUrl,
      flow,
      verifier: "v".repeat(64),
      expiresAt: 10000,
    },
  });
  cold.storage.clear = async () => {
    throw new Error("storage locked");
  };
  await cold.controller.resume(url);
  assert.ok(
    cold.calls.some(([kind, value]) => kind === "revoke" && value === token),
  );
  assert.equal(cold.session.getSnapshot().status, "signedOut");
});

test("social sessions use the same secure session persistence and server logout on write failure", async () => {
  const calls = [];
  const session = createSession({
    api: { logout: async (value) => calls.push(value) },
    baseUrl,
    storage: {
      read: async () => null,
      clear: async () => {},
      write: async () => {
        throw new Error("locked");
      },
    },
  });
  await session.restore();
  await session.signIn(async () => result);
  assert.equal(session.getSnapshot().status, "blocked");
  assert.deepEqual(calls, [token]);
});

test("native signup endpoints use explicit proofs; login parser rejects malformed sessions", async () => {
  const calls = [];
  const api = createApi(async (path, options) => {
    calls.push({ path, ...options });
    return {
      verification_token: token,
      expires_in: 600,
      resend_after: 60,
      verified: true,
    };
  });
  await api.auth.sendEmail("test@example.com");
  await api.auth.verifyEmail("test@example.com", "123456", token);
  assert.equal(calls[1].body.verification_token, token);
  assert.equal(calls[1].token, undefined);
  assert.throws(() =>
    parseLoginResult({
      access_token: "bad",
      token_type: "Bearer",
      expires_in: 600,
      user: result.user,
    }),
  );
  assert.throws(() =>
    parseLoginResult({
      access_token: token,
      token_type: "Bearer",
      expires_in: 99999999,
      user: result.user,
    }),
  );
});

test("signup validates passwords/email and never infers optional consent", () => {
  assert.equal(
    credentialsError({
      username: "tester",
      password: "secret123",
      confirm_password: "secret123",
    }),
    "",
  );
  assert.ok(
    credentialsError({
      username: "tester",
      password: "12345678",
      confirm_password: "12345678",
    }),
  );
  assert.ok(emailError("bad"));
  const notice = {
    version: NOTICE_VERSION,
    operator_name: "복지나침반",
    contact_email: "test@example.com",
    retention: "탈퇴 시 삭제",
  };
  assert.throws(() => signupConsent(notice, { collection: false }));
  assert.deepEqual(signupConsent(notice, { collection: true }), {
    notice_version: NOTICE_VERSION,
    collection: true,
    profile: false,
    ai: false,
  });
});
