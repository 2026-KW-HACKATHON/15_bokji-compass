import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('bokji.easy.v1', 'true'));
});

test('web QR opens the guide in standard mode despite a saved easy-mode preference', async ({
  page,
}) => {
  await page.goto('/#guide?easy=0');
  await expect(page.getByRole('heading', { level: 1, name: /필요한 복지를/ })).toBeVisible();
  await expect(page.locator('.mode-switch')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-easy', 'false');
  expect(await page.evaluate(() => localStorage.getItem('bokji.easy.v1'))).toBe('false');
  await page.reload();
  await expect(page.locator('.mode-switch')).toHaveAttribute('aria-checked', 'false');
});

test('QR hash navigation resets the current mode and keeps it off on the next page', async ({
  page,
}) => {
  await page.goto('/#home');
  await expect(page.locator('.mode-switch')).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => {
    window.location.hash = 'guide?easy=0';
  });
  await expect(page.getByRole('heading', { level: 1, name: /필요한 복지를/ })).toBeVisible();
  await expect(page.locator('.mode-switch')).toHaveAttribute('aria-checked', 'false');
  await page.evaluate(() => {
    window.location.hash = 'home';
  });
  await expect(page.locator('.mode-switch')).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => localStorage.getItem('bokji.easy.v1'))).toBe('false');
});

test('ordinary guide navigation still respects a saved preference', async ({ page }) => {
  await page.goto('/#guide');
  await expect(page.locator('.mode-switch')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('bokji.easy.v1'))).toBe('true');
});
