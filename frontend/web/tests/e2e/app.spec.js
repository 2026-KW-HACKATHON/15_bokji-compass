import { test, expect } from '@playwright/test';
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
test('easy mode keeps the profile in one form and recommendations together, opt-in survives reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await page.getByRole('button', { name: '맞춤 공고 찾기', exact: true }).click();
  await expect(page.getByRole('combobox')).toHaveCount(4);
  await expect(page.getByRole('region', { name: '지역과 연령', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '생활 정보', exact: true })).toBeVisible();
  await expect(page.locator('.profile-form').getByRole('button')).toHaveCount(1);
  await page.getByRole('combobox', { name: '거주 지역' }).selectOption('서울');
  await page.getByRole('checkbox', { name: '주거', exact: true }).check();
  await page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' }).check();
  await page.getByRole('button', { name: '내 정보로 추천받기' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByText('추천 이유', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('navigation', { name: '추천 공고 넘기기' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});
test('switching easy mode preserves an unfinished profile and storage choice', async ({ page }) => {
  await page.goto('/#profile');
  await page.getByRole('combobox', { name: '거주 지역' }).selectOption('서울');
  await page
    .getByRole('combobox', { name: '연령대 (선택)', exact: true })
    .selectOption('65세 이상');
  await page
    .getByRole('combobox', { name: '일·학업 상태 (선택)', exact: true })
    .selectOption('은퇴 후');
  await page
    .getByRole('combobox', { name: '함께 사는 사람 (선택)', exact: true })
    .selectOption('혼자 살아요');
  await page.getByRole('checkbox', { name: '건강·돌봄', exact: true }).check();
  await page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' }).check();

  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('combobox', { name: '거주 지역' })).toHaveValue('서울');
  await expect(page.getByRole('combobox', { name: '연령대 (선택)', exact: true })).toHaveValue(
    '65세 이상',
  );
  await expect(
    page.getByRole('combobox', { name: '일·학업 상태 (선택)', exact: true }),
  ).toHaveValue('은퇴 후');
  await expect(
    page.getByRole('combobox', { name: '함께 사는 사람 (선택)', exact: true }),
  ).toHaveValue('혼자 살아요');
  await expect(page.getByRole('checkbox', { name: '건강·돌봄', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' })).toBeChecked();
  await expect(page.getByRole('combobox')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '다음', exact: true })).toHaveCount(0);

  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('combobox', { name: '거주 지역' })).toHaveValue('서울');
  await expect(
    page.getByRole('combobox', { name: '일·학업 상태 (선택)', exact: true }),
  ).toHaveValue('은퇴 후');
  await expect(page.getByRole('checkbox', { name: '건강·돌봄', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' })).toBeChecked();
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
test('auth pages offer username login and phone-verified signup', async ({ page }) => {
  await page.goto('/#login');
  await expect(page.getByRole('textbox', { name: '아이디' })).toBeVisible();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
  await page.getByRole('main').getByRole('link', { name: '회원가입', exact: true }).click();
  await expect(page.getByLabel('비밀번호 확인', { exact: true })).toBeVisible();
  await expect(page.getByLabel('나이 (만 나이)')).toBeVisible();
  await expect(page.getByLabel('전화번호', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeDisabled();
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
