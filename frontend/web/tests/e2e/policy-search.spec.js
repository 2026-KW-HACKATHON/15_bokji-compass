import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { searchPolicies } from '../fixtures/policy-search.js';
import { filterPolicies } from '../../src/features/policies/policyRepository.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.route('**/api/v1/policies?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const all = filterPolicies(searchPolicies, {
      ...Object.fromEntries(params),
      query: params.get('q') || '',
      searchScope: params.get('search_scope') || 'all',
    });
    const offset = Number(params.get('cursor') || 0);
    const limit = Number(params.get('limit') || 6);
    return route.fulfill({
      json: {
        items: all.slice(offset, offset + limit),
        total: all.length,
        nextCursor: offset + limit < all.length ? String(offset + limit) : null,
      },
    });
  });
});

const listRequest = (page, { query, scope, cursor = null, limit = '6' }) =>
  page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/policies' &&
      url.searchParams.get('q') === query &&
      url.searchParams.get('search_scope') === scope &&
      url.searchParams.get('cursor') === cursor &&
      url.searchParams.get('limit') === limit
    );
  });

test('publisher and content search return distinct results and scope changes restart pagination', async ({
  page,
}) => {
  await page.goto('/#explore');
  const input = page.getByRole('textbox', { name: '공고 검색', exact: true });
  const scope = page.getByRole('combobox', { name: '검색 범위', exact: true });
  const articles = page.getByRole('article');
  const pagination = page.getByRole('navigation', {
    name: '공고 페이지',
    exact: true,
  });
  await page.locator('.explorer-advanced > summary').click();
  await page.locator('.policy-search-options > summary').click();
  await expect(scope).toHaveValue('all');
  await expect(scope).toHaveAccessibleDescription(/공고를 올린 기관.*제목과 본문/);
  await input.fill('광운대');
  await input.press('Enter');
  await expect(page.locator('.results-heading')).toContainText('총 11개');
  await pagination.getByRole('button', { name: '다음 페이지' }).click();
  await expect(pagination).toContainText('2번째 페이지');
  await expect(articles).toHaveCount(5);

  // A scope change applies to the committed search without submitting a draft.
  await input.fill('아직 검색하지 않은 글');
  const publisherRequest = listRequest(page, {
    query: '광운대',
    scope: 'organization',
  });
  await scope.selectOption('organization');
  await publisherRequest;
  await expect(pagination).toContainText('1번째 페이지');
  await expect(page.locator('.results-heading')).toContainText('총 7개');
  await expect(articles).toHaveCount(6);
  for (const article of await articles.all()) await expect(article).toContainText('광운대학교');
  await expect(input).toHaveValue('아직 검색하지 않은 글');
  await pagination.getByRole('button', { name: '다음 페이지' }).click();
  await expect(articles).toHaveCount(1);

  const contentRequest = listRequest(page, {
    query: '광운대',
    scope: 'content',
  });
  await scope.selectOption('content');
  await contentRequest;
  await expect(page.locator('.results-heading')).toContainText('총 5개');
  await expect(articles).toHaveCount(5);
  await expect(
    articles.getByRole('heading', {
      name: '광운대 협력 학생 장학 지원',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    articles.getByRole('heading', {
      name: '대학 연계 진로 교육 1',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    articles.getByRole('heading', {
      name: '지역 청년 장학 프로그램 2',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(pagination.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  await expect(pagination.getByRole('button', { name: '다음 페이지' })).toBeDisabled();

  const resetRequest = listRequest(page, { query: null, scope: null });
  await page.getByRole('button', { name: '검색 조건 지우기', exact: true }).click();
  await resetRequest;
  await expect(scope).toHaveValue('all');
  await expect(input).toHaveValue('');
  await expect(page.locator('.results-heading')).toContainText('총 12개');
});

test('keyboard scope selection stays visible and keeps its search when changing screen modes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#explore');
  const input = page.getByRole('textbox', { name: '공고 검색', exact: true });
  const scope = page.getByRole('combobox', { name: '검색 범위', exact: true });
  await page.locator('.explorer-advanced > summary').click();
  await page.locator('.policy-search-options > summary').click();
  await input.fill('광운대학교');
  await input.press('Enter');
  await scope.focus();
  await scope.press('Home');
  await scope.press('ArrowDown');
  await scope.press('Enter');
  await expect(scope).toHaveValue('organization');
  await expect(page.locator('.results-heading')).toContainText('총 7개');
  await scope.press('ArrowDown');
  await scope.press('Enter');
  await expect(scope).toHaveValue('content');
  await expect(page.locator('.results-heading')).toContainText('총 5개');

  const easyRequest = listRequest(page, {
    query: '광운대학교',
    scope: 'content',
    limit: '3',
  });
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await easyRequest;
  await expect(scope).toBeVisible();
  await expect(scope).toHaveValue('content');
  await expect(page.getByRole('article')).toHaveCount(3);
  const pagination = page.getByRole('navigation', {
    name: '공고 페이지',
    exact: true,
  });
  await expect(pagination).toContainText('1–3 / 5개');
  await expect(page.locator('.filter-panel > summary')).toContainText('공고 내용');
  await page.screenshot({
    path: test.info().outputPath('policy-search-easy-320.png'),
    fullPage: true,
  });
  await pagination.getByRole('button', { name: '다음 페이지' }).click();
  await expect(pagination).toContainText('4–5 / 5개');
  await expect(page.getByRole('heading', { name: '공고 목록', exact: true })).toBeFocused();
  const standardRequest = listRequest(page, {
    query: '광운대학교',
    scope: 'content',
  });
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await standardRequest;
  await expect(scope).toHaveValue('content');
  await expect(page.getByRole('article')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
