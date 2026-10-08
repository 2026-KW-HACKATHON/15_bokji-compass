import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';

const createPolicy = (id, title, end, status = 'dated') => ({
  ...demoPolicies[0],
  id,
  title,
  applicationStart: '2026-10-01',
  applicationEnd: end,
  scheduleStatus: status,
  applicationPeriod: end ? `2026-10-01 ~ ${end}` : '상시 신청',
});
const policies = [
  createPolicy('deadline-future', '마감 일주일 전 공고', '2026-10-15'),
  createPolicy('deadline-today', '오늘 마감 공고', '2026-10-08'),
  createPolicy('deadline-closed', '이미 마감된 공고', '2026-10-05'),
  createPolicy('deadline-ongoing', '상시 공고', null, 'ongoing'),
  createPolicy('deadline-unknown', '마감일 없는 공고', null, 'unknown'),
];

async function installPolicies(page, items) {
  await mockPolicyApi(page);
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items, total: items.length, nextCursor: null } }),
  );
  await page.route('**/api/v1/recommendations', (route) =>
    route.fulfill({
      json: {
        summary: '테스트 추천',
        items: items.slice(0, 3).map((policy) => ({ policy, reason: '테스트 추천 이유' })),
      },
    }),
  );
  await page.route(/\/api\/v1\/policies\/deadline-[^/?]+$/, (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1));
    const policy = items.find((item) => item.id === id);
    return route.fulfill(policy ? { json: policy } : { status: 404, json: {} });
  });
}

test('deadline badges appear on cards, details and saved notices in both display modes', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-08T03:00:00Z') });
  await installPolicies(page, policies);
  await page.goto('/#explore');
  const states = ['D-7', 'D-Day', '마감 D+3', '상시 접수', '마감일 확인 필요'];
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    for (const [index, policy] of policies.entries()) {
      const article = page.getByRole('article').filter({ hasText: policy.title });
      await expect(article.locator('.policy-deadline')).toHaveText(states[index]);
    }
    const article = page.getByRole('article').filter({ hasText: policies[0].title });
    await article
      .getByRole('button', { name: policies[0].title + ' 자세히 보기', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.policy-deadline')).toHaveText('D-7');
    await expect(dialog.locator('.policy-deadline')).toHaveAttribute(
      'aria-label',
      '신청 마감까지 7일 남음',
    );
    await page.keyboard.press('Escape');
  }
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await page
    .getByRole('article')
    .filter({ hasText: policies[0].title })
    .getByRole('button', { name: policies[0].title + ' 저장', exact: true })
    .click();
  await page.goto('/#saved');
  await expect(
    page.getByRole('article').filter({ hasText: policies[0].title }).locator('.policy-deadline'),
  ).toHaveText('D-7');
  await page.goto('/#home');
  await expect(
    page
      .locator('.home-policy-row')
      .filter({ hasText: policies[0].title })
      .locator('.policy-deadline'),
  ).toHaveText('D-7');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('deadline badges advance at Korean midnight without refreshing the page', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-08T14:59:00Z') });
  await page.clock.pauseAt(new Date('2026-10-08T14:59:59Z'));
  const policy = createPolicy('deadline-midnight', '한국 자정 갱신 공고', '2026-10-09');
  await installPolicies(page, [policy]);
  await page.goto('/#explore');
  const badge = page.locator('.policy-card .policy-deadline');
  await expect(badge).toHaveText('D-1');
  await page.clock.runFor(2000);
  await expect(badge).toHaveText('D-Day');
  await page.clock.setFixedTime(new Date('2026-10-09T15:00:01Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(badge).toHaveText('마감 D+1');
});

test('calendar today marker and closed status advance with deadline badges at Korean midnight', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-08T14:59:00Z') });
  await page.clock.pauseAt(new Date('2026-10-08T14:59:59Z'));
  const policy = createPolicy(
    'deadline-calendar-midnight',
    '자정 마감 상태 갱신 공고',
    '2026-10-08',
  );
  await installPolicies(page, [policy]);
  await page.route('**/api/v1/policies/calendar?**', (route) =>
    route.fulfill({
      json: {
        month: '2026-10',
        items: [policy],
        total: 1,
        truncated: false,
        undatedItems: [],
        undatedTotal: 0,
      },
    }),
  );
  await page.goto('/#calendar');
  const panel = page.locator('.calendar-day-panel');
  await expect(panel.locator('.policy-deadline')).toHaveText('D-Day');
  await expect(page.getByRole('button', { name: /10월 8일 오늘,/ })).toHaveAttribute(
    'aria-current',
    'date',
  );
  await page.clock.runFor(2000);
  await expect(panel.locator('.policy-deadline')).toHaveText('마감 D+1');
  await expect(panel.getByText('접수 마감', { exact: true })).toBeVisible();
  const today = page.getByRole('button', { name: /10월 9일 오늘,/ });
  await expect(today).toHaveAttribute('aria-current', 'date');
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: '10월 9일 공고', exact: true })).toBeVisible();
});

test('calendar deadline uses today rather than the selected day and includes expanded month ranges', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2027-04-02T03:00:00Z') });
  const policy = {
    ...createPolicy('deadline-month', '3~4월 마감 공고', '2027-04-30'),
    applicationStart: '2027-03-01',
    applicationPeriod: '3~4월',
    applicationPrecision: 'month',
    applicationMonths: [3, 4],
    applicationYear: null,
  };
  await installPolicies(page, [policy]);
  await page.route('**/api/v1/policies/calendar?**', (route) =>
    route.fulfill({
      json: {
        month: '2027-04',
        items: [policy],
        total: 1,
        truncated: false,
        undatedItems: [],
        undatedTotal: 0,
      },
    }),
  );
  await page.goto('/#calendar');
  const panel = page.locator('.calendar-day-panel');
  await expect(panel.locator('.policy-deadline')).toHaveText('D-28');
  await page.getByRole('button', { name: /4월 30일, 신청 시작 0건, 마감 1건/ }).click();
  await expect(panel.locator('.policy-deadline')).toHaveText('D-28');
  await panel.getByRole('button', { name: policy.title, exact: true }).click();
  await expect(page.getByRole('dialog').locator('.policy-deadline')).toHaveText('D-28');
});
