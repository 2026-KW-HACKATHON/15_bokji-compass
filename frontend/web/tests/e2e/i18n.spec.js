import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const variants = [
  ['en', 'en-US', 'Main menu', 'All notices', 'Choose language'],
  ['zh', 'zh-CN', '主菜单', '全部公告', '选择语言'],
  ['vi', 'vi-VN', 'Menu chính', 'Tất cả thông báo', 'Chọn ngôn ngữ'],
  ['ja', 'ja-JP', 'メインメニュー', 'すべてのお知らせ', '言語を選択'],
];
for (const [code, tag, menu, notices, languageLabel] of variants) {
  test(`${code}: switching updates navigation and persists after reload`, async ({ page }) => {
    await page.goto('/#home');
    await page.getByRole('combobox', { name: '언어 선택', exact: true }).selectOption(code);
    await expect(page.locator('html')).toHaveAttribute('lang', tag);
    await expect(page.getByRole('combobox', { name: languageLabel, exact: true })).toHaveValue(
      code,
    );
    const nav = page.getByRole('navigation', { name: menu, exact: true });
    await nav.getByRole('link', { name: notices, exact: true }).click();
    await expect(page).toHaveURL(/#explore$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(notices);
    await page.reload();
    await expect(page.getByRole('combobox', { name: languageLabel, exact: true })).toHaveValue(
      code,
    );
    await expect(page.locator('html')).toHaveAttribute('lang', tag);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(notices);
  });
}

test('browser preference selects English; a saved selection takes precedence', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ locale: 'en-GB', baseURL });
  const page = await context.newPage();
  await mockPolicyApi(page);
  await page.goto('/#home');
  await expect(page.getByRole('combobox', { name: 'Choose language', exact: true })).toHaveValue(
    'en',
  );
  await page.getByRole('combobox', { name: 'Choose language', exact: true }).selectOption('ko');
  await page.reload();
  await expect(page.getByRole('combobox', { name: '언어 선택', exact: true })).toHaveValue('ko');
  await context.close();
});

test('switching language preserves typed input and original filter values', async ({ page }) => {
  await page.goto('/#explore');
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('주거');
  await page.locator('details.explorer-advanced > summary').click();
  await page.getByRole('combobox', { name: '지역', exact: true }).selectOption('서울');
  await page.getByRole('combobox', { name: '언어 선택', exact: true }).selectOption('en');
  await expect(page.locator('#main-content .search-field input').first()).toHaveValue('주거');
  await expect(page.getByRole('combobox', { name: 'Region', exact: true })).toHaveValue('서울');
  await expect(page.getByRole('combobox', { name: 'Region', exact: true })).toContainText('Seoul');
});

test('language selection works when browser persistence is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('storage denied');
    };
  });
  await page.goto('/#home');
  await page.getByRole('combobox', { name: '언어 선택', exact: true }).selectOption('vi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi-VN');
  await expect(page.locator('.language-storage-warning')).toBeVisible();
});

test('all languages fit a 320px screen and easy mode', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#home');
  await page.getByRole('switch').first().click();
  for (const locale of ['en', 'zh', 'vi', 'ja', 'ko']) {
    await page.locator('.language-selector select').selectOption(locale);
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(0);
    await expect(page.locator('.language-selector select')).toBeVisible();
  }
});

for (const width of [1440, 1280, 1180, 768, 600, 390, 320]) {
  test(`navigation geometry stays stable across languages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#login');
    for (const easy of [false, true]) {
      if (easy) await page.getByRole('switch').click();
      let baseline;
      for (const locale of ['ko', 'en', 'zh', 'vi', 'ja']) {
        await page.locator('.language-selector select').focus();
        await page.locator('.language-selector select').selectOption(locale);
        await expect(page.locator('html')).toHaveAttribute('data-locale', locale);
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.evaluate(() => {
          const box = (selector) => {
            const { x, y, width, height } = document
              .querySelector(selector)
              .getBoundingClientRect();
            return { x, y, width, height };
          };
          return {
            header: box('.portal-header'),
            nav: box('.portal-nav'),
            overflow: document.documentElement.scrollWidth - innerWidth,
          };
        });
        baseline ??= geometry;
        expect(geometry, `${locale}, easy=${easy}`).toEqual(baseline);
        expect(geometry.overflow).toBe(0);

        // The last item remains reachable when longer translations need scrolling.
        const lastLink = page.locator('.portal-nav a').last();
        await lastLink.scrollIntoViewIfNeeded();
        await lastLink.focus();
        await expect
          .poll(async () => {
            const link = await lastLink.boundingBox();
            return (
              link.x >= geometry.nav.x - 1 &&
              link.x + link.width <= geometry.nav.x + geometry.nav.width + 1
            );
          })
          .toBe(true);
      }
    }
    await page.locator('.portal-nav a').last().press('Enter');
    await expect(page).toHaveURL(/#profile$/);
  });
}
