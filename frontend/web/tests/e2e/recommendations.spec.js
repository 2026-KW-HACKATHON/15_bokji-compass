import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { defaultProfile } from '../../src/features/profile/profileModel.js';
import { demoPolicies } from '../fixtures/policies.js';

const personalizedResponse = {
  items: [],
  summary: '현재 정보로 안내할 공개 공고가 없어요.',
  mode: 'personalized',
  profile_sufficient: true,
  guidance: '신청 전에 공식 공고를 확인해 주세요.',
  missing_fields: [],
};

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
    route.fulfill({ json: personalizedResponse }),
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
          ? { json: personalizedResponse }
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

test('a visitor without information gets general notices and an explanation below the list', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.removeItem('bokji.profile.v2'));
  let requestedProfile;
  const policy = {
    ...demoPolicies[2],
    title: '누구나 이용하는 문화 활동 안내',
    audience: '전체',
    applicationPeriod: '상시 신청',
    scheduleStatus: 'ongoing',
  };
  await page.route('**/api/v1/recommendations', (route) => {
    requestedProfile = route.request().postDataJSON().profile;
    return route.fulfill({
      json: {
        mode: 'general',
        profile_sufficient: false,
        missing_fields: ['age', 'residence_region'],
        items: [{ policy, reason: '특별한 대상 조건 없이 상시 이용할 수 있는 공고예요.' }],
        summary: '먼저 살펴볼 일반 공고를 골랐어요.',
        guidance: '맞춤 추천 정보가 부족해 일반 공고를 보여드렸어요. 내 정보를 추가해 주세요.',
      },
    });
  });
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/');
  const recommendations = page.getByRole('region', { name: '추천 공고', exact: true });
  await expect(recommendations.getByRole('article')).toHaveCount(1);
  expect(requestedProfile).toEqual({});
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    await expect(recommendations).toContainText('상시 신청');
    await expect(recommendations.locator('.recommendation-guidance')).toContainText(
      '정보가 부족해 일반 공고',
    );
    await expect(
      recommendations.getByRole('button', { name: '내 정보 추가하고 맞춤 추천받기' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '나에게 맞는 복지 공고', exact: true }),
    ).toHaveCount(0);
    await expect(recommendations.getByRole('progressbar')).toHaveCount(0);
    await page.screenshot({
      path: `../../tmp/recommendations-general-${easy ? 'easy' : 'normal'}-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await recommendations.getByRole('button', { name: '내 정보 추가하고 맞춤 추천받기' }).click();
  await expect(page).toHaveURL(/#profile$/);
});

test('saved sparse information still uses fallback copy and shows only supplied source signals', async ({
  page,
}) => {
  const policy = {
    ...demoPolicies[2],
    title: '공공 문화공간 이용 지원',
    applicationPeriod: '상시 신청',
    popularity: {
      views: 12500,
      source: 'gov24',
      basis: 'provider_cumulative_views',
      asOf: '2026-10-07',
    },
    budget: {
      usedPercent: 67.5,
      sourceUrl: 'https://www.gov.kr/notice',
      asOf: '2026-10-07',
      evidence: '공식 안내의 예산 소진률 67.5%',
    },
    budgetNotice: '예산 소진 시 조기 마감',
  };
  await page.route('**/api/v1/recommendations', (route) =>
    route.fulfill({
      json: {
        mode: 'popular',
        profile_sufficient: false,
        missing_fields: ['residence_district'],
        items: [{ policy, reason: '공식 제공처에서 누적 조회수가 높은 일반 공고예요.' }],
        summary: '많이 살펴본 일반 공고',
        guidance: '맞춤 추천 정보가 부족해 공식 제공처 누적 조회수가 높은 공고를 보여드렸어요.',
      },
    }),
  );
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/');
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    const article = page.getByRole('article');
    await expect(article).toContainText('정부24 누적 조회');
    await expect(article).toContainText('12,500회');
    await expect(article).toContainText('67.5%');
    await expect(article).toContainText('예산 소진 시 조기 마감');
    await expect(article.getByRole('link', { name: '공식 근거 확인' })).toHaveAttribute(
      'href',
      policy.budget.sourceUrl,
    );
    await expect(article.getByRole('progressbar')).toHaveAttribute('value', '67.5');
    await page.screenshot({
      path: `../../tmp/recommendations-popular-${easy ? 'easy' : 'normal'}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await expect(
      page.getByRole('button', { name: '추천 정보 더 입력하기', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /내 정보에 맞는 복지 공고를/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('profile required without safe candidates asks for more information in both modes', async ({
  page,
}) => {
  await page.route('**/api/v1/recommendations', (route) =>
    route.fulfill({
      json: {
        mode: 'profile_required',
        profile_sufficient: false,
        items: [],
        summary: '',
        guidance: '현재 정보로 추천할 공고가 없어요. 거주 지역과 연령대를 더 입력해 주세요.',
        missing_fields: ['age', 'residence_region'],
      },
    }),
  );
  await page.goto('/');
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    const recommendations = page.getByRole('region', { name: '추천 공고', exact: true });
    await expect(
      recommendations.getByRole('heading', {
        name: '맞춤 추천에 필요한 정보를 알려주세요',
        exact: true,
      }),
    ).toBeVisible();
    await expect(recommendations.getByRole('article')).toHaveCount(0);
    await expect(recommendations.getByRole('alert')).toHaveCount(0);
    await expect(
      recommendations.getByRole('button', { name: '내 정보 추가하고 맞춤 추천받기' }),
    ).toBeVisible();
  }
});

test('a confirmed personalized match enables the banner and easy title after loading', async ({
  page,
}) => {
  await page.route('**/api/v1/recommendations', (route) =>
    route.fulfill({
      json: {
        ...personalizedResponse,
        items: [
          { policy: demoPolicies[0], reason: '입력한 거주 지역이 공고의 지역 조건과 일치해요.' },
        ],
        summary: '입력한 정보로 신청 조건을 비교했어요.',
      },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '내 정보에 맞는 복지 공고를 추천해 드려요.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '내 정보 수정하기', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '내 정보 추가하고 맞춤 추천받기' })).toHaveCount(0);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(
    page.getByRole('heading', { name: '나에게 맞는 복지 공고', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
});
