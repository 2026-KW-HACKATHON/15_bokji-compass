import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';
import { filterPolicies } from '../../src/features/policies/policyRepository.js';

const items = [
  {
    title: '농업인 생산 지원',
    category: '농림축산·어업',
    date: '2026-01-01',
    views: 9000,
  },
  {
    title: '소상공인 창업 지원',
    category: '사업·창업',
    date: '2026-02-01',
    views: 8000,
  },
  {
    title: '생활비 지원',
    category: '생활·금융',
    date: '2026-10-07',
    views: 7000,
  },
  { title: '교육비 지원', category: '교육', date: '2026-10-06', views: 6000 },
  { title: '주거 지원', category: '주거', date: '2026-10-05', views: 5000 },
  { title: '문화 지원', category: '문화', date: '2026-10-04', views: 4000 },
  {
    title: '어업인 시설 지원',
    category: '농림축산·어업',
    date: '2026-03-01',
    views: 3000,
  },
  { title: '기타 지원', category: '기타', date: '2026-10-03', views: null },
].map(({ views, ...item }, index) => ({
  ...demoPolicies[0],
  ...item,
  id: 'popularity-' + index,
  tags: [item.category],
  popularity:
    views === null ? null : { views, source: 'gov24', basis: 'provider_cumulative_views' },
}));

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.route('**/api/v1/policies?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const all = filterPolicies(items, {
      ...Object.fromEntries(params),
      query: params.get('q') || '',
    });
    const offset = Number(params.get('cursor') || 0);
    const limit = Number(params.get('limit'));
    return route.fulfill({
      json: {
        items: all.slice(offset, offset + limit),
        total: all.length,
        nextCursor: offset + limit < all.length ? String(offset + limit) : null,
      },
    });
  });
});

test('entire catalog defaults to views and sort changes and reset return to first page', async ({
  page,
}) => {
  await page.goto('/#explore');
  await expect(page.getByRole('combobox', { name: '정렬', exact: true })).toHaveValue('popular');
  await expect(page.getByRole('article').first()).toContainText('농업인 생산 지원');
  await expect(page.getByRole('article').first()).toContainText('9,000회');
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  const next = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/v1/policies') && url.searchParams.get('sort') === 'recent';
  });
  await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('recent');
  expect(new URL((await next).url()).searchParams.has('cursor')).toBe(false);
  await expect(page.getByRole('article').first()).toContainText('생활비 지원');
  await page.getByRole('button', { name: '검색 조건 지우기', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '정렬', exact: true })).toHaveValue('popular');
  await expect(page.getByRole('article').first()).toContainText('농업인 생산 지원');
});

test('new category filters work in normal and easy screens at narrow width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#explore');
  await page.getByRole('button', { name: '농림축산·어업', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('article').first()).toContainText('농업인 생산 지원');
  await page.getByRole('button', { name: '사업·창업', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('소상공인 창업 지원');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.locator('.filter-summary-value')).toContainText('사업·창업');
  await expect(page.locator('.filter-summary-value')).toContainText('인기순 (조회수)');
  await page.locator('.filter-panel > summary').click();
  await page.getByRole('combobox', { name: '분야', exact: true }).selectOption('농림축산·어업');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('article').first()).toContainText('농업인 생산 지원');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
