import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('each section shows only its own destinations, including guidance and new notices', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Mobile uses the full-screen hamburger menu.');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1466, height: 643 });
  await page.goto('/#home');
  const nav = page.getByRole('navigation', { name: '주 메뉴', exact: true });
  await expect(nav.locator('.portal-nav > .portal-nav-group')).toHaveCount(7);
  await expect(
    nav.locator('.portal-nav').getByRole('link', { name: '계산기', exact: true }),
  ).toHaveCount(0);
  await nav.getByRole('button', { name: 'AI 비서 하위 메뉴', exact: true }).click();
  const panel = nav.locator('.portal-mega-menu');
  await expect(panel).toBeVisible();
  const ai = panel.getByRole('region', { name: 'AI 비서', exact: true });
  await expect(panel.getByRole('region')).toHaveCount(1);
  await expect(ai.getByRole('link', { name: '지속 복지 안내', exact: true })).toHaveAttribute(
    'href',
    '#assistant-monitoring',
  );
  await expect(ai.getByRole('link', { name: '서비스 소개', exact: true })).toHaveAttribute(
    'href',
    '#assistant-intro',
  );
  await expect(ai.getByRole('link', { name: '내 복지 현황', exact: true })).toHaveAttribute(
    'href',
    '#assistant-overview',
  );
  await expect(ai.getByRole('link', { name: 'AI 비서와 대화하기', exact: true })).toHaveAttribute(
    'href',
    '#assistant-chat',
  );
  await nav.getByRole('button', { name: '홈 하위 메뉴', exact: true }).click();
  const home = panel.getByRole('region', { name: '홈', exact: true });
  await expect(home.getByRole('link', { name: '서비스 안내', exact: true })).toHaveAttribute(
    'href',
    '#guide',
  );
  await nav.getByRole('button', { name: '내 정보 하위 메뉴', exact: true }).click();
  const account = panel.getByRole('region', { name: '내 정보', exact: true });
  await expect(
    account.getByRole('link', { name: '신규공고 확인하기', exact: true }),
  ).toHaveAttribute('href', '#new-notices');
  await expect(ai).toHaveCount(0);
  await expect(account.getByRole('link', { name: '계산기', exact: true })).toHaveAttribute(
    'href',
    '#calculator',
  );
  const rows = await account.getByRole('link').evaluateAll((links) =>
    links.map((link) => {
      const { x, y, bottom } = link.getBoundingClientRect();
      return { x, y, bottom };
    }),
  );
  for (let index = 1; index < rows.length; index += 1) {
    expect(Math.abs(rows[index].x - rows[0].x)).toBeLessThan(1);
    expect(rows[index].y).toBeGreaterThanOrEqual(rows[index - 1].bottom);
  }
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
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Mobile dialog keyboard controls have separate coverage.',
  );
  await page.goto('/#home');
  const nav = page.getByRole('navigation', { name: '주 메뉴', exact: true });
  const toggle = nav.getByRole('button', { name: '홈 하위 메뉴', exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const guide = nav.getByRole('link', { name: '서비스 안내', exact: true });
  await toggle.press('Tab');
  await expect(nav.getByRole('link', { name: '홈으로 이동', exact: true })).toBeFocused();
  await nav.getByRole('link', { name: '홈으로 이동', exact: true }).press('Tab');
  await expect(guide).toBeFocused();
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

test('hover switches between sections and keeps the panel open while entering its links', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Touch uses the explicit menu buttons.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#home');
  const nav = page.getByRole('navigation', { name: '주 메뉴', exact: true });
  const panel = nav.locator('.portal-mega-menu');
  for (const label of [
    '홈',
    '우리 동네 복지',
    'AI 비서',
    '전체 공고',
    '공고 캘린더',
    '저장한 공고',
    '내 정보',
  ]) {
    await nav.locator('.portal-nav').getByRole('link', { name: label, exact: true }).hover();
    await expect(panel.getByRole('region', { name: label, exact: true })).toBeVisible();
    await expect(panel.getByRole('region')).toHaveCount(1);
    await panel.getByRole('link').first().hover();
    await expect(panel).toBeVisible();
  }
  await page.mouse.move(12, 700);
  await expect(panel).toBeHidden();
});

test('service introduction and current workspace have independent URLs and preserve a conversation draft', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Mobile destinations have separate coverage.');
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
  await expect(page).toHaveURL(/#assistant-chat$/);
  const input = page.getByRole('textbox', { name: 'AI 비서에게 물어보기' });
  await input.fill('작성 중인 상담 내용을 유지합니다');
  const nav = page.getByRole('navigation', { name: '주 메뉴', exact: true });
  await nav.getByRole('button', { name: 'AI 비서 하위 메뉴', exact: true }).click();
  await nav.getByRole('link', { name: '서비스 소개', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-intro$/);
  await expect(page.locator('.assistant-introduction')).toBeVisible();
  await nav.getByRole('button', { name: 'AI 비서 하위 메뉴', exact: true }).click();
  await nav.getByRole('link', { name: '내 복지 현황', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-overview$/);
  await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
  await expect(input).toHaveValue('작성 중인 상담 내용을 유지합니다');
});

test('all languages and easy mode fit narrow viewports with a vertical mobile menu', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#home');
  const selector = page.locator('.language-selector select');
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch').click();
    const toggle = page.locator('.mobile-navigation > button');
    const panel = page.locator('.mobile-menu-dialog');
    for (const language of ['ko', 'en', 'zh', 'vi', 'ja']) {
      await selector.selectOption(language);
      await toggle.click();
      await expect(panel).toBeVisible();
      if (language !== 'ko') await expect(panel).not.toContainText(/[가-힣]/);
      await panel.getByRole('link').last().scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (language === 'en')
        await page.screenshot({ path: info.outputPath(`menu-320-easy-${easy}.png`) });
      await panel.locator('.mobile-menu-heading button').click();
      await expect(panel).toBeHidden();
    }
  }
});
