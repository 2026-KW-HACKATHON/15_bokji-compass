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
const apkPath = path.join(temp, 'release.apk');
const output = fileURLToPath(new URL('../../../tmp/exhibition-preview/', import.meta.url));
await mkdir(output, { recursive: true });
const state = (url) =>
  writeFile(statePath, JSON.stringify({ url, processes: [{ id: process.pid, name: 'tunnel' }] }));
await state('https://first.trycloudflare.com');
const auth = await startAuthFixture();
const server = createExhibitionServer({
  statePath,
  apkPath,
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
    'https://bokji.commitnaru.com/#guide?easy=0',
  );
  await expect(page.locator('#apk-status')).toContainText('APK 미등록');
  await expect(page.locator('#android-download')).toHaveAttribute('aria-disabled', 'true');
  assert.equal(await page.locator('#android-download').getAttribute('href'), null);
  await expect(page.locator('#temporary')).toBeHidden();
  await expect(page.locator('#source')).toContainText('고정 주소');
  await state('https://second.trycloudflare.com');
  await expect(page.locator('#web-target')).toHaveAttribute(
    'href',
    'https://bokji.commitnaru.com/#guide?easy=0',
    { timeout: 12000 },
  );
  await expect(page.locator('#android-target')).toHaveAttribute(
    'href',
    'https://bokji.commitnaru.com/downloads/bokji-compass.apk',
  );
  await page.screenshot({ path: path.join(output, 'auto.png'), fullPage: true });
  const fixtureApk = 'APK DOWNLOAD FIXTURE — not an installable release';
  await writeFile(apkPath, fixtureApk);
  await expect(page.locator('#apk-status')).toContainText('APK 등록 완료', { timeout: 12000 });
  await expect(page.locator('#android-download')).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#android-download')).toHaveAttribute(
    'href',
    'https://bokji.commitnaru.com/downloads/bokji-compass.apk',
  );
  await page.route('https://bokji.commitnaru.com/downloads/bokji-compass.apk', (route) =>
    route.fulfill({
      body: fixtureApk,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename=bokji-compass.apk',
      },
    }),
  );
  const apkDownloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'APK 다운로드', exact: true }).click();
  const apkDownload = await apkDownloadEvent;
  assert.equal(apkDownload.suggestedFilename(), 'bokji-compass.apk');
  await apkDownload.saveAs(path.join(output, 'download-fixture.apk'));
  await page.getByLabel('고정 주소 직접 입력', { exact: true }).check();
  await page.locator('#origin').fill('https://expo.example.org');
  await page.getByRole('button', { name: 'QR 주소 적용' }).click();
  await expect(page.locator('#web-target')).toHaveAttribute(
    'href',
    'https://expo.example.org/#guide?easy=0',
  );
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
  await expect(page.locator('#android-download')).toHaveAttribute(
    'href',
    'https://files.example.org/expo-v1.apk',
  );
  await page.locator('#origin').fill('http://localhost:8080');
  await page.getByRole('button', { name: 'QR 주소 적용' }).click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#web-qr')).toBeHidden();
  await expect(page.locator('#print')).toBeDisabled();
  await expect(page.locator('#android-download')).toHaveAttribute('aria-disabled', 'true');
  assert.equal(await page.locator('#android-download').getAttribute('href'), null);
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
  await expect(page.locator('#android-download')).toBeHidden();
  await page.pdf({ path: path.join(output, 'poster.pdf'), preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  auth.revoke();
  await expect(page.locator('#web-qr')).toBeHidden({ timeout: 12000 });
  await expect(page.locator('#error')).toContainText('관리자 로그인이 만료');
  await expect(page.locator('#android-download')).toHaveAttribute('aria-disabled', 'true');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: fixed/manual URLs, APK registration enables download, APK/PNG download, invalid URL and revoked session disable links, mobile layout and print controls',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await auth.close();
  await rm(statePath, { force: true });
  await rm(apkPath, { force: true });
  await rmdir(temp);
}
