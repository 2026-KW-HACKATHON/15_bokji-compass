import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

for (const easy of [false, true]) {
  test(`login keeps the header readable and navigation available, easy=${easy}`, async ({
    page,
  }, testInfo) => {
    await mockPolicyApi(page);
    await page.route('**/v1/auth/kakao/status', (route) =>
      route.fulfill({ json: { enabled: true } }),
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('bokji.easy.v1', String(value)), easy);
    let user = null;
    await page.route('**/v1/auth/me', (route) =>
      route.fulfill({
        status: user ? 200 : 401,
        json: user ? { user } : { detail: '로그인이 필요해요.' },
      }),
    );
    await page.route('**/v1/auth/login', (route) => {
      user = {
        id: 'header-member',
        username: 'header_member',
        name: '상단바정렬확인용긴회원이름',
        gender: 'undisclosed',
      };
      return route.fulfill({ json: { user } });
    });
    await page.route('**/v1/auth/logout', (route) => {
      user = null;
      return route.fulfill({ json: { message: '로그아웃했어요.' } });
    });
    const navSelector = easy ? '.easy-navigation' : '.portal-nav';
    const geometry = () =>
      page.evaluate((selector) => {
        const bounds = (selector) => {
          const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
          return { x, y, width, height };
        };
        return { header: bounds('.portal-header'), nav: bounds(selector) };
      }, navSelector);
    const expectHeaderLayout = async (before, label) => {
      const current = await geometry();
      if (!easy) {
        expect(current, label).toEqual(before);
        return;
      }
      // Easy mode reflows when account names or translated labels need more room.
      const width = page.viewportSize().width;
      for (const bounds of [current.header, current.nav]) {
        expect(bounds.x, label).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width, label).toBeLessThanOrEqual(width + 1);
        expect(bounds.height, label).toBeGreaterThan(0);
      }
      expect(current.nav.y, label).toBeGreaterThanOrEqual(current.header.y);
      expect(current.nav.y + current.nav.height, label).toBeLessThanOrEqual(
        current.header.y + current.header.height + 1,
      );
    };
    const widths = testInfo.project.name === 'desktop' ? [1446, 1440, 1280, 1180, 768] : [390, 320];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/#login');
      await expect(page.locator('.portal-header .login-link')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const before = await geometry();
      if (!easy) {
        await expect(
          page.getByRole('button', { name: '카카오 로그인', exact: true }),
        ).toBeEnabled();
        const choice = page.getByRole('button', { name: '아이디로 로그인', exact: true });
        if ((await choice.getAttribute('aria-expanded')) === 'false') await choice.click();
      }
      await page.getByLabel('아이디', { exact: true }).fill('header_member');
      await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      const logout = page
        .locator('.portal-header')
        .getByRole('button', { name: '로그아웃', exact: true });
      await expect(logout).toBeVisible();
      if (easy) await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
      await page.locator(`${navSelector} a[href="#assistant"]`).click();
      await expect(page).toHaveURL(/#assistant$/);
      await expectHeaderLayout(before, `login geometry at ${width}px`);
      if (!easy && width >= 1280) {
        expect(
          await page.locator('.portal-nav').evaluate((nav) => nav.scrollWidth <= nav.clientWidth),
          `all desktop menus at ${width}px`,
        ).toBe(true);
      }
      for (const locale of ['ko', 'en', 'vi']) {
        await page.locator('.language-selector select').selectOption(locale);
        await page.evaluate(() => document.fonts.ready);
        await expectHeaderLayout(before, `language geometry at ${width}px, ${locale}`);
        const visibleAccount = await page.locator('.account-actions').evaluate((account) => {
          const button = account.querySelector('button').getBoundingClientRect();
          const area = account.getBoundingClientRect();
          return (
            button.x >= area.x - 1 && button.right <= area.right + 1 && button.right <= innerWidth
          );
        });
        expect(visibleAccount, `logout visible at ${width}px, ${locale}`).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.locator('.language-selector select').selectOption('ko');
      await page
        .locator('.portal-header')
        .screenshot({ path: testInfo.outputPath(`header-${width}.png`) });
      await logout.click();
      await expect(page.locator('.portal-header .login-link')).toBeVisible();
      await expectHeaderLayout(before, `logout geometry at ${width}px`);
    }
  });
}
