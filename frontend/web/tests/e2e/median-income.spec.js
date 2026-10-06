import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user: null } }));
});

test('legacy retirement preference preserves other saved information and is absent from choices', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'bokji.profile.v2',
      JSON.stringify({
        region: '서울',
        ageBand: '65세 이상',
        occupation: '은퇴 후',
        household: '혼자 살아요',
        interests: ['주거'],
      }),
    ),
  );
  await page.goto('/#profile');
  await expect(page.locator('.profile-page')).not.toContainText('은퇴 후');
  await expect(page.locator('.profile-page')).toContainText('65세 이상');
  await page.getByRole('button', { name: '직업·가구 상세 보기', exact: true }).click();
  await page.getByRole('button', { name: '직업·가구 수정', exact: true }).click();
  const occupation = page.getByRole('combobox', { name: '일·학업 상태 (선택)', exact: true });
  await expect(occupation).toHaveValue('선택하지 않음');
  await expect(occupation.locator('option').filter({ hasText: '은퇴 후' })).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: '함께 사는 사람 (선택)', exact: true }),
  ).toHaveValue('혼자 살아요');
});

test('quick calculator immediately shows official amounts and optional income ratio without finance requests', async ({
  page,
}) => {
  const financeRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/v1/finance/')) financeRequests.push(request.url());
  });
  await page.goto('/#calculator');
  await expect(
    page.getByRole('heading', { name: '중위소득 빠르게 확인', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.median-summary')).toContainText('2,564,238원');
  await expect(page.getByRole('combobox')).toHaveCount(1);
  await expect(page.getByLabel('직업군', { exact: true })).toHaveCount(0);
  await page.getByLabel('가구원 수', { exact: true }).selectOption('4');
  await expect(page.locator('.median-summary')).toContainText('6,494,738원');
  await expect(page.locator('.median-thresholds')).toContainText('3,247,369원');
  const income = page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true });
  await income.fill('300');
  await expect(page.locator('.median-ratio')).toContainText('46.2%');
  await income.fill('0');
  await expect(page.locator('.median-ratio')).toContainText('0%');
  await income.fill('0.00001');
  await expect(page.getByRole('alert')).toContainText('넷째 자리');
  await expect(page.locator('.median-ratio')).toHaveCount(0);
  await income.fill('');
  await expect(page.locator('.median-ratio')).toHaveCount(0);
  await expect(page.locator('.median-summary')).toContainText('6,494,738원');
  await expect(page.getByRole('link', { name: '보건복지부 공식 기준 보기' })).toHaveAttribute(
    'href',
    'https://www.mohw.go.kr/menu.es?mid=a10708010900',
  );
  expect(financeRequests).toEqual([]);
});

test('large-household inputs and easy mode retain values and fit a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/#calculator');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('group');
  await page.getByLabel('실제 가구원 수', { exact: true }).selectOption('manual');
  await page.getByLabel('실제 가구원 수 직접 입력', { exact: true }).fill('13');
  await expect(page.locator('.median-summary')).toContainText('15,270,338원');
  await page.getByLabel('실제 가구원 수 직접 입력', { exact: true }).fill('101');
  await expect(page.getByRole('alert')).toContainText('입력 범위');
  await expect(page.locator('.median-thresholds')).toHaveCount(0);
  await page.getByLabel('실제 가구원 수 직접 입력', { exact: true }).fill('13');
  await page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true }).fill('123.4567');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('실제 가구원 수 직접 입력', { exact: true })).toHaveValue('13');
  await expect(page.locator('.median-ratio')).toContainText('1,234,567원');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('quick and detailed pages keep independent drafts and refresh clears financial inputs', async ({
  page,
}) => {
  await page.goto('/#calculator');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('4');
  await page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true }).fill('234.5678');
  await page.getByRole('link', { name: '상세 정보 입력하기', exact: true }).click();
  await expect(page).toHaveURL(/#calculator-details$/);
  await page.getByRole('button', { name: '처음 계산하기', exact: true }).click();
  await page.getByLabel('거주 지역', { exact: true }).selectOption('seoul');
  await page.getByRole('link', { name: '중위소득 빠르게 확인하기', exact: true }).click();
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue(
    '234.5678',
  );
  await page.getByRole('link', { name: '상세 정보 입력하기', exact: true }).click();
  await expect(page.getByLabel('거주 지역', { exact: true })).toHaveValue('seoul');
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: '중위소득 빠르게 확인', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain('234.5678');
  await page.reload();
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue('');
});
