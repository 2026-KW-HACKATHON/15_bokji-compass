import { test, expect } from '@playwright/test';
test('tag search, detail, saved persistence and browser history', async ({ page }) => {
  await page.goto('/#explore');
  await expect(page.getByRole('article')).toHaveCount(6);
  const tag = page.getByRole('button', { name: /태그로 공고 찾기/ }).first();
  await tag.click();
  await expect(page.getByRole('button', { name: '태그 필터 해제' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('article')).toHaveCount(6);
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('청년 독립');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: '청년의 첫 독립, 주거비 지원', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '이 공고 저장하기', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.goto('/#saved');
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
});
test('senior mode uses three profile steps and one recommendation, opt-in survives reload', async ({
  page,
}) => {
  await page.goto('/#profile');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('combobox')).toHaveCount(2);
  await page.getByRole('combobox', { name: '거주 지역' }).selectOption('서울');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('heading', { name: '현재 생활을 알려주세요' })).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('checkbox', { name: '주거', exact: true }).check();
  await page.getByRole('checkbox', { name: '이 브라우저에 내 정보 기억하기' }).check();
  await page.getByRole('button', { name: '내 정보로 추천받기' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByText('추천 이유', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});
test('auth pages offer forms with inactive submission', async ({ page }) => {
  await page.goto('/#login');
  await expect(page.getByRole('textbox', { name: '이메일' })).toBeVisible();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeDisabled();
  await page.getByRole('main').getByRole('link', { name: '회원가입', exact: true }).click();
  await expect(page.getByLabel('비밀번호 확인')).toBeVisible();
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeDisabled();
});
test('narrow viewport supports easy mode and policy dialog', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#explore');
  await page.getByRole('switch').click();
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /자세히 보기/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});
test('API mode shows failure and retry without a demo fallback', async ({ page }) => {
  await page.route('**/app-config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.__BOKJI_CONFIG__ = {dataMode:"api"};',
    }),
  );
  await page.route('**/api/v1/policies?**', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/#explore');
  await expect(page.getByRole('alert')).toContainText('공고를 불러오지 못했어요');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.getByRole('button', { name: '다시 시도하기' }).click();
  await expect(page.getByText('조건에 맞는 공고가 없어요')).toBeVisible();
});
