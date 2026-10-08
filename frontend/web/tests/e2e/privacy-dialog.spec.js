import { test, expect } from '@playwright/test';
import {
  aiConsentLabel,
  openPrivacyNotice,
  privacyNoticeWithAi,
  privacyViewLabels,
  profileConsentLabel,
  requiredConsentLabel,
} from '../fixtures/privacy-consent.js';

const sections = [
  { key: 'collection', region: '회원가입 개인정보 안내', heading: '회원가입과 계정 관리 · 필수' },
  {
    key: 'profile',
    region: '맞춤 안내용 개인정보 안내',
    heading: '표시 이름과 맞춤 복지 안내 · 선택',
  },
  { key: 'ai', region: 'AI 개인정보 처리 안내', heading: '외부 AI 질문·답변 · 선택' },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/auth/privacy-notice', (route) =>
    route.fulfill({ json: privacyNoticeWithAi }),
  );
});

async function expectNoConsent(page) {
  for (const name of [requiredConsentLabel, profileConsentLabel, aiConsentLabel]) {
    await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  }
  await expect(
    page.getByRole('button', { name: '동의하고 가입 방법 선택', exact: true }),
  ).toBeDisabled();
}

async function expectFullNotice(dialog) {
  for (const { region } of sections) {
    await expect(dialog.getByRole('region', { name: region, exact: true })).toHaveCount(1);
  }
  const account = dialog.getByRole('region', { name: '회원가입 개인정보 안내', exact: true });
  await expect(account.locator('dt')).toHaveText([
    '수집 항목',
    '이용 목적',
    '보유 기간',
    '거부 권리',
  ]);
  await expect(account).toContainText(privacyNoticeWithAi.retention);
  await expect(
    dialog.getByRole('region', { name: '맞춤 안내용 개인정보 안내', exact: true }),
  ).toContainText('동의하지 않아도 가입할 수 있습니다.');
  const ai = dialog.getByRole('region', { name: 'AI 개인정보 처리 안내', exact: true });
  await expect(ai).toContainText(privacyNoticeWithAi.ai.provider_name);
  await expect(ai).toContainText('미국');
  await expect(ai).toContainText(privacyNoticeWithAi.ai.training);
  await expect(
    dialog.getByRole('region', { name: '추가 개인정보와 권리 안내', exact: true }),
  ).toContainText('동의 철회');
  await expect(
    dialog.getByRole('link', { name: privacyNoticeWithAi.contact_email, exact: true }),
  ).toHaveAttribute('href', `mailto:${privacyNoticeWithAi.contact_email}`);
}

test('each consent row opens the full notice at its section without granting consent', async ({
  page,
}) => {
  await page.goto('/#signup');
  await expectNoConsent(page);
  for (const { region } of sections) {
    await expect(page.getByRole('region', { name: region, exact: true })).toHaveCount(0);
  }

  for (const { key, heading } of sections) {
    const trigger = page.getByRole('button', { name: privacyViewLabels[key], exact: true });
    const dialog = await openPrivacyNotice(page, key);
    await expectFullNotice(dialog);
    await expect(dialog.getByRole('heading', { name: heading, exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expectNoConsent(page);
  }
});

test('close and Escape restore focus and preserve an explicit optional choice', async ({
  page,
}) => {
  await page.goto('/#signup');
  const profile = page.getByRole('checkbox', { name: profileConsentLabel, exact: true });
  await profile.check();

  for (const method of ['close', 'escape']) {
    const trigger = page.getByRole('button', { name: privacyViewLabels.profile, exact: true });
    const dialog = await openPrivacyNotice(page, 'profile');
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    if (method === 'close') await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(profile).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: requiredConsentLabel, exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('button', { name: '동의하고 가입 방법 선택', exact: true }),
    ).toBeDisabled();
  }
});

test('the login footer reopens the full notice without changing entered credentials', async ({
  page,
}) => {
  await page.goto('/#login');
  const username = page.getByLabel('아이디', { exact: true });
  await username.fill('privacy_reader');
  const trigger = page.getByRole('button', { name: privacyViewLabels.all, exact: true });
  const dialog = await openPrivacyNotice(page, 'all');
  await expectFullNotice(dialog);
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(username).toHaveValue('privacy_reader');
});

test('compact consent rows and the full notice stay usable at 320px with internal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#signup');
  await expectNoConsent(page);
  await page.evaluate(() => document.fonts.ready);
  const consent = await page.locator('.privacy-consent').boundingBox();
  expect(consent.height).toBeLessThanOrEqual(740);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  const dialog = await openPrivacyNotice(page);
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(740);
  const backgroundScroll = await page.evaluate(() => window.scrollY);
  const contact = dialog.getByRole('link', {
    name: privacyNoticeWithAi.contact_email,
    exact: true,
  });
  await contact.scrollIntoViewIfNeeded();
  await expect(contact).toBeInViewport();
  expect(
    await dialog.evaluate((element) =>
      [element, ...element.querySelectorAll('*')].some((child) => child.scrollTop > 0),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(backgroundScroll);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const confirm = dialog.getByRole('button', { name: '확인', exact: true });
  await expect(confirm).toBeInViewport();
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  await expectNoConsent(page);
});
