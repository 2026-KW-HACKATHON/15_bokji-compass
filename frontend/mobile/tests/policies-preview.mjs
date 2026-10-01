// Deterministic UI checks: fixture responses exist only inside this test browser.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const output = new URL("../../../tmp/mobile-policies/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const items = Array.from({ length: 8 }, (_, index) => ({
  id: `test-policy-${index}`,
  title: `테스트 전용 주거 지원 ${index + 1}`,
  summary: "목록과 상세 화면 검증용 응답입니다.",
  category: "주거",
  region: "서울",
  audience: "공식 조건 확인",
  organization: "테스트 기관",
  benefit: "지원 내용 테스트",
  applicationPeriod: "공식 공고 확인",
  tags: ["주거"],
  sourceUrl: "https://example.test/policy",
}));
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const requests = [];
  let fail = true;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/v1/policies**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (url.pathname === "/v1/policies") {
      if (url.searchParams.get("q") === "오류" && fail) {
        fail = false;
        return route.fulfill({ status: 503, json: { detail: "test failure" } });
      }
      const all = url.searchParams.get("q") === "없는공고" ? [] : items;
      const cursor = Number(url.searchParams.get("cursor") || 0),
        limit = Number(url.searchParams.get("limit"));
      return route.fulfill({
        json: {
          items: all.slice(cursor, cursor + limit),
          total: all.length,
          nextCursor:
            cursor + limit < all.length ? String(cursor + limit) : null,
        },
      });
    }
    const item = items.find((item) => url.pathname.endsWith("/" + item.id));
    return route.fulfill({
      status: item ? 200 : 404,
      json: item || { detail: "not found" },
    });
  });
  await page.goto("http://localhost:8081", {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  const easy = page.getByRole("switch", { name: "쉬운 화면", exact: true });
  await expect(easy).toBeVisible();
  const before = await easy.boundingBox();
  assert.ok(before.y < 100);
  await page
    .getByRole("button", { name: "서버 연결 확인", exact: true })
    .scrollIntoViewIfNeeded();
  assert.ok(Math.abs((await easy.boundingBox()).y - before.y) < 3);
  await easy.click();
  await expect(easy).toBeChecked();
  await page
    .getByRole("button", { name: "공고 찾아보기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "공고 목록 · 8개", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "공고 자세히 보기", exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: items[3].title, exact: true }),
  ).toBeVisible();
  await easy.click();
  await expect(
    page.getByRole("button", { name: "공고 자세히 보기", exact: true }),
  ).toHaveCount(6);
  await page
    .getByRole("button", { name: "공고 자세히 보기", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "지원 내용", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "공식 공고 보기", exact: true }),
  ).toBeVisible();
  await expect(easy).toBeVisible();
  await page.screenshot({
    path: new URL("detail.png", output).pathname.replace(/^\/(\w:)/, "$1"),
  });
  await page
    .getByRole("button", { name: "공고 목록으로", exact: true })
    .click();
  await page
    .getByRole("button", { name: "분야·지역 선택", exact: true })
    .click();
  await page.getByRole("radio", { name: "서울", exact: true }).click();
  await expect
    .poll(() => requests.at(-1).searchParams.get("region"))
    .toBe("서울");
  await page.getByLabel("공고 검색", { exact: true }).fill("없는공고");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(
    page.getByText("조건에 맞는 공고가 없어요.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("공고 검색", { exact: true }).fill("오류");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "다시 시도하기", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "다시 시도하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "공고 목록 · 8개", exact: true }),
  ).toBeVisible();
  await page.goto("http://localhost:8081/policies/missing");
  await expect(
    page.getByText(
      "공개된 공고를 찾을 수 없어요. 목록에서 다시 선택해 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: fixed easy switch, pagination/mode reset, filters, detail, empty/error/retry/404; no JS errors",
  );
} finally {
  await browser.close();
}
