import { test, expect } from '@playwright/test';

test('search, region filters, empty state, detail and saved persistence', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('나에게 필요한 혜택');
  await expect(page.getByRole('article')).toHaveCount(6);
  await page.getByRole('textbox', { name: '혜택 검색' }).fill('없는검색어');
  await expect(page.getByText('검색 조건에 맞는 혜택이 없어요')).toBeVisible();
  await page.getByRole('button', { name: '검색 조건 초기화' }).click();
  await page.getByRole('combobox', { name: '지역', exact: true }).selectOption('서울');
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await page.getByRole('textbox', { name: '혜택 검색' }).fill('청년 독립');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: '청년의 첫 독립, 주거비 지원', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '관심 혜택에 저장하기', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#saved');
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: '청년의 첫 독립, 주거비 지원 저장 취소' }).click();
  await expect(page.getByText('아직 저장한 혜택이 없어요')).toBeVisible();
  expect(errors).toEqual([]);
});

test('profile settings persist, apply filters, and survive invalid storage', async ({ page }) => {
  await page.goto('/#profile');
  await page.getByRole('combobox', { name: '관심 지역' }).selectOption('서울');
  await page.getByRole('checkbox', { name: '주거', exact: true }).check();
  await page.getByRole('button', { name: '설정 저장하기' }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: '관심 지역' })).toHaveValue('서울');
  await expect(page.getByRole('checkbox', { name: '주거', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '내 설정으로 둘러보기' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.evaluate(() => localStorage.setItem('bokji.profile.v1', '{bad'));
  await page.goto('/#profile');
  await page.reload();
  await expect(page.getByRole('combobox', { name: '관심 지역' })).toHaveValue('전국');
});

test('layout and dialog fit viewport, keyboard access, browser history', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-home.png`, fullPage: true });
  await page.getByRole('button', { name: '내 관심사 설정하기' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '내 관심사 설정하기' })).toBeFocused();
  const navigation = page.getByRole('navigation', {
    name: testInfo.project.name === 'mobile' ? '모바일 탐색' : '주 탐색',
    exact: true,
  });
  await navigation.getByRole('link', { name: '관심 혜택' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('관심 가는 혜택을 한곳에');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('나에게 필요한 혜택');
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await fits()).toBe(true);
  }
});

test('health failure does not break demo and success is distinct from policy readiness', async ({
  page,
}) => {
  await page.route('**/api/health', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await page.getByRole('button', { name: '서비스 안내', exact: true }).click();
  await page.getByRole('button', { name: '서버 연결 확인', exact: true }).click();
  await expect(page.getByText('서버에 연결하지 못했어요.', { exact: false })).toBeVisible();
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', service: 'bokji-compass-backend' } }),
  );
  await page.getByRole('button', { name: '서버 연결 확인', exact: true }).click();
  await expect(page.getByText('서버 응답을 확인했어요.', { exact: false })).toBeVisible();
});
