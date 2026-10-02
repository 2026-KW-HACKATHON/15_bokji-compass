import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { chromium, expect } from '@playwright/test';
import { createExhibitionServer } from '../tools/exhibition/server.mjs';
import { startAuthFixture } from './fixtures/admin-gateway.mjs';

const temp = await mkdtemp(path.join(os.tmpdir(), 'bokji-qr-ui-'));
const statePath = path.join(temp, 'state.json');
const output = fileURLToPath(new URL('../../../tmp/exhibition-preview/', import.meta.url));
await mkdir(output, { recursive: true });
const state = (url) =>
  writeFile(statePath, JSON.stringify({ url, processes: [{ id: process.pid, name: 'tunnel' }] }));
await state('https://first.trycloudflare.com');
const auth = await startAuthFixture();
const server = createExhibitionServer({
  statePath,
  apkPath: path.join(temp, 'missing.apk'),
  authApiUrl: auth.url,
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  await page.context().addCookies([
    {
      name: 'bokji_session',
      value: 'A'.repeat(43),
      url: `http://127.0.0.1:${server.address().port}`,
    },
  ]);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.locator('#web-target')).toHaveAttribute(
    'href',
    'https://bokji.commitnaru.com/',
  );
  await expect(page.locator('#apk-status')).toContainText('APK 미등록');
  await expect(page.locator('#temporary')).toBeHidden();
  await expect(page.locator('#source')).toContainText('고정 주소');
  await state('https://second.trycloudflare.com');
  await expect(page.locator('#web-target')).toHaveAttribute(
    'href',
    'https://bokji.commitnaru.com/',
    { timeout: 12000 },
  );
  await expect(page.locator('#android-target')).toHaveAttribute(
    'href',
    'https://bokji.commitnaru.com/downloads/bokji-compass.apk',
  );
  await page.screenshot({ path: path.join(output, 'auto.png'), fullPage: true });
  await page.getByLabel('고정 주소 직접 입력', { exact: true }).check();
  await page.locator('#origin').fill('https://expo.example.org');
  await page.getByRole('button', { name: 'QR 주소 적용' }).click();
  await expect(page.locator('#web-target')).toHaveAttribute('href', 'https://expo.example.org/');
  await expect(page.locator('#temporary')).toBeHidden();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#android-save').click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'bokji-android-qr.png');
  await download.saveAs(path.join(output, download.suggestedFilename()));
  await page.locator('#apk').fill('https://files.example.org/expo-v1.apk');
  await page.getByRole('button', { name: 'QR 주소 적용' }).click();
  await expect(page.locator('#android-target')).toHaveAttribute(
    'href',
    'https://files.example.org/expo-v1.apk',
  );
  await page.locator('#origin').fill('http://localhost:8080');
  await page.getByRole('button', { name: 'QR 주소 적용' }).click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#web-qr')).toBeHidden();
  await expect(page.locator('#print')).toBeDisabled();
  await page.locator('#origin').fill('https://bokji.commitnaru.com');
  await page.locator('#apk').fill('');
  await page.getByRole('button', { name: 'QR 주소 적용' }).click();
  await expect(page.locator('#web-qr')).toBeVisible();
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.settings')).toBeHidden();
  await expect(page.locator('#apk-status')).toBeVisible();
  await page.pdf({ path: path.join(output, 'poster.pdf'), preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  auth.revoke();
  await expect(page.locator('#web-qr')).toBeHidden({ timeout: 12000 });
  await expect(page.locator('#error')).toContainText('관리자 로그인이 만료');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: default fixed URL, manual APK URLs, invalid URL clears QR, PNG download, mobile layout and print controls',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await auth.close();
  await rm(statePath, { force: true });
  await rmdir(temp);
}
