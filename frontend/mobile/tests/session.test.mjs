import assert from "node:assert/strict";
import test from "node:test";
import { createSession } from "../src/services/session.js";

const token = "a".repeat(43);
const baseUrl = "https://api.example.test";
const user = { id: "one", username: "tester", name: "시험" };
const record = { token, baseUrl, expiresAt: 20000, pendingLogout: false };
function fixture(initial = null, overrides = {}) {
  let stored = initial;
  const calls = [];
  const storage = {
    read: async () => stored,
    write: async (value) => {
      stored = { ...value };
    },
    clear: async () => {
      stored = null;
    },
  };
  const api = {
    login: async () => ({ token, user, expiresIn: 100 }),
    me: async (value) => {
      calls.push(["me", value]);
      return user;
    },
    logout: async (value) => {
      calls.push(["logout", value]);
    },
    ...overrides,
  };
  return {
    storage,
    api,
    calls,
    stored: () => stored,
    make: () => createSession({ api, storage, baseUrl, now: () => 1000 }),
  };
}
test("login persists token only and restart verifies account with server", async () => {
  const f = fixture();
  const session = f.make();
  await session.restore();
  await session.login("tester", "not-persisted");
  assert.equal(session.getSnapshot().status, "signedIn");
  assert.deepEqual(Object.keys(f.stored()).sort(), [
    "baseUrl",
    "expiresAt",
    "pendingLogout",
    "token",
  ]);
  const restart = f.make();
  await restart.restore();
  assert.equal(restart.getSnapshot().user.id, "one");
  assert.deepEqual(f.calls, [["me", token]]);
});
test("expired or different-server tokens are erased without transmitting them", async () => {
  for (const value of [
    { ...record, expiresAt: 1 },
    { ...record, baseUrl: "https://other.test" },
    { ...record, token: "bad" },
  ]) {
    const f = fixture(value);
    const s = f.make();
    await s.restore();
    assert.equal(s.getSnapshot().status, "signedOut");
    assert.equal(f.stored(), null);
    assert.deepEqual(f.calls, []);
  }
});
test("offline restoration keeps encrypted session but exposes no private state", async () => {
  const f = fixture(record, {
    me: async () => {
      throw new Error("offline");
    },
  });
  const s = f.make();
  await s.restore();
  assert.equal(s.getSnapshot().status, "blocked");
  assert.equal(s.getSnapshot().token, null);
  assert.equal(s.getSnapshot().user, null);
  assert.equal(f.stored().token, token);
  f.api.me = async () => user;
  await s.restore();
  assert.equal(s.getSnapshot().status, "signedIn");
});
test("401 clears session; stale 401 cannot invalidate a newer account session", async () => {
  const f = fixture(record);
  const s = f.make();
  await s.restore();
  await s.invalidate("other-token");
  assert.equal(s.getSnapshot().status, "signedIn");
  await s.invalidate(token);
  assert.equal(s.getSnapshot().status, "signedOut");
  assert.equal(f.stored(), null);
  const g = fixture(record, {
    me: async () => {
      throw Object.assign(new Error(), { status: 401 });
    },
  });
  const restored = g.make();
  await restored.restore();
  assert.equal(g.stored(), null);
  assert.equal(restored.getSnapshot().status, "signedOut");
});
test("failed logout records intent and restart revokes instead of logging back in", async () => {
  const f = fixture(record, {
    logout: async () => {
      throw new Error("offline");
    },
  });
  const s = f.make();
  await s.restore();
  await s.logout();
  assert.equal(s.getSnapshot().user, null);
  assert.equal(f.stored().pendingLogout, true);
  f.calls.length = 0;
  f.api.logout = async (value) => f.calls.push(["logout", value]);
  const restart = f.make();
  await restart.restore();
  assert.equal(restart.getSnapshot().status, "signedOut");
  assert.equal(f.stored(), null);
  assert.deepEqual(f.calls, [["logout", token]]);
});
test("secure storage failure never produces a successful login", async () => {
  const f = fixture();
  const s = f.make();
  await s.restore();
  f.storage.write = async () => {
    throw new Error("locked");
  };
  await s.login("tester", "secret");
  assert.equal(s.getSnapshot().status, "blocked");
  assert.equal(s.getSnapshot().token, null);
  assert.deepEqual(f.calls, [["logout", token]]);
});
test("concurrent login taps issue just one request", async () => {
  let complete;
  let calls = 0;
  const f = fixture(null, {
    login: () => {
      calls++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  const s = f.make();
  await s.restore();
  const first = s.login("tester", "secret");
  await s.login("tester", "secret");
  assert.equal(calls, 1);
  complete({ token, user, expiresIn: 100 });
  await first;
  assert.equal(s.getSnapshot().status, "signedIn");
});
