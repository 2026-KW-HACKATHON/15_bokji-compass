import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  applyNodeForgePatch,
  ORIGINAL_SHA256,
  PATCHED_SHA256,
  ORIGINAL_BLOCK,
  PATCHED_BLOCK,
  ORIGINAL_OID_BLOCK,
  PATCHED_OID_BLOCK,
} from "../scripts/apply-node-forge-security-patch.mjs";

const require = createRequire(import.meta.url);
const installedPackage = require.resolve("node-forge/package.json");
const sha256 = (source) => createHash("sha256").update(source).digest("hex");

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "expected exactly one patch block");
  return source.replace(before, after);
}

function originalSource() {
  assert.equal(JSON.parse(readFileSync(installedPackage, "utf8")).version, "1.4.0");
  let source = readFileSync(join(dirname(installedPackage), "lib/rsa.js"), "utf8");
  if (sha256(source) === PATCHED_SHA256) {
    source = replaceOnce(source, PATCHED_BLOCK, ORIGINAL_BLOCK);
    source = replaceOnce(source, PATCHED_OID_BLOCK, ORIGINAL_OID_BLOCK);
  }
  assert.equal(sha256(source), ORIGINAL_SHA256, "fixture must be authentic node-forge 1.4.0");
  return source;
}

const original = originalSource();
const directPath = "node_modules/node-forge";
const nestedPath = "node_modules/expo/node_modules/node-forge";

function writePackage(projectRoot, dependencyPath, { version = "1.4.0", source = original } = {}) {
  const packageDirectory = resolve(projectRoot, dependencyPath);
  mkdirSync(join(packageDirectory, "lib"), { recursive: true });
  writeFileSync(
    join(packageDirectory, "package.json"),
    JSON.stringify({ name: "node-forge", version }),
  );
  writeFileSync(join(packageDirectory, "lib/rsa.js"), source);
  return join(packageDirectory, "lib/rsa.js");
}

function fixture(t, entries = [{ path: directPath }]) {
  const temporary = mkdtempSync(join(tmpdir(), "bokji-forge-install-"));
  const projectRoot = join(temporary, "project");
  mkdirSync(projectRoot);
  t.after(() => {
    // Only remove this test's freshly created directory inside the OS temp root.
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith("bokji-forge-install-"));
    rmSync(temporary, { recursive: true, force: true });
  });
  const lock = {
    name: "synthetic-forge-install",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: { "": { name: "synthetic-forge-install", version: "1.0.0" } },
  };
  for (const entry of entries) {
    lock.packages[entry.path] = { version: entry.lockVersion || "1.4.0" };
    if (!entry.missing) {
      writePackage(projectRoot, entry.path, entry);
    }
  }
  const lockPath = join(projectRoot, "package-lock.json");
  const writeLock = () => writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  writeLock();
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: lock.name, version: lock.version, private: true }),
  );
  return {
    projectRoot,
    temporary,
    lock,
    writeLock,
    sourcePath: (dependencyPath = directPath) => join(projectRoot, dependencyPath, "lib/rsa.js"),
  };
}

test("applies both RSA fixes to the original installed source and verifies the pinned result", (t) => {
  const install = fixture(t);
  const result = applyNodeForgePatch(install.projectRoot);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "patched");
  assert.equal(typeof result[0].path, "string");
  const patched = readFileSync(install.sourcePath(), "utf8");
  assert.equal(sha256(patched), PATCHED_SHA256);
  assert.ok(patched.includes(PATCHED_BLOCK));
  assert.ok(patched.includes(PATCHED_OID_BLOCK));
  assert.notEqual(patched, original);
});

test("reapplying and checking an installed patch are idempotent", (t) => {
  const install = fixture(t);
  applyNodeForgePatch(install.projectRoot);
  const patched = readFileSync(install.sourcePath());
  assert.equal(applyNodeForgePatch(install.projectRoot)[0].status, "verified");
  assert.equal(applyNodeForgePatch(install.projectRoot, { check: true })[0].status, "verified");
  assert.deepEqual(readFileSync(install.sourcePath()), patched);
});

test("check mode rejects an unpatched installation without changing it", (t) => {
  const install = fixture(t);
  assert.throws(() => applyNodeForgePatch(install.projectRoot, { check: true }));
  assert.equal(readFileSync(install.sourcePath(), "utf8"), original);
});

test("rejects an unsupported locked version and an installed version mismatch", (t) => {
  for (const entry of [
    { path: directPath, lockVersion: "1.3.1", version: "1.3.1" },
    { path: directPath, lockVersion: "1.4.0", version: "1.3.1" },
  ]) {
    const install = fixture(t, [entry]);
    assert.throws(() => applyNodeForgePatch(install.projectRoot));
    assert.equal(readFileSync(install.sourcePath(), "utf8"), original);
  }
});

test("rejects source changes outside the patch blocks without overwriting them", (t) => {
  const altered = original + "\n// unexpected installed-source modification\n";
  const install = fixture(t, [{ path: directPath, source: altered }]);
  assert.throws(() => applyNodeForgePatch(install.projectRoot));
  assert.throws(() => applyNodeForgePatch(install.projectRoot, { check: true }));
  assert.equal(readFileSync(install.sourcePath(), "utf8"), altered);
});

test("rejects absent installed dependencies and an absent RSA source", (t) => {
  const missingPackage = fixture(t, [{ path: directPath, missing: true }]);
  assert.throws(() => applyNodeForgePatch(missingPackage.projectRoot));
  const missingSource = fixture(t);
  rmSync(missingSource.sourcePath());
  assert.throws(() => applyNodeForgePatch(missingSource.projectRoot));
  const missingLockEntry = fixture(t, []);
  assert.throws(() => applyNodeForgePatch(missingLockEntry.projectRoot));
});

test("patches and verifies every direct and nested installed copy", (t) => {
  const install = fixture(t, [{ path: directPath }, { path: nestedPath }]);
  const result = applyNodeForgePatch(install.projectRoot);
  assert.deepEqual(result.map((item) => item.status), ["patched", "patched"]);
  assert.equal(new Set(result.map((item) => item.path)).size, 2);
  for (const dependencyPath of [directPath, nestedPath]) {
    assert.equal(sha256(readFileSync(install.sourcePath(dependencyPath))), PATCHED_SHA256);
  }
  assert.deepEqual(
    applyNodeForgePatch(install.projectRoot, { check: true }).map((item) => item.status),
    ["verified", "verified"],
  );
});

test("validates all copies before writing when a later copy has unexpected contents", (t) => {
  const altered = original + "\n// invalid second copy\n";
  const install = fixture(t, [{ path: directPath }, { path: nestedPath, source: altered }]);
  assert.throws(() => applyNodeForgePatch(install.projectRoot));
  assert.equal(readFileSync(install.sourcePath(), "utf8"), original);
  assert.equal(readFileSync(install.sourcePath(nestedPath), "utf8"), altered);
});

test("rejects lockfile path traversal and preserves both inside and outside source files", (t) => {
  const install = fixture(t);
  const traversal = "../outside/node_modules/node-forge";
  const outsideSource = writePackage(install.projectRoot, traversal);
  assert.ok(resolve(outsideSource).startsWith(resolve(install.temporary)));
  install.lock.packages[traversal] = { version: "1.4.0" };
  install.writeLock();
  assert.throws(() => applyNodeForgePatch(install.projectRoot));
  assert.equal(readFileSync(install.sourcePath(), "utf8"), original);
  assert.equal(readFileSync(outsideSource, "utf8"), original);
});
