// Local remediation for GHSA-86w9-cpqp-85rv / CVE-2026-85393.
// See ../../docs/node-forge-security-fix.md for provenance and removal criteria.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ORIGINAL_SHA256 = "fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50";
export const PATCHED_SHA256 = "7948121fb94d910d030d006926f76bc90510b657873875779734f34587c83f5f";

export const ORIGINAL_BLOCK = `          // validate DigestInfo structure and element count
          var capture = {};
          var errors = [];
          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||
            obj.value.length !== 2) {`;

export const PATCHED_BLOCK = `          // CVE-2026-85393: consume every nested field and require canonical DER.
          // Optional NULL parameters must be empty; BER slack is not valid here.
          var capture = {};
          var errors = [];
          if(!asn1.validate(obj, digestInfoValidator, capture, errors) ||
            obj.value.length !== 2 ||
            obj.value[0].value.length !== (('parameters' in capture) ? 2 : 1) ||
            ('parameters' in capture && capture.parameters !== '') ||
            asn1.toDer(obj).getBytes() !== d) {`;

export const ORIGINAL_OID_BLOCK = `          if(!(oid === forge.oids.md2 ||`;
export const PATCHED_OID_BLOCK = `          // Reject non-canonical OID bytes that decode to an allowed algorithm.
          if(asn1.oidToDer(oid).getBytes() !== capture.algorithmIdentifier ||
            !(oid === forge.oids.md2 ||`;

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");

function checkedFile(root, path) {
  const file = realpathSync(resolve(root, path));
  const local = relative(root, file);
  if (isAbsolute(local) || local === ".." || local.startsWith(`..${sep}`)) {
    throw new Error("node-forge security patch: dependency path escapes project");
  }
  return file;
}

function patchSource(source) {
  for (const block of [ORIGINAL_BLOCK, ORIGINAL_OID_BLOCK]) {
    if (source.split(block).length !== 2) {
      throw new Error("node-forge security patch: expected source block missing or duplicated");
    }
  }
  const patched = source.replace(ORIGINAL_BLOCK, PATCHED_BLOCK)
    .replace(ORIGINAL_OID_BLOCK, PATCHED_OID_BLOCK);
  if (digest(patched) !== PATCHED_SHA256) {
    throw new Error("node-forge security patch: patched source checksum mismatch");
  }
  return patched;
}

export function applyNodeForgePatch(projectRoot = mobileRoot, { check = false } = {}) {
  const root = realpathSync(projectRoot);
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const entries = Object.entries(lock.packages ?? {}).filter(([path]) =>
    /(^|\/)node_modules\/node-forge$/.test(path));
  if (entries.length === 0) {
    throw new Error("node-forge security patch: dependency absent from lockfile; review required");
  }

  // Validate every installed copy before writing any of them, including nested dependencies.
  const plans = entries.map(([path, locked]) => {
    if (!path.startsWith("node_modules/") || path.includes("\\") ||
        path.includes(":") || path.split("/").some((part) => ["", ".", ".."].includes(part))) {
      throw new Error("node-forge security patch: invalid dependency path");
    }
    const metadata = JSON.parse(readFileSync(checkedFile(root, `${path}/package.json`), "utf8"));
    if (locked.version !== "1.4.0" || metadata.name !== "node-forge" || metadata.version !== "1.4.0") {
      throw new Error("node-forge security patch: unsupported version; review upstream before updating");
    }
    const file = checkedFile(root, `${path}/lib/rsa.js`);
    const source = readFileSync(file);
    const hash = digest(source);
    if (hash === PATCHED_SHA256) return { path, file, status: "verified" };
    if (hash !== ORIGINAL_SHA256) {
      throw new Error(`node-forge security patch: unknown source checksum at ${path}`);
    }
    if (check) {
      throw new Error("node-forge security patch missing; run npm run security:patch");
    }
    return { path, file, status: "patched", source: patchSource(source.toString("utf8")) };
  });

  for (const plan of plans) {
    if (plan.status === "verified") continue;
    const temporary = `${plan.file}.security-${process.pid}-${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, plan.source, { flag: "wx" });
      renameSync(temporary, plan.file);
      if (digest(readFileSync(plan.file)) !== PATCHED_SHA256) {
        throw new Error("node-forge security patch: verification after write failed");
      }
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  return plans.map(({ path, status }) => ({ path, status }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--check")) throw new Error("Usage: apply-node-forge-security-patch.mjs [--check]");
    const results = applyNodeForgePatch(mobileRoot, { check: args.includes("--check") });
    console.log(`CVE-2026-85393: ${results.length} node-forge copy/copies patched and verified.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
