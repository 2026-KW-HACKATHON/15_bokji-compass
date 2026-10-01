// Mobile viewport regression checks; policy data is a browser-only test fixture.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const output = new URL("../../../tmp/mobile-easy/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const policy = {
  id: "layout-test",
  title: "청년 주거 지원 신청 안내",
  category: "주거",
  region: "서울",
  summary: "이 요약은 펼쳐서 확인할 수 있습니다.",
  benefit: "가구별 조건에 따라 지원 금액과 신청 방법이 달라집니다. ".repeat(14),
  audience: "지원 대상의 세부 조건은 공식 공고에서 확인해야 합니다. ".repeat(
    12,
  ),
  applicationPeriod: "2026년 10월 1일 ~ 10월 31일",
  organization: "테스트 기관",
  sourceUrl: "https://example.test/policy",
  tags: [],
};
try {
  for (const width of [320, 390, 430]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 320 ? 640 : 844 },
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/v1/policies**", (route) =>
      route.fulfill({
        json: route.request().url().includes("layout-test")
          ? policy
          : { items: [policy], total: 1, nextCursor: null },
      }),
    );
    await page.goto("http://localhost:8081", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("button", { name: "복지 지원 알아보기", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: fileURLToPath(new URL(`home-normal-${width}.png`, output)),
    });
    const easy = page.getByRole("switch", { name: "쉬운 화면", exact: true });
    await easy.click();
    await expect(easy).toBeChecked();
    const primary = await page
      .getByRole("button", { name: "공고 찾아보기", exact: true })
      .boundingBox();
    assert.ok(primary.y + primary.height < page.viewportSize().height - 64);
    if (width >= 390) {
      const calculate = await page
        .getByRole("button", { name: "중위소득 계산하기", exact: true })
        .boundingBox();
      assert.ok(
        calculate.y + calculate.height < page.viewportSize().height - 64,
      );
    }
    await expect(
      page.getByRole("button", { name: "서버 연결 확인", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: fileURLToPath(new URL(`home-${width}.png`, output)),
    });
    await page.getByRole("button", { name: "다음 배너", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "소득 비율 확인하기", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "복지 지원 알아보기", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "다음 배너", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "내 계정 살펴보기", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "다음 배너", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "복지 지원 알아보기", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "이전 배너", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "내 계정 살펴보기", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "내 계정 살펴보기", exact: true })
      .click();
    await expect(page.getByLabel("아이디", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /홈/ }).click();
    // Scroll gesture path shares the same page state as the arrow controls.
    await page
      .getByTestId("home-banner-scroll")
      .evaluate((node) => node.scrollTo({ left: 0 }));
    await expect(
      page.getByRole("button", { name: "복지 지원 알아보기", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "중위소득 계산하기", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "계산·저장 안내", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByText(
        "로그인 없이 계산할 수 있어요. 입력한 정보는 앱을 종료하면 사라집니다.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await page.screenshot({
      path: fileURLToPath(new URL(`finance-${width}.png`, output)),
    });
    await page.getByRole("tab", { name: /공고/ }).click();
    await page
      .getByRole("button", { name: "공고 자세히 보기", exact: true })
      .click();
    await expect(page.getByText(policy.summary, { exact: true })).toHaveCount(
      0,
    );
    const expand = page.getByRole("button", {
      name: "지원 내용 전체 보기",
      exact: true,
    });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expand.click();
    await expect(
      page.getByRole("button", { name: "지원 내용 접기", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await page
      .getByRole("button", { name: "지원 내용 접기", exact: true })
      .click();
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await page
      .getByRole("button", { name: "공고 요약 보기", exact: true })
      .click();
    await expect(
      page.getByText(policy.summary, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('[role="button"],input,[role="heading"]')]
        .filter((node) => {
          if (node.closest('[aria-hidden="true"]')) return false;
          const box = node.getBoundingClientRect();
          return box.width > 0 && (box.x < -1 || box.right > innerWidth + 1);
        })
        .map((node) => node.textContent),
    );
    assert.deepEqual(overflow, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await easy.click();
    await expect(
      page.getByRole("button", { name: "지원 내용 전체 보기", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(policy.summary, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 320/390/430px layouts, banner paging/wrap/scroll/navigation, visible primary actions, disclosure/full text and no horizontal overflow",
  );
} finally {
  await browser.close();
}
