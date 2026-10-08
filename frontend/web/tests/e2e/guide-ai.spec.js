import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: {} }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#guide');
  await expect(page.getByRole('heading', { level: 1, name: /필요한 복지를/ })).toBeVisible();
});

test('the introduction opens the real chatbot in place and returns focus on close', async ({
  page,
}) => {
  const aiRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/assistant/')) aiRequests.push(request.url());
  });
  await expect(page.getByRole('button', { name: 'AI 챗봇 열기', exact: true })).toHaveCount(0);
  const openChatbot = page.getByRole('button', { name: '챗봇 열어보기', exact: true });
  await openChatbot.click();
  const chatbot = page.getByRole('dialog', { name: '복지나침반 AI 챗봇', exact: true });
  await expect(chatbot).toBeVisible();
  await expect(page).toHaveURL(/#guide$/);
  await chatbot.getByRole('button', { name: /이용 방법이 궁금해요/ }).click();
  await chatbot.getByRole('button', { name: '저장한 공고는 어디에 보관되나요?' }).click();
  await expect(chatbot.getByText(/지금 사용하는 브라우저에 보관/)).toBeVisible();
  await chatbot.getByRole('button', { name: '상담창 닫기' }).click();
  await expect(chatbot).toHaveCount(0);
  await expect(openChatbot).toBeFocused();
  await expect(page.getByRole('button', { name: 'AI 챗봇 열기', exact: true })).toHaveCount(0);
  expect(aiRequests).toEqual([]);

  await openChatbot.click();
  await expect(chatbot).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chatbot).toHaveCount(0);
  await expect(openChatbot).toBeFocused();
});

test('the AI introduction reaches the dedicated assistant and keeps the mobile contents usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const contents = page.getByRole('navigation', { name: '서비스 소개 목차', exact: true });
  const aiSection = contents.getByRole('button', { name: 'AI 대화', exact: true });
  await aiSection.click();
  await expect(aiSection).toHaveAttribute('aria-current', 'location');
  await expect(aiSection).toBeInViewport({ ratio: 0.99 });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);

  await page.getByRole('button', { name: 'AI 복지비서 시작하기', exact: true }).click();
  await expect(page).toHaveURL(/#assistant$/);
  await expect(
    page.getByRole('heading', { name: '나에게 맞는 복지, 한곳에서 관리하세요.', exact: true }),
  ).toBeVisible();
  const login = page.getByRole('link', { name: '로그인하고 시작하기', exact: true });
  await expect(login).toHaveAttribute('href', '#login?return=assistant');
  await expect(
    page.getByRole('region', { name: 'AI 복지비서 주요 기능' }).getByRole('article'),
  ).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'AI 챗봇 열기', exact: true })).toHaveCount(0);
  await login.click();
  await expect(page).toHaveURL(/#login\?return=assistant$/);
});

test('the conversation preview animates locally and respects reduced motion during replay', async ({
  page,
}) => {
  const aiRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/assistant/')) aiRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  const preview = page.getByRole('group', { name: 'AI 복지비서 생활 상황 대화 예시' });
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute('data-guide-sequence', 'playing');
  await expect
    .poll(() => preview.evaluate((element) => element.getAnimations({ subtree: true }).length))
    .toBeGreaterThan(0);
  await expect(preview).toHaveAttribute('data-guide-sequence', 'complete');
  await expect(preview.getByText('사용자가 직접 기록한 상태')).toBeVisible();
  await preview.getByRole('button', { name: 'AI 대화 소개 애니메이션 다시 보기' }).click();
  await expect(preview).toHaveAttribute('data-guide-sequence', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(preview).toHaveAttribute('data-guide-sequence', 'static');
  await expect(preview.locator('.guide-ai-progress')).toHaveCSS('opacity', '1');
  await expect(
    preview.getByRole('button', { name: 'AI 대화 소개 애니메이션 다시 보기' }),
  ).toBeHidden();
  expect(aiRequests).toEqual([]);
});

test('updated guide and home copy follow every foreign language at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const locale of ['en', 'zh', 'vi', 'ja']) {
    await page.locator('.language-selector select').selectOption(locale);
    await expect(page.locator('.guide-page')).not.toContainText(/[가-힣]/);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.goto('/#home');
  for (const locale of ['en', 'zh', 'vi', 'ja']) {
    await page.locator('.language-selector select').selectOption(locale);
    const entry = page.locator('.home-assistant-entry');
    await expect(entry).toBeVisible();
    await expect(entry).not.toContainText(/[가-힣]/);
    await expect(entry).not.toHaveAttribute('aria-label', /[가-힣]/);
  }
  await page.goto('/#assistant-chat');
  await expect(page.locator('.guided-conversation')).toBeVisible();
  await expect(page.locator('.guided-conversation button[type="submit"]')).not.toContainText(
    /[가-힣]/,
  );
});
