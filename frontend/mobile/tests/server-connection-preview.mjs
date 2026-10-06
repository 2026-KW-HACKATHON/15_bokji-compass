// Run against `npm run web -- --port 8081`; routes mock failures without stopping the live server.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const output = new URL("../../../tmp/mobile-connection/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.on("pageerror", (error) => errors.push(error.message));
    let mode = "network";
    await page.route("**/api/**", (route) => {
      if (mode === "network") return route.abort("connectionrefused");
      if (mode === "server") return route.fulfill({ status: 503, body: "private upstream detail" });
      return route.fulfill({ json: route.request().url().endsWith("/health")
        ? { status: "ok", service: "bokji-compass-backend" }
        : { items: [], total: 0, nextCursor: null } });
    });
    await page.goto("http://localhost:8081", { timeout: 120000 });
    const notice = page.getByRole("heading", { name: "서버 연결이 원활하지 않아요", exact: true }).filter({ visible: true });
    const retry = page.getByRole("button", { name: "다시 연결", exact: true }).filter({ visible: true });
    await expect(notice).toBeVisible();
    await expect(page.getByText(/서버가 꺼져 있거나/).filter({ visible: true })).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL(`offline-${width}.png`, output)) });
    await page.getByRole("switch", { name: "쉬운 화면", exact: true }).click();
    await expect(retry).toBeVisible();
    await page.getByRole("tab", { name: /계산/ }).click();
    await expect(notice).toBeVisible();
    await page.getByRole("tab", { name: /계정/ }).click();
    await expect(notice).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL(`offline-easy-${width}.png`, output)) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    mode = "healthy";
    await retry.click();
    await expect(notice).toHaveCount(0);
    // A later service failure on another screen restores the shared warning.
    mode = "server";
    await page.getByRole("tab", { name: /공고/ }).click();
    await expect(notice).toBeVisible();
    await expect(notice.locator("..").getByText("서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 연결해 주세요.", { exact: true })).toBeVisible();
    await expect(page.getByText("private upstream detail")).toHaveCount(0);
    mode = "healthy";
    await retry.click();
    await expect(notice).toHaveCount(0);
    if (width === 390) {
      // An idle screen must also detect a later outage through the 30s health timer.
      mode = "server";
      await expect(notice).toBeVisible({ timeout: 35000 });
      mode = "healthy";
      await retry.click();
      await expect(notice).toHaveCount(0);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log("PASS: 320/390px, startup failure, all tabs, easy mode, retry/recovery, later 503, idle health polling, no private details or horizontal overflow");
} finally { await browser.close(); }
