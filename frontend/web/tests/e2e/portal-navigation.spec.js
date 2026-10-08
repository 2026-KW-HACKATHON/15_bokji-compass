import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('full menu groups the calculator and separates assistant destinations', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1466, height: 643 });
  await page.goto('/#home');
  const nav = page.getByRole('navigation', { name: '주 메뉴', exact: true });
  await expect(nav.locator('.portal-nav > .portal-nav-group')).toHaveCount(7);
  await expect(
    nav.locator('.portal-nav').getByRole('link', { name: '계산기', exact: true }),
  ).toHaveCount(0);
  await nav.getByRole('button', { name: '내 정보 하위 메뉴', exact: true }).click();
  const panel = nav.locator('.portal-mega-menu');
  await expect(panel).toBeVisible();
  const ai = panel.getByRole('region', { name: 'AI 비서', exact: true });
  await expect(ai.getByRole('link', { name: '서비스 소개', exact: true })).toHaveAttribute(
    'href',
    '#assistant-intro',
  );
  await expect(ai.getByRole('link', { name: '내 복지 현황', exact: true })).toHaveAttribute(
    'href',
    '#assistant-overview',
  );
  await expect(ai.getByRole('link', { name: '이용 안내', exact: true })).toHaveAttribute(
    'href',
    '#guide',
  );
  const account = panel.getByRole('region', { name: '내 정보', exact: true });
  await expect(account.getByRole('link', { name: '계산기', exact: true })).toHaveAttribute(
    'href',
    '#calculator',
  );
  await page.screenshot({ path: info.outputPath('menu-open.png') });
  await account.getByRole('link', { name: '계산기', exact: true }).click();
  await expect(page).toHaveURL(/#calculator$/);
  await expect(panel).toBeHidden();
  await expect(nav.locator('.portal-nav-group').last()).toHaveAttribute('data-active', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('중위소득');
  expect(errors).toEqual([]);
});

test('keyboard and touch controls close the menu and keep destinations accessible', async ({
  page,
}) => {
  await page.goto('/#home');
  const nav = page.getByRole('navigation', { name: '주 메뉴', exact: true });
  const toggle = nav.getByRole('button', { name: 'AI 비서 하위 메뉴', exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const guide = nav.getByRole('link', { name: '이용 안내', exact: true });
  await guide.focus();
  await guide.press('Escape');
  await expect(nav.locator('.portal-mega-menu')).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await guide.click();
  await expect(page).toHaveURL(/#guide$/);
  await expect(page.getByRole('heading', { level: 1, name: /필요한 복지를/ })).toBeVisible();
  await expect(nav.locator('.portal-mega-menu')).toBeHidden();
  await toggle.click();
  await page.locator('.portal-header .brand').click();
  await expect(nav.locator('.portal-mega-menu')).toBeHidden();
});

test('service introduction and current workspace have independent URLs and preserve a conversation draft', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: {
          id: 'navigation-member',
          name: '메뉴회원',
          age: 40,
          region: '서울',
        },
      },
    }),
  );
  await page.route('**/api/v1/finance/profile', (route) =>
    route.fulfill({
      json: {
        profile: null,
        calculation: null,
        updated_at: null,
      },
    }),
  );
  await page.route('**/api/v1/monitoring**', (route) =>
    route.fulfill({
      json: {
        profile: null,
        enabled: false,
        updated_at: null,
        last_checked_at: null,
        needs: [],
        candidates: [],
        alerts: [],
        unread_count: 0,
      },
    }),
  );
  await page.addInitScript(() =>
    localStorage.setItem('bokji-assistant-intro-v1:navigation-member', 'seen'),
  );
  await page.goto('/#assistant-intro');
  await expect(page.locator('.assistant-introduction')).toBeVisible();
  await expect(page.locator('.assistant-workspace')).toBeHidden();
  await page.getByRole('button', { name: 'AI 복지비서 시작하기', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-overview\?setup=1$/);
  await expect(page.locator('.assistant-workspace')).toBeVisible();
  await expect(page.locator('.assistant-profile-form')).toBeVisible();
  await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
  const input = page.locator('.assistant-page-conversation textarea').first();
  await input.fill('작성 중인 상담 내용을 유지합니다');
  const nav = page.getByRole('navigation', { name: '주 메뉴', exact: true });
  await nav.getByRole('button', { name: 'AI 비서 하위 메뉴', exact: true }).click();
  await nav.getByRole('link', { name: '서비스 소개', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-intro$/);
  await expect(page.locator('.assistant-introduction')).toBeVisible();
  await nav.getByRole('button', { name: 'AI 비서 하위 메뉴', exact: true }).click();
  await nav.getByRole('link', { name: '내 복지 현황', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-overview$/);
  await expect(input).toHaveValue('작성 중인 상담 내용을 유지합니다');
});

test('all languages and easy mode fit narrow viewports with a scrollable submenu', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#home');
  const selector = page.locator('.language-selector select');
  const toggle = page.locator('.portal-submenu-toggle').first();
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch').click();
    for (const language of ['ko', 'en', 'zh', 'vi', 'ja']) {
      await selector.selectOption(language);
      await toggle.click();
      await expect(page.locator('.portal-mega-menu')).toBeVisible();
      if (language !== 'ko')
        await expect(page.locator('.portal-mega-menu')).not.toContainText(/[가-힣]/);
      await page
        .locator('.portal-menu-column')
        .last()
        .getByRole('link')
        .last()
        .scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (language === 'en')
        await page.screenshot({ path: info.outputPath(`menu-320-easy-${easy}.png`) });
      await page.locator('.portal-menu-footer button').click();
      await expect(page.locator('.portal-mega-menu')).toBeHidden();
    }
  }
});
