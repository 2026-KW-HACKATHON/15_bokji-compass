// Run against Expo web on :8085; native OS permission requires a rebuilt Android app.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  defaultPreferences,
  notificationTypes,
} from "../src/features/notifications/model.js";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const output = new URL("../../../tmp/mobile-notifications/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [320, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => {
      if (entry.type() === "error" && /Unexpected text node|Text strings must|React has detected/.test(entry.text()))
        errors.push(entry.text());
    });
    const settings = {
      first: { ...defaultPreferences },
      second: { ...defaultPreferences },
    };
    let member = "first";
    let failSave = false;
    let saveCount = 0;
    await page.route("**/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const user = { id: member, username: member, name: "알림 테스트" };
      if (path.endsWith("/mobile/auth/login")) {
        member = request.postDataJSON().username;
        return route.fulfill({
          json: {
            access_token: (member === "first" ? "A" : "B").repeat(43),
            token_type: "Bearer",
            expires_in: 3600,
            user: { ...user, id: member, username: member },
          },
        });
      }
      if (path.endsWith("/mobile/auth/me"))
        return route.fulfill({ json: { user } });
      if (path.endsWith("/mobile/auth/logout"))
        return route.fulfill({ json: { message: "로그아웃했어요." } });
      if (path.endsWith("/notifications/preferences")) {
        assert.equal(
          request.headers().authorization,
          "Bearer " + (member === "first" ? "A" : "B").repeat(43),
        );
        if (request.method() === "POST") {
          saveCount++;
          if (failSave)
            return route.fulfill({
              status: 503,
              json: { detail: "private error" },
            });
          settings[member] = request.postDataJSON();
        }
        return route.fulfill({ json: settings[member] });
      }
      return route.abort();
    });
    const button = (name) => page.getByRole("button", { name, exact: true });
    const toggle = (name) => page.getByRole("switch", { name, exact: true });
    await page.goto("http://localhost:8085/account", {
      waitUntil: "networkidle",
      timeout: 120000,
    });
    await expect(
      page.getByText("로그인하면 전체 수신과 알림 종류를 선택할 수 있어요."),
    ).toBeVisible();
    async function login(name) {
      await page.getByLabel("아이디", { exact: true }).fill(name);
      await page
        .getByLabel("비밀번호", { exact: true })
        .fill("NotificationFixture42!");
      await button("로그인").click();
      await expect(toggle("전체 푸시 알림")).toBeEnabled();
    }
    await login("first");
    await expect(toggle("전체 푸시 알림")).not.toBeChecked();
    await toggle("전체 푸시 알림").click();
    await expect(toggle("전체 푸시 알림")).toBeChecked();
    await expect(toggle("전체 푸시 알림")).toBeEnabled();
    await toggle("즐겨찾기와 유사한 공고").click();
    await expect(toggle("즐겨찾기와 유사한 공고")).not.toBeChecked();
    await expect(toggle("전체 푸시 알림")).toBeEnabled();
    failSave = true;
    await toggle("지원한 공고의 발표일").click();
    await expect(
      page.getByText(
        "서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeVisible();
    await expect(toggle("지원한 공고의 발표일")).toBeChecked();
    assert.equal(settings.first.application_results, true);
    failSave = false;
    await toggle("전체 푸시 알림").click();
    await expect(toggle("전체 푸시 알림")).not.toBeChecked();
    await expect(toggle("전체 푸시 알림")).toBeEnabled();
    await expect(toggle("즐겨찾기와 유사한 공고")).not.toBeChecked();
    await page.getByRole("switch", { name: "쉬운 화면", exact: true }).click();
    await page
      .getByRole("heading", { name: "푸시 알림 설정" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: fileURLToPath(new URL(`settings-${width}.png`, output)),
      fullPage: true,
    });
    for (const type of notificationTypes) {
      await toggle(type.title).scrollIntoViewIfNeeded();
      const box = await toggle(type.title).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
    }
    await button("로그아웃").click();
    await expect(toggle("전체 푸시 알림")).toHaveCount(0);
    await login("second");
    await expect(toggle("즐겨찾기와 유사한 공고")).toBeChecked();
    assert.equal(saveCount, 4);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Notification settings: 320/390/430px, easy mode, master/category switches, save failure and account isolation passed.",
  );
} finally {
  await browser.close();
}
