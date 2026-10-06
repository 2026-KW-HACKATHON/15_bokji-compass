import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { checkSharedCore, checkProjectId } from "../scripts/check-release.mjs";

const require = createRequire(import.meta.url);
const { getConfig } = require("@expo/config");
const root = path.resolve(import.meta.dirname, "..");

test("release evaluates actual Expo config and rejects missing or unsafe API settings", () => {
  const previous = { release: process.env.BOKJI_RELEASE, api: process.env.EXPO_PUBLIC_API_BASE_URL };
  process.env.BOKJI_RELEASE = "1";
  try {
    for (const api of ["", "http://bokji.commitnaru.com/api", "https://127.0.0.1/api", "https://example.invalid", "https://user:pass@bokji.commitnaru.com", "https://bokji.commitnaru.com/api?token=x"]) {
      process.env.EXPO_PUBLIC_API_BASE_URL = api;
      assert.throws(() => getConfig(root), /HTTPS/);
    }
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://bokji.commitnaru.com/api";
    const { exp } = getConfig(root);
    assert.equal(exp.android.package, "com.bokjicompass.app");
    assert.equal(exp.android.allowBackup, false);
  } finally {
    for (const [key, value] of [["BOKJI_RELEASE", previous.release], ["EXPO_PUBLIC_API_BASE_URL", previous.api]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("EAS requires a real project UUID while local builds allow unconfigured push", () => {
  checkProjectId({});
  assert.throws(() => checkProjectId({}, { required: true }), /UUID/);
  assert.throws(() => checkProjectId({ extra: { eas: { projectId: "placeholder" } } }), /UUID/);
  checkProjectId({ extra: { eas: { projectId: "ae54a019-32a5-43ed-a953-622987992e08" } } }, { required: true });
});

test("release detects stale and missing copies of financial core", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "bokji-release-"));
  const mobile = path.join(temp, "mobile");
  const source = path.join(temp, "packages/core");
  const copy = path.join(mobile, "node_modules/@bokji/core");
  try {
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "rules.js"), "export const rate = 1;");
    assert.throws(() => checkSharedCore(mobile), /npm ci/);
    cpSync(source, copy, { recursive: true });
    checkSharedCore(mobile);
    writeFileSync(path.join(source, "rules.js"), "export const rate = 2;");
    assert.throws(() => checkSharedCore(mobile), /npm ci/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
