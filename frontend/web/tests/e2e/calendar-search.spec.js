import { test, expect } from '@playwright/test';
import { filterPolicies } from '../../src/features/policies/policyRepository.js';

const base = {
  summary: '격리된 검색 범위 검증 공고',
  tags: [],
  date: '2026-10-01',
  benefit: '학습 지원',
  audience: '전체',
  region: '전국',
  category: '교육',
  sourceUrl: 'https://example.test/calendar-search',
  applicationStart: '2026-10-01',
  applicationEnd: '2026-10-31',
  applicationPeriod: '2026-10-01 ~ 2026-10-31',
  scheduleStatus: 'dated',
};
const fixtures = [
  { ...base, id: 'calendar-publisher', title: '지역 장학재단 지원', organization: '광운대학교' },
  { ...base, id: 'calendar-related', title: '광운대 학생 학습 지원', organization: '서울시' },
];

const calendarRequest = (page, query, scope) =>
  page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/policies/calendar' &&
      url.searchParams.get('q') === query &&
      url.searchParams.get('search_scope') === scope
    );
  });

test('calendar scope preserves the committed query across screen modes and resets to all', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-02T03:00:00Z') });
  await page.route('**/api/v1/policies/calendar?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const items = filterPolicies(fixtures, {
      query: params.get('q') || '',
      searchScope: params.get('search_scope') || 'all',
    });
    return route.fulfill({
      json: {
        month: params.get('month'),
        items,
        total: items.length,
        truncated: false,
        undatedItems: [],
        undatedTotal: 0,
      },
    });
  });
  const firstRequest = calendarRequest(page, null, null);
  await page.goto('/#calendar');
  await firstRequest;
  const input = page.getByRole('textbox', { name: '캘린더 공고 검색', exact: true });
  const scope = page.getByRole('combobox', { name: '검색 범위', exact: true });
  const panel = page.locator('.calendar-day-panel');
  await page.locator('.policy-search-options > summary').click();
  await expect(scope).toHaveValue('all');
  await expect(scope).toHaveAccessibleDescription(/공고를 올린 기관.*제목과 본문/);
  await input.fill('광운대');
  await input.press('Enter');
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 2개');

  await input.fill('아직 검색하지 않은 글');
  const publisherRequest = calendarRequest(page, '광운대', 'organization');
  await scope.selectOption('organization');
  await publisherRequest;
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 1개');
  await expect(
    panel.getByRole('button', { name: '지역 장학재단 지원', exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: '광운대 학생 학습 지원', exact: true }),
  ).toHaveCount(0);
  await expect(input).toHaveValue('아직 검색하지 않은 글');

  const contentRequest = calendarRequest(page, '광운대', 'content');
  await scope.selectOption('content');
  await contentRequest;
  await expect(
    panel.getByRole('button', { name: '광운대 학생 학습 지원', exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: '지역 장학재단 지원', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(scope).toBeVisible();
  await expect(scope).toHaveValue('content');
  await expect(page.getByRole('heading', { name: '10월 2일 공고', exact: true })).toBeVisible();
  await expect(page.locator('.calendar-filters > summary')).toContainText('공고 내용');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  if (!(await page.locator('.calendar-filters').evaluate((element) => element.open)))
    await page.getByText('캘린더 검색 조건', { exact: true }).click();
  const resetRequest = calendarRequest(page, null, null);
  await page.getByRole('button', { name: '검색 조건 지우기', exact: true }).click();
  await resetRequest;
  await expect(scope).toHaveValue('all');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 2개');
});
