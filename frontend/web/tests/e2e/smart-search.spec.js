import { test, expect } from '@playwright/test';
import {
  mockSmartSearchApi,
  messyQuery,
  publisherQuery,
  smartSummary,
} from '../fixtures/smart-search.js';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T03:00:00Z') });
  await mockSmartSearchApi(page);
});

test('a colloquial query searches immediately, shows correction and grounded results, and permits original wording', async ({
  page,
}) => {
  await page.goto('/#explore');
  const input = page.getByRole('textbox', { name: '공고 검색', exact: true });
  const interpretation = page.getByRole('region', { name: '검색 해석' });
  await expect(page.getByRole('combobox', { name: '검색 범위', exact: true })).toBeHidden();
  await input.fill(messyQuery);
  const request = page.waitForRequest(
    (value) => new URL(value.url()).searchParams.get('q') === messyQuery,
  );
  await input.press('Enter');
  const params = new URL((await request).url()).searchParams;
  expect(params.has('sort')).toBe(false);
  expect(params.has('search_scope')).toBe(false);
  await expect(input).toHaveValue(messyQuery);
  await expect(interpretation).toContainText(smartSummary);
  await expect(interpretation).toContainText('‘광운데’ → ‘광운대’');
  const articles = page.getByRole('article');
  await expect(articles).toHaveCount(2);
  await expect(articles.filter({ hasText: '근로 장학 프로그램' })).toHaveCount(0);
  const national = articles.filter({
    has: page.getByRole('heading', { name: '대학생 등록금 지원', exact: true }),
  });
  await expect(national).toContainText('학교에 관계없이 대학 재학생 대상');
  await national.locator('.policy-search-match summary').click();
  await expect(national.locator('blockquote')).toContainText(
    '국내 대학 재학생의 등록금을 지원합니다. 근로 의무가 없습니다.',
  );
  await page.locator('.explorer-advanced > summary').click();
  await expect(page.getByRole('combobox', { name: '정렬', exact: true })).toHaveValue('auto');
  await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('popular');
  await expect(articles).toHaveCount(2);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(interpretation).toContainText(smartSummary);
  await expect(articles.first().locator('.policy-search-match')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({
    path: test.info().outputPath('smart-search-colloquial-easy-320.png'),
    fullPage: true,
  });
  const undo = page.waitForRequest(
    (value) => new URL(value.url()).searchParams.get('search_mode') === 'literal',
  );
  await interpretation.getByRole('button', { name: '원래 검색어로 찾기', exact: true }).click();
  await undo;
  await expect(input).toHaveValue(messyQuery);
  await expect(page.getByText('조건에 맞는 공고가 없어요', { exact: true })).toBeVisible();
});

test('ambiguous school query returns results first and optional facets refine them on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#explore');
  const input = page.getByRole('textbox', { name: '공고 검색', exact: true });
  await input.fill('광운대');
  await input.press('Enter');
  const interpretation = page.getByRole('region', { name: '검색 해석' });
  await expect(page.getByRole('article')).toHaveCount(4);
  const related = interpretation.getByRole('button', { name: '광운대 관련 지원 3개', exact: true });
  const refinement = page.waitForRequest(
    (value) => new URL(value.url()).searchParams.get('search_relation') === 'related',
  );
  await related.click();
  const params = new URL((await refinement).url()).searchParams;
  expect(params.has('search_scope')).toBe(false);
  expect(params.has('search_mode')).toBe(false);
  expect(params.get('q')).toBe('광운대');
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(related).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('article').filter({ hasText: '우리대학 학생 생활 지원' }),
  ).toHaveCount(1);
  await expect(page.getByRole('article').filter({ hasText: '캠퍼스 행사 안내' })).toHaveCount(0);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(related).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toHaveCount(3);
  await related.click();
  await expect(related).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.results-heading')).toContainText('4개');
  const publisher = interpretation.getByRole('button', {
    name: '광운대가 올린 공고 3개',
    exact: true,
  });
  const publisherRequest = page.waitForRequest(
    (value) => new URL(value.url()).searchParams.get('search_relation') === 'publisher',
  );
  await publisher.click();
  const publisherParams = new URL((await publisherRequest).url()).searchParams;
  expect(publisherParams.has('search_scope')).toBe(false);
  await expect(publisher).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(
    page.getByRole('article').filter({ hasText: '우리대학 학생 생활 지원' }),
  ).toHaveCount(0);
  await page.locator('.explorer-advanced > summary').click();
  await page.locator('.policy-search-options > summary').click();
  await expect(page.getByRole('combobox', { name: '검색 범위', exact: true })).toHaveValue('all');
  await page.getByRole('combobox', { name: '검색 범위', exact: true }).selectOption('content');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(publisher).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('combobox', { name: '검색 범위', exact: true }).selectOption('all');
  await input.fill(publisherQuery);
  await input.press('Enter');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(interpretation).toContainText('광운대학교가 올린 장학 공고로 이해했어요.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('smart-search-easy-320.png'),
    fullPage: true,
  });
});

test('calendar uses the same natural query interpretation and safely renders literal evidence text', async ({
  page,
}) => {
  await page.goto('/#calendar');
  const input = page.getByRole('textbox', { name: '캘린더 공고 검색', exact: true });
  await input.fill(messyQuery);
  await input.press('Enter');
  await expect(page.getByRole('region', { name: '검색 해석' })).toContainText(smartSummary);
  await expect(page.locator('.calendar-day-panel .policy-search-match')).toHaveCount(2);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('region', { name: '검색 해석' })).toContainText(
    '‘광운데’ → ‘광운대’',
  );
  await input.fill('광운대');
  await input.press('Enter');
  const refinement = page.waitForRequest(
    (value) =>
      value.url().includes('/calendar?') &&
      new URL(value.url()).searchParams.get('search_relation') === 'related',
  );
  await page
    .getByRole('region', { name: '검색 해석' })
    .getByRole('button', { name: '광운대 관련 지원 3개', exact: true })
    .click();
  expect(new URL((await refinement).url()).searchParams.has('search_scope')).toBe(false);
  await expect(page.locator('.calendar-day-panel .policy-search-match')).toHaveCount(3);
  await expect(page.locator('.calendar-day-panel')).toContainText('우리대학 학생 생활 지원');
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'escaped',
            title: '공고',
            summary: '',
            tags: [],
            searchMatch: {
              relations: ['literal'],
              reason: '<img src=x onerror=alert(1)>',
              evidence: [{ field: 'text', quote: '<script>window.xss=true</script>' }],
            },
          },
        ],
        total: 1,
        nextCursor: null,
      },
    }),
  );
  await page.goto('/#explore');
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('내용');
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).press('Enter');
  await expect(page.locator('.policy-search-match')).toContainText('<img src=x onerror=alert(1)>');
  await page.locator('.policy-search-match summary').click();
  await expect(page.locator('.policy-search-match blockquote')).toContainText(
    '<script>window.xss=true</script>',
  );
  expect(await page.locator('.policy-search-match img, .policy-search-match script').count()).toBe(
    0,
  );
});
