// Browser-only fixtures exercise the native-compatible assistant without changing service data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { chromium, expect } = require("@playwright/test");
const output = new URL("../../../tmp/mobile-assistant/", import.meta.url);
await mkdir(output, { recursive: true });
const revision = "11111111-1111-1111-1111-111111111111";
const policy = {
  id: "chat-fixture",
  revisionId: revision,
  title: "주거 지원 테스트 공고",
  category: "주거",
  region: "서울",
  summary: "테스트 전용",
  tags: [],
};
const answer = {
  revision_id: revision,
  status: "grounded",
  answer: "원문에 따른 주거 지원 안내입니다.",
  citations: [{ source_field: "지원내용", quote: "주거비를 지원합니다." }],
  follow_up_questions: ["신청 기간을 기관에 확인해 주세요."],
  preview: false,
  eligibility_decided: false,
};
const faqs = [
  {
    id: "benefits",
    question: "어떤 지원을 받을 수 있나요?",
    response: { ...answer, response_type: "prepared" },
  },
  {
    id: "period",
    question: "언제 신청할 수 있나요?",
    response: {
      ...answer,
      answer: "신청 기간은 기관에서 확인해 주세요.",
      response_type: "prepared",
    },
  },
];
const user = { id: "test-user", username: "chat_fixture", name: "테스트" };
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  for (const width of [320, 390, 430]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 320 ? 640 : 844 },
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /Unexpected text node|Text strings must|React has detected/.test(
          message.text(),
        )
      )
        errors.push(message.text());
    });
    let askCount = 0;
    let faqCount = 0;
    let mode = "normal";
    let release;
    await page.route("**/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith("/mobile/auth/login"))
        return route.fulfill({
          json: {
            access_token: "A".repeat(43),
            token_type: "Bearer",
            expires_in: 3600,
            user,
          },
        });
      if (url.pathname.endsWith("/mobile/auth/me"))
        return route.fulfill({ json: { user } });
      if (url.pathname.endsWith("/mobile/auth/logout"))
        return route.fulfill({ json: { ok: true } });
      if (url.pathname.startsWith("/v1/policies"))
        return route.fulfill({
          json: url.pathname.endsWith(policy.id)
            ? policy
            : { items: [policy], total: 1, nextCursor: null },
        });
      if (url.pathname.includes("/assistant/")) {
        assert.equal(
          request.headers().authorization,
          "Bearer " + "A".repeat(43),
        );
        if (url.pathname.endsWith("/faqs")) {
          faqCount++;
          return route.fulfill({
            json: { revision_id: revision, items: faqs },
          });
        }
        askCount++;
        assert.deepEqual(request.postDataJSON(), {
          revision_id: revision,
          question: "주거비 질문",
        });
        if (mode === "delayed")
          await new Promise((resolve) => {
            release = resolve;
          });
        if (mode === "error")
          return route.fulfill({
            status: 503,
            json: { detail: "private server info" },
          });
        return route
          .fulfill({
            json: {
              ...answer,
              answer:
                mode === "delayed" ? "늦게 온 답변" : "직접 질문 답변입니다.",
            },
          })
          .catch(() => {});
      }
      return route.abort();
    });
    const button = (name) => page.getByRole("button", { name, exact: true });
    await page.goto("http://localhost:8081", {
      waitUntil: "networkidle",
      timeout: 120000,
    });
    await expect(button("챗봇 상담 열기")).toBeVisible();
    await page.screenshot({
      path: fileURLToPath(new URL(`home-${width}.png`, output)),
    });
    await button("챗봇 기능 끄기").click();
    await expect(
      page.getByRole("heading", { name: "챗봇 기능을 끄시겠습니까?" }),
    ).toBeVisible();
    await button("계속 사용하기").click();
    await expect(button("챗봇 상담 열기")).toBeVisible();
    await button("챗봇 기능 끄기").click();
    await button("챗봇 끄기").click();
    await expect(page.getByText(/오른쪽 위 ≡ 메뉴/)).toBeVisible();
    await button("확인").click();
    await expect(button("챗봇 상담 열기")).toHaveCount(0);
    await button("전체 메뉴 열기").click();
    await page.screenshot({
      path: fileURLToPath(new URL(`menu-${width}.png`, output)),
    });
    await button("챗봇 다시 켜기").click();
    await button("로그인하러 가기").click();
    await page.getByLabel("아이디", { exact: true }).fill("chat_fixture");
    await page.getByLabel("비밀번호", { exact: true }).fill("FixtureOnly42!");
    await button("로그인").click();
    await expect(button("로그아웃")).toBeVisible();
    await button("챗봇 상담 열기").click();
    await button(policy.title).click();
    await button(faqs[0].question).click();
    await expect(page.getByText(answer.answer, { exact: true })).toBeVisible();
    assert.equal(askCount, 0);
    assert.equal(faqCount, 1);
    await button("원문 근거 보기").click();
    await expect(
      page.getByText("주거비를 지원합니다.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: fileURLToPath(new URL(`answer-${width}.png`, output)),
    });
    // Cancelling the X confirmation must retain the current answer.
    await button("챗봇 기능 끄기").click();
    await button("계속 사용하기").click();
    await expect(page.getByText(answer.answer, { exact: true })).toBeVisible();
    await page.getByLabel("궁금한 내용", { exact: true }).fill("주거비 질문");
    await button("질문 보내기").click();
    await expect(
      page.getByText("직접 질문 답변입니다.", { exact: true }),
    ).toBeVisible();
    mode = "error";
    await button("질문 보내기").click();
    await expect(
      page.getByText(/원문 근거를 확인한 답변을 만들지 못했어요/),
    ).toBeVisible();
    await expect(
      page.getByText("private server info", { exact: true }),
    ).toHaveCount(0);
    mode = "delayed";
    await button("질문 보내기").click();
    await expect.poll(() => typeof release).toBe("function");
    await button(faqs[1].question).click();
    release();
    await expect(
      page.getByText("신청 기간은 기관에서 확인해 주세요.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("늦게 온 답변", { exact: true })).toHaveCount(
      0,
    );
    await button("챗봇 기능 끄기").click();
    await button("챗봇 끄기").click();
    await button("확인").click();
    await button("전체 메뉴 열기").click();
    await button("챗봇 다시 켜기").click();
    await expect(
      page.getByText("직접 질문 답변입니다.", { exact: true }),
    ).toHaveCount(0);
    await expect(button(policy.title)).toBeVisible();
    await button("상담창 접기").click();
    await button("전체 메뉴 열기").click();
    await button("중위소득 계산기").click();
    await expect(
      page.getByRole("heading", { name: "중위소득 계산기", exact: true }),
    ).toBeVisible();
    await button("전체 메뉴 열기").click();
    await button("내 계정").click();
    await button("로그아웃").click();
    await button("챗봇 상담 열기").click();
    await expect(button("로그인하러 가기")).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    assert.ok(
      !storage.includes("주거비 질문") && !storage.includes("A".repeat(43)),
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: assistant launcher, disable/cancel/reopen/menu, member bearer FAQ/free-text/citations, errors, stale cancellation, clearing and 320/390/430px layouts",
  );
} finally {
  await browser.close();
}
