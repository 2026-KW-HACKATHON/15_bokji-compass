import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
const require = createRequire(import.meta.url);

test("patched decoder preserves query-string API and Unicode", () => {
  const query = require("query-string");
  assert.deepEqual({ ...query.parse("region=%EC%84%9C%EC%9A%B8&q=a%2Bb&x=%FE%FF") }, { region: "서울", q: "a+b", x: "\uFFFD\uFFFD" });
  const source = { q: "복지 + 지원", page: "2" };
  assert.deepEqual({ ...query.parse(query.stringify(source)) }, source);
});

test("malformed percent input completes in a bounded worker", async () => {
  const modulePath = require.resolve("decode-uri-component");
  await new Promise((resolve, reject) => {
    const worker = new Worker(`const { parentPort, workerData } = require('node:worker_threads'); const decode = require(workerData); decode('%C0'.repeat(20000)); parentPort.postMessage('done');`, { eval: true, workerData: modulePath });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error("Decoder exceeded 2 seconds")); }, 2000);
    worker.once("message", () => { clearTimeout(timer); void worker.terminate(); resolve(); });
    worker.once("error", error => { clearTimeout(timer); reject(error); });
  });
});

test("patched uuid remains compatible with xcode build tooling", () => {
  const project = require("xcode").project("fixture.pbxproj");
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
  const xcodeRequire = createRequire(require.resolve("xcode"));
  assert.throws(() => xcodeRequire("uuid").v5("x", "6ba7b810-9dad-11d1-80b4-00c04fd430c8", new Uint8Array(8), 4), RangeError);
});
