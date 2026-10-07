import { test, expect } from '@playwright/test';
import {
  acceptSignupConsent,
  profileConsentLabel,
  requiredConsentLabel,
} from '../fixtures/privacy-consent.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/auth/kakao/status', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
});

for (const width of [320, 1440]) {
  test(`signup notice stays readable and preserves consent in both screen modes at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#signup');
    const heading = page.getByRole('heading', { name: '개인정보 수집·이용 안내', exact: true });
    const required = page.getByRole('checkbox', { name: requiredConsentLabel, exact: true });
    const profile = page.getByRole('checkbox', { name: profileConsentLabel, exact: true });
    await expect(heading).toBeVisible();
    await expect(required).toBeVisible();
    await expect(profile).toBeVisible();
    await expect(
      page.getByRole('button', { name: '동의하고 가입 방법 선택', exact: true }),
    ).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`privacy-normal-${width}.png`),
      fullPage: true,
    });
    await required.check();
    await profile.check();
    await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    await expect(heading).toBeVisible();
    await expect(required).toBeChecked();
    await expect(profile).toBeChecked();
    await expect(
      page.getByRole('button', { name: '동의하고 가입 방법 선택', exact: true }),
    ).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`privacy-easy-${width}.png`),
      fullPage: true,
    });
    await page
      .locator('.privacy-choices')
      .screenshot({ path: testInfo.outputPath(`privacy-controls-${width}.png`) });
  });
}

test('ID login opens on selection and preserves input across disclosure and easy mode', async ({
  page,
}, testInfo) => {
  await page.goto('/#login');
  await expect(page.getByRole('button', { name: '카카오 로그인', exact: true })).toBeEnabled();
  const choice = page.getByRole('button', { name: '아이디로 로그인', exact: true });
  const username = page.getByLabel('아이디', { exact: true });
  const password = page.getByLabel('비밀번호', { exact: true });
  await expect(choice).toHaveAttribute('aria-expanded', 'false');
  await expect(username).toBeHidden();
  await choice.focus();
  await choice.press('Enter');
  await expect(username).toBeVisible();
  await expect(username).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('login-normal.png'), fullPage: true });
  await username.fill('design_user');
  await password.fill('ExamplePassword42!');
  await choice.click();
  await expect(username).toBeHidden();
  await choice.click();
  await expect(username).toHaveValue('design_user');
  await expect(password).toHaveValue('ExamplePassword42!');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(username).toBeVisible();
  await expect(choice).toBeHidden();
  await expect(page.getByRole('navigation', { name: '계정 메뉴' })).toBeHidden();
  await expect(page.locator('.auth-story')).toBeHidden();
  await expect(password).toHaveValue('ExamplePassword42!');
  await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: '비밀번호 숨기기', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.screenshot({ path: testInfo.outputPath('login-easy.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('login-easy-320.png'), fullPage: true });
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(username).toHaveValue('design_user');
  await expect(choice).toHaveAttribute('aria-expanded', 'true');
});

test('easy login shows credentials immediately and connects validation to its input', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('bokji.easy.v1', 'true'));
  await page.goto('/#login');
  await expect(page.getByLabel('아이디', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('아이디', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('아이디', { exact: true })).toHaveAttribute(
    'aria-describedby',
    'login-error',
  );
  await page.getByLabel('아이디', { exact: true }).fill('design_user');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByRole('alert')).toContainText('8자 이상');
});

test('signup keeps one field per step and its draft when changing screen mode', async ({
  page,
}, testInfo) => {
  await page.route('**/v1/auth/username/check', (route) =>
    route.fulfill({ json: { username: 'design_user', available: true } }),
  );
  await page.goto('/#signup');
  await expect(page.getByRole('heading', { name: '회원가입', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('signup-normal.png'), fullPage: true });
  await acceptSignupConsent(page);
  await page.getByRole('button', { name: '아이디로 회원가입' }).click();
  await page.getByLabel('아이디', { exact: true }).fill('design_user');
  await page.getByRole('button', { name: '중복확인', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('ExamplePassword42!');
  await expect(page.locator('.auth-card input')).toHaveCount(1);
  await expect(page.locator('.auth-story')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('signup-easy.png'), fullPage: true });
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByLabel('비밀번호 확인', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('ExamplePassword42!');
});

for (const type of ['login', 'signup']) {
  test(`mode changes during Kakao ${type} cancel the pending request and restore ID controls`, async ({
    page,
  }) => {
    let release;
    await page.route(
      '**/v1/auth/kakao/start',
      (route) =>
        new Promise((resolve) => {
          release = async () => {
            await route.fulfill({ status: 503, json: { detail: '취소된 요청의 늦은 응답' } });
            resolve();
          };
        }),
    );
    await page.goto('/#' + type);
    if (type === 'signup') await acceptSignupConsent(page);
    await page
      .getByRole('button', {
        name: type === 'login' ? '카카오 로그인' : '카카오톡으로 로그인/회원가입하기',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', { name: '카카오로 이동 중…', exact: true }),
    ).toBeVisible();
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    if (type === 'login') {
      await expect(page.getByLabel('아이디', { exact: true })).toBeEnabled();
    } else {
      await expect(page.getByRole('button', { name: '아이디로 회원가입' })).toBeEnabled();
      await page.getByRole('button', { name: '아이디로 회원가입' }).click();
      await expect(page.getByLabel('아이디', { exact: true })).toBeEnabled();
    }
    await release();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
