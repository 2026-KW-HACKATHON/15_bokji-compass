import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { defaultProfile } from '../../src/features/profile/profileModel.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: null } }));
  await page.addInitScript(
    (profile) => {
      localStorage.setItem('bokji.profile.v2', JSON.stringify(profile));
    },
    { ...defaultProfile, region: '서울', ageBand: '19~34세' },
  );
});

test('empty recommendations offer honest email availability and browsing in both modes', async ({
  page,
}) => {
  await page.route('**/api/v1/recommendations', (route) =>
    route.fulfill({ json: { items: [], summary: '현재 정보로 안내할 공개 공고가 없어요.' } }),
  );
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/');
  const recommendations = page.getByRole('region', { name: '추천 공고', exact: true });
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    await expect(
      recommendations.getByRole('heading', { name: '현재 내 정보에 맞는 추천 공고가 없어요' }),
    ).toBeVisible();
    await expect(
      recommendations.getByRole('button', { name: '새 공고 메일로 받기 · 준비 중' }),
    ).toBeDisabled();
    await expect(recommendations).toContainText('아직 알림 신청은 할 수 없어요.');
    await expect(recommendations.getByRole('alert')).toHaveCount(0);
    await expect(recommendations.getByRole('button', { name: '다시 시도하기' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await recommendations.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `../../tmp/recommendations-empty-${easy ? 'easy' : 'normal'}-${test.info().project.name}.png`,
      fullPage: true,
    });
  }
  await recommendations.getByRole('button', { name: '전체 공고 보기', exact: true }).click();
  await expect(page).toHaveURL(/#explore$/);
  await expect(page.getByRole('article')).toHaveCount(3);
});

for (const [status, title] of [
  [404, '추천 정보를 잠시 확인할 수 없어요'],
  [503, '추천 정보를 잠시 확인할 수 없어요'],
  [429, '추천 요청이 많아 잠시 기다려 주세요'],
]) {
  test(`${status} is a service failure and retry can recover to an empty result`, async ({
    page,
  }) => {
    let recovered = false;
    await page.route('**/api/v1/recommendations', (route) =>
      route.fulfill(
        recovered
          ? { json: { items: [], summary: '현재 추천할 공고가 없어요.' } }
          : { status, json: { detail: 'private internal server failure' } },
      ),
    );
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText(title);
    await expect(page.getByText('현재 내 정보에 맞는 추천 공고가 없어요')).toHaveCount(0);
    await expect(page.getByText('새 공고 메일로 받기 · 준비 중')).toHaveCount(0);
    await expect(page.getByRole('alert')).not.toContainText('private');
    await expect(page.getByRole('alert')).not.toContainText('연결이 끝나면');
    if (status === 503) {
      await page.getByRole('region', { name: '추천 공고', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `../../tmp/recommendations-error-${test.info().project.name}.png`,
        fullPage: true,
      });
    }
    recovered = true;
    await page.getByRole('button', { name: '다시 시도하기', exact: true }).click();
    await expect(page.getByText('현재 내 정보에 맞는 추천 공고가 없어요')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('login and input errors offer the matching action instead of a service outage', async ({
  page,
}) => {
  await page.route('**/api/v1/recommendations', (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('로그인 상태를 다시 확인해 주세요');
  await page.getByRole('alert').getByRole('button', { name: '로그인하기', exact: true }).click();
  await expect(page).toHaveURL(/#login$/);
  await page.route('**/api/v1/recommendations', (route) =>
    route.fulfill({ status: 422, json: {} }),
  );
  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('추천에 쓰는 정보를 확인해 주세요');
  await page
    .getByRole('alert')
    .getByRole('button', { name: '내 정보 수정하기', exact: true })
    .click();
  await expect(page).toHaveURL(/#profile$/);
});
