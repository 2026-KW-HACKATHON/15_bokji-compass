import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';
import { acceptSignupConsent } from '../fixtures/privacy-consent.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
});

test('policy cards show a short description and keep guarantee limits in the details', async ({
  page,
}) => {
  const policy = {
    ...demoPolicies[0],
    title: '주택금융공사 월세자금보증',
    summary: '월세 자금 대출을 보증해 주거비 부담을 덜어주는 제도입니다.',
    benefit: '보증 한도: 최대 1,152만원 이내. 보증 범위: 대출금액의 80%.',
  };
  await page.route('**/api/v1/policies/' + policy.id, (route) => route.fulfill({ json: policy }));
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [policy], total: 1, nextCursor: null } }),
  );
  await page.goto('/#explore');
  const article = page.getByRole('article');
  await expect(article.locator('.card-summary')).toHaveText(policy.summary);
  await expect(article).not.toContainText('1,152만원');
  await expect(article.locator('.policy-icon')).toHaveCSS('background-color', 'rgb(237, 246, 253)');
  await expect(article.locator('.policy-icon')).toHaveCSS('color', 'rgb(0, 104, 183)');
  await expect(article.locator('.tags button').first()).toHaveCSS('color', 'rgb(0, 104, 183)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await article.getByRole('button', { name: policy.title + ' 자세히 보기', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.detail-highlight')).toContainText(policy.benefit);
});
test('notice summary and payment schedule stay separate from application dates in both modes', async ({
  page,
}) => {
  const policy = {
    ...demoPolicies[0],
    summary: '장학생 선발; 장학금 12월 초 지급 예정.',
    benefit: '장학금 차등 지급.',
    applicationPeriod: '2026년 10월 1일 ~ 10월 31일',
    paymentSchedule: '2026년 12월 초 지급 예정',
  };
  await page.route('**/api/v1/policies/' + policy.id, (route) => route.fulfill({ json: policy }));
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({
      json: { items: [policy], total: 1, nextCursor: null },
    }),
  );
  await page.goto('/#explore');
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    const article = page.getByRole('article');
    await expect(article.locator('.card-summary')).toHaveText(policy.summary);
    await expect(article).toContainText(policy.paymentSchedule);
    await article.getByRole('button', { name: policy.title + ' 자세히 보기', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const application = dialog
      .locator('.policy-detail > div')
      .filter({ has: page.locator('dt', { hasText: '신청 기간' }) });
    const payment = dialog
      .locator('.policy-detail > div')
      .filter({ has: page.locator('dt', { hasText: '지급 시기' }) });
    await expect(application).toBeVisible();
    await expect(application.locator('dd')).toHaveText(policy.applicationPeriod);
    await expect(payment).toBeVisible();
    await expect(payment.locator('dd')).toHaveText(policy.paymentSchedule);
    await expect(dialog).not.toContainText('예정이다');
    await page.keyboard.press('Escape');
  }
});
test('tag search, detail, saved persistence and browser history', async ({ page }) => {
  await page.goto('/#explore');
  await expect(page.getByRole('article')).toHaveCount(6);
  const tag = page.getByRole('button', { name: /태그로 공고 찾기/ }).first();
  await tag.click();
  await expect(page.getByRole('button', { name: '태그 필터 해제' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('article')).toHaveCount(6);
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('청년 독립');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: '청년의 첫 독립, 주거비 지원', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: '닫기', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '이 공고 저장하기', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.goto('/#saved');
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
});
test('search with region and audience filters resets pagination and clearing restores all notices', async ({
  page,
}) => {
  await page.goto('/#explore');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '공고 페이지' })).toContainText('4–6 / 6개');
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('지원');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.locator('.filter-panel > summary').click();
  await page.getByRole('combobox', { name: '지역', exact: true }).selectOption('경기');
  const response = page.waitForResponse((value) => {
    const url = new URL(value.url());
    return (
      url.pathname.endsWith('/v1/policies') &&
      url.searchParams.get('q') === '지원' &&
      url.searchParams.get('region') === '경기' &&
      url.searchParams.get('audience') === '가족'
    );
  });
  await page.getByRole('combobox', { name: '대상', exact: true }).selectOption('가족');
  const params = new URL((await response).url()).searchParams;
  expect(params.has('cursor')).toBe(false);
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.locator('.results-heading')).toContainText('총 2개');
  await expect(
    page.getByRole('heading', {
      name: '든든한 일상을 위한 생활 지원',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: '청년의 첫 독립, 주거비 지원',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '검색 조건 지우기', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.locator('.results-heading')).toContainText('총 6개');
  await expect(page.getByRole('textbox', { name: '공고 검색', exact: true })).toHaveValue('');
});
test('easy profile categories save independently and opted-in recommendations survive reload', async ({
  page,
}) => {
  await page.goto('/#profile');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('tabpanel', { name: '전체 요약' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByRole('tab', { name: '기본 정보', exact: true }).click();
  await page.getByRole('button', { name: '기본 정보 추가', exact: true }).click();
  await page.getByRole('combobox', { name: '거주 지역' }).selectOption('서울');
  await page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' }).check();
  await page.getByRole('button', { name: '정보 저장', exact: true }).click();
  await expect(page).toHaveURL(/#profile$/);
  await page.getByRole('tab', { name: '관심 분야', exact: true }).click();
  await page.getByRole('button', { name: '관심 분야 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '주거', exact: true }).check();
  await page.getByRole('button', { name: '정보 저장', exact: true }).click();
  await page.getByRole('link', { name: '홈', exact: true }).first().click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByText('추천 이유', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('navigation', { name: '추천 공고 넘기기' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});

test('category switches and easy mode preserve unfinished profile inputs and storage choice', async ({
  page,
}) => {
  await page.goto('/#profile');
  await page.getByRole('tab', { name: '기본 정보', exact: true }).click();
  await page.getByRole('button', { name: '기본 정보 추가', exact: true }).click();
  await page.getByRole('combobox', { name: '거주 지역' }).selectOption('서울');
  await page
    .getByRole('combobox', { name: '연령대 (선택)', exact: true })
    .selectOption('65세 이상');
  await page.getByRole('tab', { name: '직업·가구', exact: true }).click();
  await page.getByRole('button', { name: '직업·가구 추가', exact: true }).click();
  await page
    .getByRole('combobox', { name: '일·학업 상태 (선택)', exact: true })
    .selectOption('기타');
  await page
    .getByRole('combobox', { name: '함께 사는 사람 (선택)', exact: true })
    .selectOption('혼자 살아요');
  await page.getByRole('tab', { name: '관심 분야', exact: true }).click();
  await page.getByRole('button', { name: '관심 분야 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '건강·돌봄', exact: true }).check();
  await page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' }).check();

  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('checkbox', { name: '건강·돌봄', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' })).toBeChecked();
  await page.getByRole('tab', { name: '기본 정보', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '거주 지역' })).toHaveValue('서울');
  await expect(page.getByRole('combobox', { name: '연령대 (선택)', exact: true })).toHaveValue(
    '65세 이상',
  );
  await expect(page.getByRole('combobox')).toHaveCount(2);
  await page.getByRole('tab', { name: '직업·가구', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: '일·학업 상태 (선택)', exact: true }),
  ).toHaveValue('기타');
  await expect(
    page.getByRole('combobox', { name: '함께 사는 사람 (선택)', exact: true }),
  ).toHaveValue('혼자 살아요');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(
    page.getByRole('combobox', { name: '일·학업 상태 (선택)', exact: true }),
  ).toHaveValue('기타');
  await page.getByRole('tab', { name: '관심 분야', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '건강·돌봄', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' })).toBeChecked();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toHaveCount(0);
});
test('switching easy mode preserves search text, applied filters and tag', async ({ page }) => {
  await page.goto('/#explore?tag=' + encodeURIComponent('청년'));
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('지원');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('button', { name: '주거', exact: true }).click();
  await page.getByRole('combobox', { name: '지역', exact: true }).selectOption('서울');
  await page.getByRole('combobox', { name: '대상', exact: true }).selectOption('청년');
  await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('name');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('textbox', { name: '공고 검색', exact: true }).fill('아직 검색하지 않은 글');

  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('textbox', { name: '공고 검색', exact: true })).toHaveValue(
    '아직 검색하지 않은 글',
  );
  await expect(page.getByRole('button', { name: '태그 필터 해제' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: '청년의 첫 독립, 주거비 지원', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.filter-panel > summary')).toContainText(
    '주거 · 서울 · 청년 · 이름순',
  );
  await page.locator('.filter-panel > summary').click();
  await expect(page.getByRole('combobox', { name: '분야', exact: true })).toHaveValue('주거');
  await expect(page.getByRole('combobox', { name: '지역', exact: true })).toHaveValue('서울');
  await expect(page.getByRole('combobox', { name: '대상', exact: true })).toHaveValue('청년');
  await expect(page.getByRole('combobox', { name: '정렬', exact: true })).toHaveValue('name');

  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('textbox', { name: '공고 검색', exact: true })).toHaveValue(
    '아직 검색하지 않은 글',
  );
  await expect(page.getByRole('combobox', { name: '정렬', exact: true })).toHaveValue('name');
  await expect(page.getByRole('button', { name: '주거', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page).toHaveURL(/#explore\?tag=/);
});

test('easy policy list offers one action per notice while preserving filters, details and saving', async ({
  page,
}) => {
  await page.goto('/#explore');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  const articles = page.getByRole('article');
  await expect(articles).toHaveCount(3);
  for (const article of await articles.all()) {
    await expect(article.getByRole('heading', { level: 3 })).toBeVisible();
    await expect(article.locator('.card-summary')).toBeVisible();
    await expect(article.locator('.benefit')).toBeVisible();
    await expect(article.getByText('지원 대상', { exact: true })).toBeVisible();
    await expect(article.getByText('신청 기간', { exact: true })).toBeVisible();
    await expect(article.getByText('공식 공고에서 확인', { exact: true })).toBeVisible();
    await expect(article.getByRole('button')).toHaveCount(1);
    await expect(article.getByRole('button', { name: /자세히 보기$/ })).toBeVisible();
  }
  const pagination = page.getByRole('navigation', { name: '공고 페이지', exact: true });
  await expect(pagination).toContainText('1–3 / 6개');
  await expect(pagination.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
  await pagination.getByRole('button', { name: '다음 페이지' }).click();
  await expect(pagination).toContainText('4–6 / 6개');
  await expect(page.getByRole('heading', { name: '공고 목록', exact: true })).toBeFocused();
  await expect(pagination.getByRole('button', { name: '다음 페이지' })).toBeDisabled();

  const filterSummary = page.locator('.filter-panel > summary');
  await filterSummary.click();
  await page.getByRole('combobox', { name: '분야', exact: true }).selectOption('건강·돌봄');
  await page.getByRole('combobox', { name: '대상', exact: true }).selectOption('어르신');
  await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('name');
  await expect(articles).toHaveCount(1);
  await expect(pagination).toHaveCount(0);
  await filterSummary.click();
  await expect(filterSummary).toContainText('건강·돌봄 · 전국 · 어르신 · 이름순');
  await articles.getByRole('button', { name: /자세히 보기$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('지원 대상', { exact: true })).toBeVisible();
  await expect(dialog.getByText('신청 기간', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '이 공고 저장하기', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(articles.getByRole('button', { name: /자세히 보기$/ })).toBeFocused();
  await page.goto('/#saved');
  await expect(articles).toHaveCount(1);
  await expect(
    articles.getByRole('heading', { name: '가까이에서 함께하는 돌봄 서비스' }),
  ).toBeVisible();
  await articles.getByRole('button', { name: /자세히 보기$/ }).click();
  await dialog.locator('.detail-related > summary').click();
  await dialog.getByRole('button', { name: '#어르신 태그로 공고 찾기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '태그 필터 해제' })).toBeVisible();
  await expect(articles).toHaveCount(1);
});

test('removing the last saved notice from a second easy page keeps all remaining notices reachable', async ({
  page,
}) => {
  await page.goto('/#explore');
  const articles = page.getByRole('article');
  await expect(articles).toHaveCount(6);
  const savedTitles = [];
  for (let index = 0; index < 4; index += 1) {
    const article = articles.nth(index);
    const title = await article.getByRole('heading', { level: 3 }).innerText();
    savedTitles.push(title);
    await article.getByRole('button', { name: title + ' 저장', exact: true }).click();
  }

  await page.goto('/#saved');
  await expect(articles).toHaveCount(4);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(articles).toHaveCount(3);
  const pagination = page.getByRole('navigation', { name: '저장 공고 넘기기', exact: true });
  await pagination.getByRole('button', { name: '다음 목록', exact: true }).click();
  await expect(articles).toHaveCount(1);
  await expect(articles.getByRole('heading', { level: 3 })).toHaveText(savedTitles[3]);
  await articles.getByRole('button', { name: /자세히 보기$/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '저장 취소하기', exact: true })
    .click();
  await page.keyboard.press('Escape');

  await expect(articles).toHaveCount(3);
  await expect(articles.getByRole('heading', { level: 3 })).toHaveText(savedTitles.slice(0, 3));
  await expect(pagination).toHaveCount(0);
  await articles
    .first()
    .getByRole('button', { name: /자세히 보기$/ })
    .click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText(
    savedTitles[0],
  );
});
test('auth pages offer username login, phone-free signup and Kakao availability', async ({
  page,
}) => {
  await page.goto('/#login');
  await expect(page.getByRole('textbox', { name: '아이디' })).toBeVisible();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
  await page
    .getByRole('navigation', { name: '계정 메뉴', exact: true })
    .getByRole('link', { name: '회원가입', exact: true })
    .click();
  await acceptSignupConsent(page);
  await expect(page.getByRole('button', { name: '아이디로 회원가입' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '카카오톡으로 로그인/회원가입하기' }),
  ).toBeDisabled();
  await expect(page.getByLabel('비밀번호 확인', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '아이디로 회원가입' }).click();
  await expect(page.getByLabel('전화번호', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('아이디', { exact: true })).toBeVisible();
});
test('narrow viewport supports easy mode and policy dialog', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#explore');
  await page.getByRole('switch').click();
  await expect(page.getByRole('article')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('button', { name: /자세히 보기/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});
test('API mode shows failure and retry without a demo fallback', async ({ page }) => {
  await page.route('**/app-config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.__BOKJI_CONFIG__ = {dataMode:"api"};',
    }),
  );
  await page.route('**/api/v1/policies?**', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/#explore');
  await expect(page.getByRole('alert')).toContainText('공고를 불러오지 못했어요');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.getByRole('button', { name: '다시 시도하기' }).click();
  await expect(page.getByText('조건에 맞는 공고가 없어요')).toBeVisible();
});
