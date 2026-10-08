import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

const variants = [
  ['en', 'AI welfare assistant', 'About this service', 'Main menu'],
  ['zh', 'AI福利助手', '服务介绍', '主菜单'],
  ['vi', 'Trợ lý phúc lợi AI', 'Giới thiệu dịch vụ', 'Menu chính'],
  ['ja', 'AI福祉アシスタント', 'サービス紹介', 'メインメニュー'],
];

for (const [language, assistant, introduction, menu] of variants) {
  test(`${language}: new assistant and introduction menus share the selected language`, async ({
    page,
  }) => {
    await mockPolicyApi(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#home');
    await page.getByRole('combobox', { name: '언어 선택', exact: true }).selectOption(language);
    const nav = page.getByRole('navigation', { name: menu, exact: true });
    await nav.getByRole('link', { name: assistant, exact: true }).click();
    await expect(page).toHaveURL(/#assistant$/);
    await expect(
      page.getByRole('heading', { level: 1, name: assistant, exact: true }),
    ).toBeVisible();
    await nav.getByRole('link', { name: introduction, exact: true }).click();
    await expect(page).toHaveURL(/#guide$/);
    await page.reload();
    await expect(nav.getByRole('link', { name: introduction, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await nav.getByRole('link', { name: assistant, exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: assistant, exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
