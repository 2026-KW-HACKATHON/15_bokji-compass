// Deterministic mobile web QA; no real policy translation or model request is made.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { locales, translate } from "../../packages/core/src/i18n/index.js";

const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const output = fileURLToPath(
  new URL("../../../tmp/mobile-i18n/preview/", import.meta.url),
);
await mkdir(output, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};
const server = createServer(async (request, response) => {
  let path = resolve(
    root,
    "." + decodeURIComponent(new URL(request.url, "http://localhost").pathname),
  );
  if (!path.startsWith(root + sep)) path = resolve(root, "index.html");
  let data;
  try {
    data = await readFile(path);
  } catch {
    path = resolve(root, "index.html");
    data = await readFile(path);
  }
  response.setHeader(
    "Content-Type",
    mime[extname(path)] || "application/octet-stream",
  );
  response.end(data);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const original = {
  id: "main",
  revisionId: "12345678-1234-1234-1234-123456789abc",
  title: "외국인 주거 지원",
  summary: "한국어 공고 요약",
  tags: ["주거"],
  category: "주거",
  region: "서울",
  audience: "등록 외국인",
  organization: "담당 기관",
  benefit: "월세 지원",
  applicationPeriod: "2026년 10월",
  content: "공고 원문 본문",
  paymentSchedule: "월말",
  gender: "무관",
  contact: "02-123-4567",
  applicationMethod: "온라인 신청",
  otherConditions: ["거주 조건 확인"],
  sourceFields: { text: "공고 원문 본문", application_method: "온라인 신청" },
  sourceUrl: "https://example.test/original",
  applicationUrl: "https://example.test/apply",
};
const translated = {
  en: {
    title: "Housing support for foreign residents",
    summary: "Policy summary",
    audience: "Registered foreign residents",
    organization: "Responsible office",
    benefit: "Rent support",
    applicationPeriod: "2026-10",
    content: "Full notice body",
    paymentSchedule: "End of month",
    gender: "Any",
    contact: "02-123-4567",
    applicationMethod: "Apply online",
    otherConditions: ["Check residence requirements"],
    sourceFields: {
      text: "Full notice body",
      application_method: "Apply online",
    },
  },
  zh: {
    title: "外国居民住房援助",
    summary: "公告摘要",
    audience: "已登记外国居民",
    organization: "负责机构",
    benefit: "租金援助",
    applicationPeriod: "2026年10月",
    content: "公告完整正文",
    paymentSchedule: "月底",
    gender: "不限",
    contact: "02-123-4567",
    applicationMethod: "网上申请",
    otherConditions: ["确认居住条件"],
    sourceFields: { text: "公告完整正文", application_method: "网上申请" },
  },
  vi: {
    title: "Hỗ trợ nhà ở cho cư dân nước ngoài",
    summary: "Tóm tắt thông báo",
    audience: "Cư dân nước ngoài đã đăng ký",
    organization: "Cơ quan phụ trách",
    benefit: "Hỗ trợ tiền thuê",
    applicationPeriod: "Tháng 10 năm 2026",
    content: "Toàn bộ nội dung thông báo",
    paymentSchedule: "Cuối tháng",
    gender: "Không giới hạn",
    contact: "02-123-4567",
    applicationMethod: "Đăng ký trực tuyến",
    otherConditions: ["Kiểm tra điều kiện cư trú"],
    sourceFields: {
      text: "Toàn bộ nội dung thông báo",
      application_method: "Đăng ký trực tuyến",
    },
  },
  ja: {
    title: "外国人住民向け住宅支援",
    summary: "公示の概要",
    audience: "登録済みの外国人住民",
    organization: "担当機関",
    benefit: "家賃支援",
    applicationPeriod: "2026年10月",
    content: "公示の全文",
    paymentSchedule: "月末",
    gender: "不問",
    contact: "02-123-4567",
    applicationMethod: "オンライン申請",
    otherConditions: ["居住条件を確認"],
    sourceFields: { text: "公示の全文", application_method: "オンライン申請" },
  },
};
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [],
    requests = [];
  let fail = true;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("bokji.locale.v1"))
      localStorage.setItem("bokji.locale.v1", JSON.stringify("ko"));
  });
  await page.route("https://api.example.test/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname === "/health")
      return route.fulfill({
        headers,
        json: { status: "ok", service: "bokji-compass-backend" },
      });
    if (url.pathname.endsWith("/translation")) {
      requests.push(url);
      const language = url.searchParams.get("language"),
        id = url.pathname.split("/").at(-2);
      if (id === "fail" && fail) {
        fail = false;
        return route.fulfill({
          status: 503,
          headers,
          json: { detail: "fixture failure" },
        });
      }
      await new Promise((done) =>
        setTimeout(done, id === "slow" && language === "en" ? 500 : 80),
      );
      return route.fulfill({
        headers,
        json: {
          policy_id: id,
          revision_id: original.revisionId,
          language,
          source_language: "ko",
          source_hash: "a".repeat(64),
          cached: false,
          translation: translated[language],
        },
      });
    }
    if (url.pathname === "/v1/policies")
      return route.fulfill({
        headers,
        json: { items: [original], total: 1, nextCursor: null },
      });
    const id = url.pathname.split("/").at(-1);
    return route.fulfill({ headers, json: { ...original, id } });
  });
  let locale = "ko";
  const t = (key) => translate(locale, key);
  const choose = async (next) => {
    await page
      .getByRole("button", { name: t("언어 선택"), exact: true })
      .click();
    await page
      .getByRole("radio", {
        name: locales.find((item) => item.code === next).nativeName,
        exact: true,
      })
      .first()
      .click();
    locale = next;
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("bokji.locale.v1")))
      .toBe(JSON.stringify(next));
  };
  await page.goto(base + "/policies/main");
  await expect(
    page.getByRole("heading", { name: original.title, exact: true }),
  ).toBeVisible();
  assert.equal(requests.length, 0, "Korean view makes no translation request");
  for (const next of ["en", "zh", "vi", "ja"]) {
    await choose(next);
    await expect(
      page.getByRole("heading", { name: translated[next].title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(translated[next].benefit, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: t("공고 본문 보기"), exact: true })
      .click();
    await expect(
      page.getByText(translated[next].content, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: t("공고 본문 보기"), exact: true })
      .click();
    await page
      .getByRole("button", { name: t("한국어 원문 보기"), exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: original.title, exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: resolve(output, `${next}-original.png`) });
    // Changing locale must reset an original-view toggle and start translated.
    if (next !== "ja") continue;
    await page
      .getByRole("button", { name: t("번역 보기"), exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: translated[next].title, exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: resolve(output, `${next}-translated.png`) });
  }
  await page.reload();
  await expect(
    page.getByRole("heading", { name: translated.ja.title, exact: true }),
  ).toBeVisible();
  await choose("en");
  await page.goto(base + "/policies/fail");
  await expect(
    page.getByRole("button", { name: t("번역 다시 시도"), exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: original.title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: t("번역 다시 시도"), exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: translated.en.title, exact: true }),
  ).toBeVisible();
  await page.goto(base + "/policies/slow");
  await expect(
    page.getByText(
      t("공고를 번역하고 있어요. 한국어 원문을 먼저 표시합니다."),
      { exact: true },
    ),
  ).toBeVisible();
  await choose("vi");
  await expect(
    page.getByRole("heading", { name: translated.vi.title, exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(650);
  await expect(
    page.getByRole("heading", { name: translated.vi.title, exact: true }),
  ).toBeVisible();
  await page.goto(base + "/");
  await expect(
    page.getByRole("button", {
      name: t("{title} 자세히 보기").replace("{title}", translated.vi.title),
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(output, "vi-home.png") });
  await page.goto(base + "/account");
  await expect(
    page.getByRole("radio", { name: "Tiếng Việt", exact: true }),
  ).toBeChecked();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
    false,
    "Mobile viewport has no horizontal page overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 5 mobile locales; persisted selection; 4 full policy translations; original toggle/reset; error retry; stale language guard; translated home card; no JS errors/overflow",
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
