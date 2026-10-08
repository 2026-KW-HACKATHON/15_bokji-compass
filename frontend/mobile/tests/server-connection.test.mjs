import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "../src/services/client.js";
import { createServerConnection, connectionMessage } from "../src/services/serverConnection.js";

const healthy = () => new Response(JSON.stringify({ status: "ok", service: "bokji-compass-backend" }));
const connectionFor = (fetchImpl) => createServerConnection(createClient({ baseUrl: "https://api.test/api", fetchImpl }));

test("refused connection shows server/network guidance; retry recovers without retrying writes", async () => {
  let offline = true;
  const calls = [];
  const connection = connectionFor(async (url, options) => {
    calls.push([url, options]);
    if (offline) throw new TypeError("Network request failed");
    return healthy();
  });
  await assert.rejects(connection.request("/v1/finance/profile", { token: "private", body: {} }));
  assert.equal(connection.getSnapshot().status, "unavailable");
  assert.equal(connection.getSnapshot().reason, "network");
  assert.match(connectionMessage("network"), /서버가 꺼져/);
  assert.equal(calls.length, 1);
  offline = false;
  await connection.check();
  assert.equal(connection.getSnapshot().status, "available");
  assert.equal(connection.getSnapshot().checking, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], "https://api.test/api/health");
  assert.equal(calls[1][1].method, "GET");
  assert.equal(calls[1][1].headers.Authorization, undefined);
});

test("gateway and service failures display an outage while login/validation errors stay separate", async () => {
  for (const status of [500, 502, 503, 504, 521]) {
    const connection = connectionFor(async () => new Response("private details", { status }));
    await assert.rejects(connection.request("/v1/policies"));
    assert.equal(connection.getSnapshot().reason, "server");
    assert.match(connectionMessage("server"), /서버/);
  }
  for (const status of [401, 403, 404, 422, 429]) {
    const connection = connectionFor(async () => new Response("private details", { status }));
    await assert.rejects(connection.request("/v1/mobile/auth/login"));
    assert.equal(connection.getSnapshot().status, "available");
  }
});

test("timeout shows delayed response; deliberate cancellation does not create an outage", async () => {
  const connection = connectionFor((_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  }));
  await assert.rejects(connection.request("/health", { timeoutMs: 5 }));
  assert.equal(connection.getSnapshot().reason, "timeout");
  assert.match(connectionMessage("timeout"), /늦어/);
  const before = connection.getSnapshot();
  const pending = connection.check();
  connection.cancelCheck();
  await assert.rejects(pending, (error) => error.code === "aborted");
  assert.equal(connection.getSnapshot().status, before.status);
  assert.equal(connection.getSnapshot().reason, before.reason);
  assert.equal(connection.getSnapshot().checking, false);
});

test("invalid proxy response, malformed JSON and wrong health identity cannot report recovery", async () => {
  for (const body of ["<html>proxy error</html>", "{}", '{"status":"ok","service":"different"}']) {
    const connection = connectionFor(async () => new Response(body));
    await assert.rejects(connection.check());
    assert.equal(connection.getSnapshot().status, "unavailable");
    assert.equal(connection.getSnapshot().reason, "response");
  }
});

test("parallel retry buttons share one health check and emit loading/recovery", async () => {
  let resolve;
  let calls = 0;
  const connection = connectionFor(() => {
    calls++;
    return new Promise((done) => { resolve = done; });
  });
  const observed = [];
  const unsubscribe = connection.subscribe(() => observed.push(connection.getSnapshot()));
  const a = connection.check();
  const b = connection.check();
  assert.equal(a, b);
  assert.equal(calls, 1);
  assert.equal(connection.getSnapshot().checking, true);
  resolve(healthy());
  await a;
  unsubscribe();
  assert.equal(observed.at(-1).checking, false);
  assert.equal(observed.at(-1).status, "available");
});

test("older success/failure cannot overwrite newer connection evidence", async () => {
  for (const oldFails of [false, true]) {
    let finish;
    let calls = 0;
    const connection = connectionFor(() => {
      if (++calls === 1) return new Promise((resolve, reject) => { finish = oldFails ? () => reject(new Error("offline")) : () => resolve(healthy()); });
      if (!oldFails) throw new Error("offline");
      return healthy();
    });
    const older = connection.request("/v1/policies").catch(() => {});
    await connection.check().catch(() => {});
    const latest = connection.getSnapshot();
    finish();
    await older;
    assert.equal(connection.getSnapshot(), latest);
  }
});

test("foreground after cancellation starts fresh health check immediately", async () => {
  let calls = 0;
  const connection = connectionFor((_, { signal }) => {
    if (++calls === 2) return healthy();
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  });
  const background = connection.check().catch(() => {});
  connection.cancelCheck();
  const foreground = connection.check();
  await Promise.all([background, foreground]);
  assert.equal(calls, 2);
  assert.equal(connection.getSnapshot().status, "available");
  assert.equal(connection.getSnapshot().checking, false);
});
