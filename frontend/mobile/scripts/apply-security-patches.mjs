import { applyNodeForgePatch } from "./apply-node-forge-security-patch.mjs";
import { applyBracesPatch } from "./apply-braces-security-patch.mjs";

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check"))
    throw new Error("Usage: apply-security-patches.mjs [--check]");
  const options = { check: args.includes("--check") };
  const forge = applyNodeForgePatch(undefined, options);
  const braces = applyBracesPatch(undefined, options);
  console.log(
    `Security patches verified: ${forge.length} node-forge and ${braces.copies} braces copy/copies.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
