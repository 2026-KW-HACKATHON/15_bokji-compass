// Local remediation for GHSA-vfj7-8cjw-p6xm / CVE-2026-93687.
// Keep ordinary glob behavior while bounding parsed and caller-supplied AST depth.
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const guard =
  "    if (depth > 128) throw new RangeError('braces nesting depth exceeds security limit');\n";
export const PATCHES = [
  {
    file: "lib/parse.js",
    original: "e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310",
    patched: "43c7140950bc9749e74035e30a34726b63a63889cda08783fbc89c87c1e75f7b",
    replacements: [
      [
        "      stack.push(block);",
        "      if (stack.length >= 128) throw new RangeError('braces nesting depth exceeds security limit');\n      stack.push(block);",
        2,
      ],
    ],
  },
  {
    file: "lib/compile.js",
    original: "dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f",
    patched: "021b8d8cf5c67fb1686dc88aec9f0858b54d7b6827652441215077a3b889f060",
    replacements: [
      [
        "  const walk = (node, parent = {}) => {\n",
        "  const walk = (node, parent = {}, depth = 0) => {\n" + guard,
        1,
      ],
      ["walk(child, node)", "walk(child, node, depth + 1)", 1],
    ],
  },
  {
    file: "lib/expand.js",
    original: "41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7",
    patched: "54b2bc222139c01667c5adb5ef385d580ff3e3c0d1d1a2d3a1e5d44d923bea80",
    replacements: [
      [
        "  const walk = (node, parent = {}) => {\n",
        "  const walk = (node, parent = {}, depth = 0) => {\n" + guard,
        1,
      ],
      ["walk(child, node)", "walk(child, node, depth + 1)", 1],
    ],
  },
  {
    file: "lib/stringify.js",
    original: "379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a",
    patched: "6407b9deb5a6d0c56e927007c8deb28c3d79bbf6399128f34458463b7ca0ce27",
    replacements: [
      [
        "  const stringify = (node, parent = {}) => {\n",
        "  const stringify = (node, parent = {}, depth = 0) => {\n" + guard,
        1,
      ],
      ["stringify(child)", "stringify(child, {}, depth + 1)", 1],
    ],
  },
];

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (source) => createHash("sha256").update(source).digest("hex");

function checkedFile(root, path) {
  const file = realpathSync(resolve(root, path));
  const local = relative(root, file);
  if (isAbsolute(local) || local === ".." || local.startsWith(`..${sep}`))
    throw new Error("braces security patch: dependency path escapes project");
  return file;
}

export function patchBracesSource(source, spec) {
  if (digest(source) !== spec.original)
    throw new Error("braces security patch: unknown source checksum");
  let result = source;
  for (const [before, after, count] of spec.replacements) {
    if (result.split(before).length !== count + 1)
      throw new Error("braces security patch: expected source block missing or duplicated");
    result = result.split(before).join(after);
  }
  if (digest(result) !== spec.patched)
    throw new Error("braces security patch: patched checksum mismatch");
  return result;
}

export function applyBracesPatch(projectRoot = mobileRoot, { check = false } = {}) {
  const root = realpathSync(projectRoot);
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const entries = Object.entries(lock.packages ?? {}).filter(([path]) =>
    /(^|\/)node_modules\/braces$/.test(path),
  );
  if (!entries.length)
    throw new Error("braces security patch: dependency absent from lockfile; review required");
  // Check every copy and every source before changing any file.
  const plans = entries.flatMap(([path, locked]) => {
    if (
      !path.startsWith("node_modules/") ||
      path.includes("\\") ||
      path.includes(":") ||
      path.split("/").some((part) => ["", ".", ".."].includes(part))
    )
      throw new Error("braces security patch: invalid dependency path");
    const metadata = JSON.parse(readFileSync(checkedFile(root, `${path}/package.json`), "utf8"));
    if (locked.version !== "3.0.3" || metadata.name !== "braces" || metadata.version !== "3.0.3")
      throw new Error(
        "braces security patch: unsupported version; review upstream before updating",
      );
    return PATCHES.map((spec) => {
      const file = checkedFile(root, `${path}/${spec.file}`);
      const source = readFileSync(file, "utf8");
      if (digest(source) === spec.patched) return { file, status: "verified" };
      if (digest(source) !== spec.original)
        throw new Error(`braces security patch: unknown source checksum at ${path}/${spec.file}`);
      if (check) throw new Error("braces security patch missing; run npm run security:patch");
      return { file, status: "patched", source: patchBracesSource(source, spec) };
    });
  });
  for (const plan of plans) {
    if (plan.status === "verified") continue;
    const temporary = `${plan.file}.security-${process.pid}-${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, plan.source, { flag: "wx" });
      renameSync(temporary, plan.file);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  // Also verify writes before reporting success.
  if (!check) applyBracesPatch(root, { check: true });
  return { copies: entries.length, files: plans.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--check"))
      throw new Error("Usage: apply-braces-security-patch.mjs [--check]");
    const result = applyBracesPatch(mobileRoot, { check: args.includes("--check") });
    console.log(`CVE-2026-93687: ${result.copies} braces copy/copies patched and verified.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
