import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user: null } }));
});

test('guests find verified district services, filter them, and see uncollected areas honestly', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#home');
  await page.getByRole('button', { name: '동네 복지 둘러보기', exact: true }).click();
  await expect(page).toHaveURL(/#local$/);
  await expect(page.getByRole('heading', { level: 1, name: '우리 동네 복지' })).toBeVisible();
  await expect(page.locator('#local-area')).toHaveValue('서울 노원구 월계1동');
  await expect(page.locator('.local-service-card')).toHaveCount(8);
  const input = page.getByLabel('어느 지역을 살펴볼까요?', { exact: true });
  await input.fill('월계동');
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: '중점 지역 · 노원구 월계1동', exact: true }).click();
  await expect(page.locator('.local-service-card')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: '노원행복버스', exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: '노원행복버스 공식 안내 (새 창)', exact: true });
  await expect(link).toHaveAttribute(
    'href',
    'https://www.nowon.kr/www/info/info5/info5_06/info5_06_03.jsp',
  );
  await expect(link).toHaveAttribute('target', '_blank');
  await page.screenshot({ path: info.outputPath('local-services.png'), fullPage: true });
  await page.getByRole('button', { name: '이동·교통', exact: true }).click();
  await expect(page.locator('.local-service-card')).toHaveCount(1);
  await page.getByRole('button', { name: '돌봄·생활', exact: true }).click();
  await expect(page.locator('.local-service-card')).toHaveCount(3);
  await page.getByRole('button', { name: '전체', exact: true }).click();
  await expect(page.locator('.local-service-card')).toHaveCount(8);
  await input.fill('경남 고성군');
  await input.press('Enter');
  await expect(page.locator('.local-service-card')).toHaveCount(0);
  await expect(
    page.getByText('이 지역의 생활서비스를 아직 모으고 있어요', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '지역 관련 공고 찾기', exact: true }).click();
  const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(params.get('q')).toBe('고성군');
  expect(params.get('region')).toBe('경남');
  await page.goBack();
  await expect(page.locator('#local-area')).toHaveValue('경남 고성군');
  await expect(page.locator('.local-service-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('saved addresses select a district without exposing street or unit details and reset on logout', async ({
  page,
}) => {
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: {
          id: 'local-member',
          name: '동네회원',
          region: '서울',
          age: 35,
          address: '서울특별시 노원구 광운로 20',
          address_detail: '101동 202호',
        },
      },
    }),
  );
  await page.route('**/v1/auth/logout', (route) => route.fulfill({ json: { ok: true } }));
  await page.goto('/#local');
  const input = page.getByLabel('어느 지역을 살펴볼까요?', { exact: true });
  await expect(input).toHaveValue('서울 노원구');
  await expect(page.locator('.local-service-card')).toHaveCount(8);
  await input.fill('서울 강남구');
  await input.press('Enter');
  await page.getByRole('button', { name: '내 주소 지역 사용', exact: true }).click();
  await expect(input).toHaveValue('서울 노원구');
  await expect(page.locator('.local-welfare-page')).not.toContainText(
    '서울특별시 노원구 광운로 20',
  );
  await expect(page.locator('.local-welfare-page')).not.toContainText('101동');
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain('광운로');
  expect(storage).not.toContain('202호');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.goto('/#local');
  await expect(input).toHaveValue('서울 노원구 월계1동');
  await expect(page.locator('.local-service-card')).toHaveCount(8);
});

test('narrow and easy layouts retain inputs and filters across languages', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#local');
  await page.getByRole('button', { name: '중점 지역 · 노원구 월계1동', exact: true }).click();
  await page.getByRole('button', { name: '건강', exact: true }).click();
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.locator('#local-area')).toHaveValue('서울 노원구 월계1동');
  for (const locale of ['ko', 'en', 'zh', 'vi', 'ja']) {
    await page.locator('.language-selector select').selectOption(locale);
    await expect(page.locator('.local-service-card')).toHaveCount(2);
    if (locale !== 'ko') {
      await expect(page.locator('.local-hero h1')).not.toContainText(/[가-힣]/);
      await expect(page.locator('.local-categories')).not.toContainText(/[가-힣]/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.locator('.language-selector select').selectOption('ko');
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: info.outputPath('local-easy-mobile.png'), fullPage: true });
});
