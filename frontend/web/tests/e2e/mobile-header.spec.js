import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#guide');
});

test('login and easy mode share a row and menu dismisses with restored focus', async ({ page }) => {
  const toggle = page.getByRole('button', { name: '메뉴 열기', exact: true });
  const panel = page.getByRole('dialog', { name: '전체 메뉴', exact: true });
  const layout = await page.locator('.portal-header').evaluate((header) => {
    const mode = header.querySelector('.mode-switch').getBoundingClientRect();
    const account = header.querySelector('.account-actions').getBoundingClientRect();
    return {
      sameRow: Math.abs(mode.y + mode.height / 2 - account.y - account.height / 2) < 1,
      fits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(layout).toEqual({ sameRow: true, fits: true });
  await expect(page.locator('.portal-navigation')).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await panel.getByRole('button', { name: '메뉴 닫기', exact: true }).press('Escape');
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await toggle.click();
  await panel.locator('summary').filter({ hasText: 'AI 비서' }).click();
  await panel.getByRole('link', { name: 'AI 비서와 대화하기', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-chat$/);
  await expect(panel).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'AI 비서에게 물어보기' })).toBeVisible();
});

test('switching to desktop closes the mobile menu and restores page scrolling', async ({
  page,
}) => {
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.mobile-menu-dialog')).toBeHidden();
  await expect(page.locator('.mobile-navigation')).toBeHidden();
  await expect(page.locator('.portal-navigation')).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
