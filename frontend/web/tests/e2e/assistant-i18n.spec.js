import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { emptyMonitoringProfile } from '../../src/features/monitoring/monitoringModel.js';

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
    // No server or user content is present in this guest view: all page copy is UI.
    await expect(page.locator('.assistant-page')).not.toContainText(/[가-힣]/);
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

test('assistant translations preserve profile edits and an unsent conversation in all languages', async ({
  page,
}, info) => {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: 'i18n-member', name: 'Alex', age: 40, region: '서울' },
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
        profile: {
          ...emptyMonitoringProfile,
          housing_tenure: 'owner',
          building_year: 1920,
          repair_needed: true,
          disaster_damage: true,
          job_seeking: true,
        },
        enabled: true,
        updated_at: null,
        last_checked_at: null,
        needs: [],
        candidates: [],
        alerts: [],
        unread_count: 0,
      },
    }),
  );
  const dialogueCalls = [];
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    dialogueCalls.push(route.request().postDataJSON());
    return route.fulfill({ status: 500, json: {} });
  });
  await page.goto('/#assistant');
  const dashboard = page.locator('.monitoring-dashboard-grid');
  await expect(dashboard).toContainText('1920년 준공');
  await page.getByRole('button', { name: '생활정보 수정하기', exact: true }).click();
  const year = page.locator('.monitoring-form input[type="number"]');
  await year.fill('2010');
  await page.getByRole('button', { name: '내 상황 입력하기', exact: true }).click();
  const draft = page.locator('.assistant-page .guided-conversation textarea').first();
  // A new conversation starts with the user's own words, without a preset scenario.
  await expect(draft).toHaveValue('');
  await expect(page.locator('.guided-examples')).toHaveCount(0);
  await page
    .locator('.guided-conversation')
    .screenshot({ path: info.outputPath('assistant-free-input.png') });
  await draft.fill('My roof leaks / 屋顶漏水');

  for (const [language, assistant] of variants) {
    await page.locator('.language-selector select').selectOption(language);
    await expect(
      page.getByRole('heading', { level: 1, name: assistant, exact: true }),
    ).toBeVisible();
    await expect(dashboard).not.toContainText(/[가-힣]/);
    await expect(page.locator('.monitoring-dashboard-nav')).not.toContainText(/[가-힣]/);
    await expect(page.locator('.monitoring-form')).not.toContainText(/[가-힣]/);
    await expect(page.locator('.monitoring-overview')).not.toContainText(/[가-힣]/);
    await expect(year).toHaveValue('2010');
    await expect(draft).toHaveValue('My roof leaks / 屋顶漏水');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (['en', 'zh'].includes(language)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`assistant-${language}.png`) });
    }
  }
  expect(dialogueCalls).toEqual([]);
  await page.locator('.language-selector select').selectOption('ko');
  await expect(dashboard).toContainText('1920년 준공');
  await expect(year).toHaveValue('2010');
  await expect(draft).toHaveValue('My roof leaks / 屋顶漏水');
});
