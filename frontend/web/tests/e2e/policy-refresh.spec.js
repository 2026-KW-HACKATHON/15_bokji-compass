import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';

const listPattern = '**/api/v1/policies?**';
const loadingText = '공고를 가져오고 있어요.';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function holdList(page, response) {
  const pending = deferred();
  await page.route(listPattern, async (route) => {
    await pending.promise;
    // A superseded request may have been cancelled before the response is released.
    await route.fulfill(response).catch(() => {});
  });
  return pending.resolve;
}

function listResponse(items, total = items.length, nextCursor = null) {
  return { json: { items, total, nextCursor } };
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T03:00:00Z') });
  await mockPolicyApi(page);
});

test('the first request and a changed search retain foreground loading and error handling', async ({
  page,
}) => {
  const releaseInitial = await holdList(page, listResponse([demoPolicies[0]]));
  await page.goto('/#explore');
  await expect(page.getByText(loadingText, { exact: true })).toBeVisible();
  await expect(page.locator('.results-heading')).toContainText('불러오는 중');
  await expect(page.getByRole('article')).toHaveCount(0);
  releaseInitial();
  await expect(page.getByRole('article')).toHaveCount(1);

  const releaseSearch = await holdList(page, { status: 503, json: {} });
  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/v1/policies' && url.searchParams.get('q') === '새 검색';
  });
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('새 검색');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await searchRequest;
  await expect(page.getByText(loadingText, { exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  releaseSearch();
  await expect(page.getByRole('alert')).toContainText('공고를 불러오지 못했어요');

  await page.route(listPattern, (route) => route.fulfill(listResponse([])));
  await page.getByRole('button', { name: '다시 시도하기', exact: true }).click();
  await expect(page.getByText('조건에 맞는 공고가 없어요', { exact: true })).toBeVisible();
});

for (const easy of [false, true]) {
  test(`${easy ? 'easy' : 'normal'} list keeps cards, count, pagination and focus during timer and focus refresh`, async ({
    page,
  }) => {
    await page.route(listPattern, (route) => {
      const limit = Number(new URL(route.request().url()).searchParams.get('limit'));
      return route.fulfill(listResponse(demoPolicies.slice(0, limit), 12, String(limit)));
    });
    await page.goto('/#explore');
    await expect(page.getByRole('article')).toHaveCount(6);
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    const count = easy ? 3 : 6;
    const articles = page.getByRole('article');
    const pagination = page.getByRole('navigation', { name: '공고 페이지', exact: true });
    const action = articles.first().getByRole('button', {
      name: demoPolicies[0].title + ' 자세히 보기',
      exact: true,
    });
    await expect(articles).toHaveCount(count);
    await expect(page.locator('.results-heading')).toContainText('총 12개');
    await expect(pagination.getByRole('button', { name: '다음 페이지' })).toBeEnabled();
    await action.focus();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    for (const trigger of ['timer', 'focus']) {
      const summary =
        trigger === 'timer' ? '주기적으로 갱신한 요약' : '다시 돌아왔을 때 갱신한 요약';
      const updated = demoPolicies.slice(0, count).map((policy) => ({ ...policy, summary }));
      const release = await holdList(page, listResponse(updated, 12, String(count)));
      const request = page.waitForRequest(listPattern);
      if (trigger === 'timer') await page.clock.fastForward(30001);
      else await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await request;
      await page.clock.runFor(50);

      await expect(articles).toHaveCount(count);
      await expect(page.getByText(loadingText, { exact: true })).toHaveCount(0);
      await expect(page.locator('.results-heading')).toContainText('총 12개');
      await expect(pagination).toContainText(easy ? '1–3 / 12개' : '1번째 페이지');
      await expect(pagination.getByRole('button', { name: '다음 페이지' })).toBeEnabled();
      await expect(action).toBeFocused();
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

      release();
      await expect(articles.first().locator('.card-summary')).toHaveText(summary);
      await expect(action).toBeFocused();
    }
  });
}

test('a background failure keeps the last list and a later refresh applies the latest data', async ({
  page,
}) => {
  await page.route(listPattern, (route) => route.fulfill(listResponse([demoPolicies[0]])));
  await page.goto('/#explore');
  await expect(page.getByRole('article')).toHaveCount(1);
  const releaseFailure = await holdList(page, { status: 503, json: {} });
  const request = page.waitForRequest(listPattern);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await request;
  await page.clock.runFor(50);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByText(loadingText, { exact: true })).toHaveCount(0);

  const failedResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/policies?') && response.status() === 503,
  );
  releaseFailure();
  await (await failedResponse).finished();
  await page.clock.runFor(100);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('article').locator('.card-summary')).toHaveText(
    demoPolicies[0].summary,
  );
  await expect(page.locator('.results-heading')).toContainText('총 1개');

  const updated = { ...demoPolicies[0], title: '최신 공고 제목', summary: '복구 후 최신 요약' };
  await page.route(listPattern, (route) => route.fulfill(listResponse([updated, demoPolicies[1]])));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('article').first()).toContainText(updated.title);
  await expect(page.locator('.results-heading')).toContainText('총 2개');
});

test('a changed search replaces an in-flight background refresh without showing its stale result', async ({
  page,
}) => {
  await page.route(listPattern, (route) => route.fulfill(listResponse([demoPolicies[0]])));
  await page.goto('/#explore');
  await expect(page.getByRole('article')).toHaveCount(1);

  const stale = deferred();
  const search = deferred();
  const updated = { ...demoPolicies[1], title: '새 검색 결과', summary: '새 검색 결과의 요약' };
  await page.route(listPattern, async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q');
    await (query ? search.promise : stale.promise);
    await route.fulfill(listResponse([query ? updated : demoPolicies[0]])).catch(() => {});
  });
  const refreshRequest = page.waitForRequest(listPattern);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshRequest;
  await page.clock.runFor(50);
  await expect(page.getByRole('article')).toHaveCount(1);

  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/v1/policies' && url.searchParams.get('q') === '새 검색';
  });
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('새 검색');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await searchRequest;
  await expect(page.getByText(loadingText, { exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  stale.resolve();
  await page.clock.runFor(100);
  await expect(page.getByText(loadingText, { exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  search.resolve();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(updated.title);
  await expect(page.getByRole('article')).not.toContainText(demoPolicies[0].title);
});
