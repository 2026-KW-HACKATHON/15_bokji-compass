import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { applyBracesPatch, PATCHES } from "../scripts/apply-braces-security-patch.mjs";

const require = createRequire(import.meta.url);
const braces = require("braces");
const hash = (source) => createHash("sha256").update(source).digest("hex");
const installed = dirname(require.resolve("braces/package.json"));
const originals = new Map(
  PATCHES.map((spec) => {
    let source = readFileSync(join(installed, spec.file), "utf8");
    if (hash(source) === spec.patched)
      for (const [before, after] of spec.replacements) source = source.split(after).join(before);
    assert.equal(hash(source), spec.original);
    return [spec.file, source];
  }),
);

function fixture(t, copies = ["node_modules/braces"]) {
  const root = mkdtempSync(join(tmpdir(), "bokji-braces-install-"));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("bokji-braces-install-"));
    rmSync(root, { recursive: true, force: true });
  });
  const lock = { lockfileVersion: 3, packages: {} };
  for (const path of copies) {
    const directory = join(root, path);
    mkdirSync(join(directory, "lib"), { recursive: true });
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ name: "braces", version: "3.0.3" }),
    );
    for (const [file, source] of originals) writeFileSync(join(directory, file), source);
    lock.packages[path] = { version: "3.0.3" };
  }
  writeFileSync(join(root, "package-lock.json"), JSON.stringify(lock));
  return root;
}

test("braces retains ranges, nested alternatives, escaped braces and Unicode", () => {
  assert.deepEqual(braces.expand("src/{a,b}.{js,ts}"), [
    "src/a.js",
    "src/a.ts",
    "src/b.js",
    "src/b.ts",
  ]);
  assert.deepEqual(braces.expand("{01..03}"), ["01", "02", "03"]);
  assert.deepEqual(braces.expand("{가,{나,다}}"), ["가", "나", "다"]);
  assert.equal(braces.stringify("a/\\{b,c\\}/d", { keepEscaping: true }), "a/\\{b,c\\}/d");
  assert.equal(braces.compile("src/{a,b}.js"), "src/(a|b).js");
});

test("Metro's micromatch keeps ordinary include/exclude patterns", () => {
  const metroRequire = createRequire(require.resolve("metro/package.json"));
  const micromatch = metroRequire("micromatch");
  const micromatchRequire = createRequire(metroRequire.resolve("micromatch"));
  assert.equal(micromatchRequire.resolve("braces"), require.resolve("braces"));
  assert.deepEqual(
    micromatch(["src/a.ts", "tests/b.js", "src/c.css", "other/a.ts"], "{src,tests}/**/*.{js,ts}"),
    ["src/a.ts", "tests/b.js"],
  );
});

for (const method of ["parse", "compile", "expand", "stringify"]) {
  test(`braces.${method} rejects deep braces and parentheses with a bounded error`, () => {
    for (const [open, close] of [
      ["{", "}"],
      ["(", ")"],
    ]) {
      const pattern = open.repeat(4000) + "a" + close.repeat(4000);
      assert.ok(pattern.length < 10000, "Payload must pass the upstream length check");
      assert.throws(() => braces[method](pattern), /nesting depth exceeds security limit/);
    }
  });
}

for (const method of ["compile", "expand", "stringify"]) {
  test(`braces.${method} also bounds caller-supplied AST traversal`, () => {
    let ast = { type: "text", value: "a" };
    for (let i = 0; i < 300; i++) {
      const parent = { type: "brace", nodes: [ast] };
      ast.parent = parent;
      ast = parent;
    }
    ast.type = "root";
    assert.throws(() => braces[method](ast), /nesting depth exceeds security limit/);
  });
}

test("deep patterns reject in a worker without exhausting its stack or time budget", async () => {
  await new Promise((resolve, reject) => {
    const worker = new Worker(
      `const { parentPort, workerData } = require('node:worker_threads'); const braces = require(workerData); let rejected = 0; for (let i = 0; i < 100; i++) { try { braces.compile('{'.repeat(4000) + 'a' + '}'.repeat(4000)); } catch (error) { if (/nesting depth exceeds security limit/.test(error.message)) rejected++; else throw error; } } parentPort.postMessage(rejected);`,
      { eval: true, workerData: require.resolve("braces") },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("braces exceeded 5 seconds"));
    }, 5000);
    worker.once("message", (count) => {
      clearTimeout(timer);
      void worker.terminate();
      if (count === 100) resolve();
      else reject(new Error("deep input accepted"));
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
});

test("fresh and nested copies are patched and subsequent checks are read-only", (t) => {
  const root = fixture(t, ["node_modules/braces", "node_modules/metro/node_modules/braces"]);
  assert.throws(() => applyBracesPatch(root, { check: true }), /patch missing/);
  assert.deepEqual(applyBracesPatch(root), { copies: 2, files: 8 });
  assert.deepEqual(applyBracesPatch(root, { check: true }), { copies: 2, files: 8 });
  assert.deepEqual(applyBracesPatch(root), { copies: 2, files: 8 });
  for (const spec of PATCHES)
    assert.equal(hash(readFileSync(join(root, "node_modules/braces", spec.file))), spec.patched);
});

test("an unknown nested source prevents every write", (t) => {
  const root = fixture(t, ["node_modules/braces", "node_modules/metro/node_modules/braces"]);
  writeFileSync(
    join(root, "node_modules/metro/node_modules/braces/lib/expand.js"),
    "unknown source",
  );
  assert.throws(() => applyBracesPatch(root), /unknown source checksum/);
  for (const spec of PATCHES)
    assert.equal(hash(readFileSync(join(root, "node_modules/braces", spec.file))), spec.original);
});

test("unsupported versions and escaping lock paths fail closed", (t) => {
  const root = fixture(t);
  for (const packages of [
    { "node_modules/braces": { version: "3.0.4" } },
    { "node_modules/../../braces/node_modules/braces": { version: "3.0.3" } },
  ]) {
    writeFileSync(join(root, "package-lock.json"), JSON.stringify({ packages }));
    assert.throws(() => applyBracesPatch(root));
  }
});
