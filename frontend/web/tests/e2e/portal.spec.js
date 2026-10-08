import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const waitForList = (page, filters) =>
  page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/policies' &&
      Object.entries(filters).every(([key, value]) => url.searchParams.get(key) === value)
    );
  });

async function expectNoPageOverflow(page) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

test('home search carries its query and region into the list and survives a reload', async ({
  page,
}) => {
  await page.goto('/#home');
  await page.getByRole('combobox', { name: '공고를 찾을 지역' }).selectOption('서울');
  await page.getByRole('searchbox', { name: '찾고 싶은 복지' }).fill('주거');
  const requested = waitForList(page, { q: '주거', region: '서울' });
  await page.getByRole('button', { name: '복지 공고 검색', exact: true }).click();
  await requested;

  await expect(page.getByRole('heading', { name: '전체 공고', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '공고 검색', exact: true })).toHaveValue('주거');
  await expect(page.getByRole('combobox', { name: '지역', exact: true })).toHaveValue('서울');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('청년의 첫 독립, 주거비 지원');

  const reloaded = waitForList(page, { q: '주거', region: '서울' });
  await page.reload();
  await reloaded;
  await expect(page.getByRole('textbox', { name: '공고 검색', exact: true })).toHaveValue('주거');
  await expect(page.getByRole('combobox', { name: '지역', exact: true })).toHaveValue('서울');
});

test('home category shortcuts retain the chosen region and list reset clears both filters', async ({
  page,
}) => {
  await page.goto('/#home');
  await page.getByRole('combobox', { name: '공고를 찾을 지역' }).selectOption('경기');
  const requested = waitForList(page, { category: '생활·금융', region: '경기', q: null });
  await page.getByRole('button', { name: '생활·금융', exact: true }).click();
  await requested;

  await expect(page.getByRole('combobox', { name: '지역', exact: true })).toHaveValue('경기');
  await expect(page.getByRole('button', { name: '생활·금융', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('든든한 일상을 위한 생활 지원');

  const reset = waitForList(page, { category: null, region: null, q: null });
  await page.getByRole('button', { name: '검색 조건 지우기', exact: true }).click();
  await reset;
  await expect(page.getByRole('combobox', { name: '지역', exact: true })).toHaveValue('전국');
  await expect(page.getByRole('button', { name: '전체', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('article')).toHaveCount(6);
});

test('the guide opens directly and its discovery and recommendation actions reach real pages', async ({
  page,
}) => {
  await page.goto('/#guide');
  const guideHeading = page.getByRole('heading', { level: 1, name: /필요한 복지를/ });
  await expect(guideHeading).toBeVisible();
  const introduction = page
    .getByRole('navigation', { name: '주 메뉴', exact: true })
    .getByRole('link', { name: '이용 안내', exact: true });
  await page.getByRole('button', { name: 'AI 비서 하위 메뉴', exact: true }).click();
  await expect(introduction).toHaveAttribute('aria-current', 'page');
  await expect(introduction).toBeInViewport({ ratio: 0.99 });
  await page.getByRole('button', { name: '메뉴 닫기', exact: true }).click();
  await page.getByRole('button', { name: '나에게 필요한 공고 찾기', exact: true }).click();
  await expect(page).toHaveURL(/#explore$/);
  await expect(page.getByRole('textbox', { name: '공고 검색', exact: true })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#guide$/);
  await expect(guideHeading).toBeVisible();
  await page.getByRole('button', { name: '맞춤 추천 시작하기', exact: true }).click();
  await expect(page).toHaveURL(/#profile$/);
  await expect(page.getByRole('heading', { name: '내 정보', exact: true })).toBeVisible();
});

test('mobile navigation and easy mode keep the home, guide and list within a 320 pixel viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#home');
  await expect(page.getByRole('searchbox', { name: '찾고 싶은 복지' })).toBeVisible();
  await expectNoPageOverflow(page);
  const easySwitch = page.getByRole('switch', { name: /^쉬운 화면/ });
  await easySwitch.click();
  await expect(easySwitch).toBeChecked();
  await expectNoPageOverflow(page);

  const menu = page.getByRole('navigation', { name: '주 메뉴', exact: true });
  await menu.getByRole('button', { name: 'AI 비서 하위 메뉴', exact: true }).click();
  await menu.getByRole('link', { name: '이용 안내', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /필요한 복지를/ })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.getByRole('button', { name: '쉬운 화면으로 시작하기', exact: true }).click();
  await expect(page).toHaveURL(/#home$/);
  await expect(easySwitch).toBeChecked();
  await expectNoPageOverflow(page);

  await menu.getByRole('link', { name: '전체 공고', exact: true }).click();
  await expect(page.getByRole('heading', { name: '전체 공고', exact: true })).toBeVisible();
  await expect(easySwitch).toBeChecked();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expectNoPageOverflow(page);
});
