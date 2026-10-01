// Uses the repository's existing Playwright install. Start serve-api.py and Expo web first.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const artifacts = new URL("../../../tmp/mobile-preview/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:8081", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page
    .getByRole("button", { name: "서버 연결 확인", exact: true })
    .click();
  await page.getByText("서버에 연결됐습니다.", { exact: false }).waitFor();
  await page
    .getByText("복지나침반 · 모바일", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: new URL("home.png", artifacts).pathname.replace(/^\/(\w:)/, "$1"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "내 계정으로 이동", exact: true })
    .click();
  async function login() {
    await page.getByLabel("아이디", { exact: true }).fill("mobile_preview");
    await page.getByLabel("비밀번호", { exact: true }).fill("PreviewOnly42!");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.getByText("앱 테스트님", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "금융정보 불러오러 가기", exact: true })
      .click();
  }
  await login();
  let steps = 0;
  while (
    await page.getByRole("button", { name: "다음", exact: true }).count()
  ) {
    assert.ok(++steps < 25);
    const age = page.getByLabel("만 나이 (세)", { exact: true });
    if (await age.count()) await age.fill("30");
    const income = page.getByLabel("근로소득 (월·세전 기준) (만원)", {
      exact: true,
    });
    if (await income.count()) {
      await income.fill("250");
      await page.getByRole("radio", { name: "세전 금액", exact: true }).click();
    }
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "참고 금액 계산하기", exact: true })
    .click();
  await page.getByText("참고 계산을 완료했습니다.", { exact: true }).waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "내 계정에 저장", exact: true })
      .isDisabled(),
  );
  await page.getByLabel("금융정보 계정 저장 동의", { exact: true }).click();
  await page
    .getByRole("button", { name: "내 계정에 저장", exact: true })
    .click();
  await page.getByText("내 계정에 저장했습니다.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "이 화면의 입력 지우기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "화면 입력 지우기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "저장한 정보 불러오기", exact: true })
    .click();
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page
    .getByText("저장한 정보를 불러왔습니다.", { exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "소득·재산 계산", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: new URL("finance.png", artifacts).pathname.replace(/^\/(\w:)/, "$1"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "계정에 저장한 정보 삭제", exact: true })
    .click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page
    .getByRole("button", { name: "계정에 저장한 정보 삭제", exact: true })
    .click();
  await page
    .getByRole("button", { name: "저장 정보 삭제하기", exact: true })
    .click();
  await page
    .getByText("계정에 저장한 금융정보와 화면의 입력을 삭제했습니다.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("tab", { name: /내 계정/ }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByLabel("아이디", { exact: true }).waitFor();
  await page.getByRole("tab", { name: /소득·재산/ }).click();
  assert.equal(await page.getByText("계산 결과", { exact: true }).count(), 0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false);
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  assert.ok(
    !storage.includes("PreviewOnly42!") &&
      !storage.includes("access_token") &&
      !storage.includes("earned_income"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real API login, calculation, consent, save, load, delete confirmation, logout, private-state clearing, mobile-width layout.",
  );
} finally {
  await browser.close();
}
