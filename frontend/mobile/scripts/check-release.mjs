import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// install-links copies local packages. A successful export of a stale copy can
// silently ship older financial rules; require a fresh npm ci after core changes.
export function checkSharedCore(root) {
  const source = path.resolve(root, "../packages/core");
  const installed = path.join(root, "node_modules/@bokji/core");
  function compare(directory, relative = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) compare(path.join(directory, entry.name), name);
      else if (entry.isFile()) {
        let copy;
        try { copy = readFileSync(path.join(installed, name)); }
        catch { throw new Error("공유 core 설치본이 없습니다. frontend/mobile에서 npm ci를 실행하세요."); }
        if (!readFileSync(path.join(source, name)).equals(copy)) {
          throw new Error("공유 core 설치본이 오래되었습니다. frontend/mobile에서 npm ci를 실행하세요.");
        }
      }
    }
  }
  compare(source);
}

export function checkProjectId(config, { required = false } = {}) {
  const id = config.extra?.eas?.projectId;
  if ((required || id) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "")) {
    throw new Error("EXPO_PUBLIC_EAS_PROJECT_ID에 팀 Expo 프로젝트의 실제 UUID를 설정하세요.");
  }
}

function main() {
  const eas = process.argv.includes("--eas");
  const release = !eas || ["preview", "production"].includes(process.env.EAS_BUILD_PROFILE) || process.env.BOKJI_RELEASE === "1";
  process.env.NODE_ENV = release ? "production" : "development";
  require("@expo/env").load(mobileRoot, { silent: process.argv.includes("--print-api") });
  if (process.argv.includes("--print-api")) {
    process.stdout.write(process.env.EXPO_PUBLIC_API_BASE_URL || "");
    return;
  }
  checkSharedCore(mobileRoot);
  if (release) process.env.BOKJI_RELEASE = "1";
  const { exp } = require("@expo/config").getConfig(mobileRoot, { isPublicConfig: true });
  checkProjectId(exp, { required: eas });
  if (release && (!exp.android?.package || exp.android.allowBackup !== false)) {
    throw new Error("Android 앱 식별자와 백업 차단 설정을 확인하세요.");
  }
  console.log(release ? "Android 릴리스 설정과 공유 core 검증 통과." : "EAS 개발 빌드 설정과 공유 core 검증 통과.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
