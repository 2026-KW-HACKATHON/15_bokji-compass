import { test, expect } from '@playwright/test';

const storedProfile = () => ({
  schema_version: 1,
  reference_year: 2026,
  household_size: 1,
  region: 'seoul',
  household_scope_confirmed: false,
  minor_children: 0,
  recipient_status: 'unknown',
  members: [
    {
      age: 65,
      earned_income: 0,
      earned_income_basis: 'unknown',
      business_income: 0,
      business_income_basis: 'unknown',
      other_income: 0,
      private_transfer_income: 0,
      deduction: 'ordinary',
    },
  ],
  assets: { housing: 0, rental_deposit: 10000000, general: 0, financial: 0 },
  debts: { bank: 0, public: 0, other: 0 },
  vehicle_status: 'none',
  vehicles: [],
  additional_review: false,
});
const calculation = () => ({
  reference_year: 2026,
  rules_version: 'test-2026',
  median: {
    base: 2564238,
    monthly_income: 123456,
    ratio_percent: 4.8,
    thresholds: [{ percent: 50, amount: 1282119 }],
  },
  assets: {
    gross_total: 10000000,
    net_total: 10000000,
    without_vehicles: 10000000,
    vehicle_total: 0,
    debt_total: 0,
  },
  assessments: [
    {
      rule_id: 'test-rule',
      label: '사업별 계산 결과',
      status: 'needs_review',
      checks: [{ label: '소득인정액', value: null, limit: 820556, state: 'unknown' }],
      missing: ['보장가구 범위 확인'],
      notes: ['자격 확정이 아닙니다.'],
      breakdown: [],
    },
  ],
  sources: [{ title: '공식 기준 자료', url: 'https://www.mohw.go.kr/' }],
  notes: ['입력값에 따른 추정입니다.'],
});

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user: null } }));
});

async function start(page) {
  await page.goto('/#calculator-details');
  await page.getByRole('button', { name: '처음 계산하기', exact: true }).click();
}
async function next(page) {
  const title = page.locator('.finance-screen-title');
  const previous = await title.textContent();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(title).not.toHaveText(previous);
}
async function advanceTo(page, title) {
  for (let i = 0; i < 60; i++) {
    const screenTitle = await page.locator('.finance-screen-title').textContent();
    const displayedQuestions = await page
      .locator('.finance-question')
      .evaluateAll((questions) =>
        questions.map((question) => question.getAttribute('aria-label') ?? ''),
      );
    if (
      screenTitle.includes(title) ||
      displayedQuestions.some((question) => question.includes(title))
    )
      return;
    await next(page);
  }
  throw new Error(`Question not reached: ${title}`);
}
async function review(page) {
  await advanceTo(page, '보유하거나 빌려 쓰는 차량');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '계산하기', exact: true })).toBeVisible();
}
async function moneyState(page, label, state) {
  const select = page.getByRole('combobox', { name: `${label} 입력 상태`, exact: true });
  if (await select.isVisible()) {
    await select.selectOption(state);
  } else {
    await page
      .getByRole('group', { name: `${label} 여부`, exact: true })
      .getByRole('button', {
        name: { yes: '있어요', none: '없어요', unknown: '모르겠어요' }[state],
        exact: true,
      })
      .click();
  }
}
async function expectMoneyState(page, label, state) {
  const select = page.getByRole('combobox', { name: `${label} 입력 상태`, exact: true });
  if (await select.isVisible()) {
    await expect(select).toHaveValue(state);
  } else {
    await expect(
      page.getByRole('group', { name: `${label} 여부`, exact: true }).getByRole('button', {
        name: { yes: '있어요', none: '없어요', unknown: '모르겠어요' }[state],
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  }
}
async function money(page, label, value) {
  await moneyState(page, label, 'yes');
  await page.getByLabel(label, { exact: true }).fill(value);
}
async function calculateAndExpect(page) {
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.locator('.finance-result')).toBeVisible();
}

test('household choices explain unified region, optional checks and actual large household counts', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: calculation() });
  });
  await start(page);
  await page.getByLabel('거주 지역', { exact: true }).selectOption('jeonnam_gwangju');
  await expect(page.locator('#finance-region-hint')).toContainText('실제 거주 권역');
  const subregion = page.getByLabel('전남광주통합특별시 거주 권역', { exact: true });
  await expect(subregion.locator('option')).toHaveText([
    '선택해 주세요',
    '광주광역시',
    '그 외 지역',
  ]);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('전남광주통합특별시 거주 권역');
  await subregion.selectOption('gwangju');
  await expect(page.getByText('(선택)', { exact: true })).toHaveCount(2);
  await expect(page.locator('#finance-region-hint')).toContainText(
    '통합 지역의 재산 공제 기준은 아직 계산에 반영되지 않아요.',
  );
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByRole('checkbox').nth(0)).not.toBeChecked();
  await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked();
  await expect(page.getByRole('checkbox').nth(1)).toHaveAccessibleName(
    /추가로 적용받을 수 있는 혜택/,
  );
  await page.getByLabel('가구원 수', { exact: true }).selectOption('group');
  await page.getByLabel('실제 가구원 수', { exact: true }).selectOption('manual');
  const count = page.getByLabel('실제 가구원 수 직접 입력', { exact: true });
  await count.fill('');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(count).toBeFocused();
  await expect(page.getByRole('alert')).toBeVisible();
  await count.fill('13');
  await next(page);
  await expect(page.getByLabel('만 나이', { exact: true })).toHaveCount(13);
  await page.getByLabel('만 나이', { exact: true }).nth(12).fill('47');
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(count).toHaveValue('13');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(count).toHaveValue('13');
  await expect(page.getByLabel('거주 지역', { exact: true })).toHaveValue('jeonnam_gwangju');
  await expect(subregion).toHaveValue('gwangju');
  await next(page);
  await expect(page.getByLabel('만 나이', { exact: true }).nth(12)).toHaveValue('47');
  await review(page);
  await expect(
    page
      .locator('.finance-review dt')
      .filter({ hasText: /^가구원 수$/ })
      .locator('..')
      .locator('dd'),
  ).toHaveText('13명');
  await calculateAndExpect(page);
  expect(submitted.profile.household_size).toBe(13);
  expect(submitted.profile.members).toHaveLength(13);
});

test('results group missing information once and keep one footer notice in both display modes', async ({
  page,
}) => {
  const result = calculation();
  result.assessments.push({
    ...result.assessments[0],
    rule_id: 'second-test-rule',
    label: '다른 사업 계산 결과',
  });
  await page.route('**/v1/finance/calculate', (route) => route.fulfill({ json: result }));
  await start(page);
  const easySwitch = page.getByRole('switch', { name: /쉬운 화면/ });
  if (await easySwitch.isChecked()) await easySwitch.click();
  await review(page);
  await calculateAndExpect(page);

  const assessments = page.locator('.finance-assessment');
  await expect(assessments).toHaveCount(2);
  await expect(assessments.locator('.finance-missing')).toHaveCount(0);
  await expect(assessments.getByText('보장가구 범위 확인', { exact: true })).toHaveCount(0);
  const unknownChecks = assessments.locator('.finance-check-state.unknown');
  await expect(unknownChecks).toHaveText(['확인 필요', '확인 필요']);
  await expect(unknownChecks.nth(0)).toBeVisible();
  await expect(unknownChecks.nth(1)).toBeVisible();

  const incomplete = page.locator('details.finance-incomplete');
  await expect(incomplete).toHaveCount(1);
  await expect(incomplete.locator('summary')).toHaveText('계산에 반영하지 못한 정보');
  await expect(incomplete).toHaveJSProperty('open', false);
  const missingInformation = incomplete.getByText('보장가구 범위 확인', { exact: true });
  await expect(missingInformation).not.toBeVisible();
  await incomplete.locator('summary').click();
  await expect(missingInformation).toHaveCount(1);
  await expect(missingInformation).toBeVisible();
  await expect(incomplete.locator('li')).toHaveCount(1);
  await expect(page.locator('.finance-disclaimer')).toHaveCount(0);

  const disclaimerText =
    'AI는 실수할 수 있습니다. 안내·계산은 참고용이며, 실제 지원 여부와 금액은 심사 결과에 따릅니다.';
  const footerNotice = page.locator('.page-footer').getByText(disclaimerText, { exact: true });
  await expect(page.getByText(disclaimerText, { exact: true })).toHaveCount(1);
  await expect(footerNotice).toBeVisible();
  if (page.viewportSize().width >= 1200) {
    expect(
      await footerNotice.evaluate((notice) => {
        const textRange = document.createRange();
        textRange.selectNodeContents(notice);
        return textRange.getClientRects().length;
      }),
    ).toBe(1);
  }
  await easySwitch.click();
  await expect(easySwitch).toBeChecked();
  await expect(page.getByText(disclaimerText, { exact: true })).toHaveCount(1);
  await expect(footerNotice).toBeVisible();
  if (page.viewportSize().width >= 1200) {
    expect(
      await footerNotice.evaluate((notice) => {
        const textRange = document.createRange();
        textRange.selectNodeContents(notice);
        return textRange.getClientRects().length;
      }),
    ).toBe(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(unknownChecks).toHaveText(['확인 필요', '확인 필요']);
  await expect(incomplete.locator('li')).toHaveCount(1);
});

test('approximation requires opt-in and is visibly labeled in results', async ({ page }) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    const result = calculation();
    result.approximations = ['전남광주통합특별시에 그 밖의 지역 기준을 임시 적용했어요.'];
    return route.fulfill({ json: result });
  });
  await start(page);
  await review(page);
  const option = page.getByRole('checkbox', { name: '미지원 기준을 임시 대체해 근사 계산' });
  await expect(option).not.toBeChecked();
  await option.check();
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.locator('.finance-approximation-notice')).toContainText('근사 계산 참고값');
  await expect(page.locator('.finance-approximation-notice')).toContainText(
    '그 밖의 지역 기준을 임시 적용',
  );
  expect(submitted.allow_approximation).toBe(true);
});

test('loading a large household shows the actual count in review and editing', async ({ page }) => {
  const profile = storedProfile();
  profile.household_size = 100;
  profile.members = Array.from({ length: 100 }, () => ({ ...profile.members[0] }));
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({
      json: { user: { id: 'large-household', username: 'large_household', name: '가구회원' } },
    }),
  );
  await page.route('**/v1/finance/profile', (route) =>
    route.fulfill({
      json: { profile, calculation: calculation(), updated_at: '2026-10-06T00:00:00Z' },
    }),
  );
  await page.goto('/#calculator-details');
  await page
    .getByRole('button', { name: '저장한 정보 불러오기', exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page
      .locator('.finance-review dt')
      .filter({ hasText: /^가구원 수$/ })
      .locator('..')
      .locator('dd'),
  ).toHaveText('100명');
  await page.getByRole('button', { name: '가구 정보 수정', exact: true }).click();
  await expect(page.getByLabel('실제 가구원 수 직접 입력', { exact: true })).toHaveValue('100');
});

test('income marked as present requires an amount before continuing', async ({ page }) => {
  await start(page);
  await advanceTo(page, '월급이 있나요');
  await moneyState(page, '근로소득 (월·세전 기준)', 'yes');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('입력하거나 없음·모름을 선택');
  await expect(page.locator('.finance-screen-title')).toHaveText('소득 정보');
  await page.getByLabel('근로소득 (월·세전 기준)', { exact: true }).fill('200');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('양수 소득의 입력 기준을 선택해 주세요');
  await page.getByLabel('입력한 근로소득의 기준', { exact: true }).selectOption('gross');
  await next(page);
  await expect(page.locator('.finance-screen-title')).toHaveText('재산 정보');
});

test('entry stays in six stages with multiple household members and vehicles', async ({ page }) => {
  await start(page);
  const title = page.locator('.finance-screen-title');
  const stages = page.getByRole('list', { name: '계산 단계' }).locator('li');
  await expect(stages).toHaveCount(6);
  await expect(title).toHaveText('가구 정보');
  await expect(stages.nth(0)).toHaveAttribute('aria-current', 'step');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('2');
  await expect(page.getByLabel('18세 미만 자녀 수', { exact: true })).toBeVisible();
  await next(page);
  await expect(title).toHaveText('소득 정보');
  await expect(stages.nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByLabel('만 나이', { exact: true })).toHaveCount(2);
  await page.getByLabel('만 나이', { exact: true }).nth(1).fill('47');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(title).toHaveText('소득 정보');
  await expect(page.getByLabel('만 나이', { exact: true }).nth(1)).toHaveValue('47');
  await next(page);
  await expect(title).toHaveText('재산 정보');
  await expect(stages.nth(2)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByLabel('금융재산 입력 상태', { exact: true })).toBeVisible();
  await next(page);
  await expect(title).toHaveText('부채 정보');
  await expect(stages.nth(3)).toHaveAttribute('aria-current', 'step');
  await next(page);
  await expect(title).toHaveText('차량 정보');
  await expect(stages.nth(4)).toHaveAttribute('aria-current', 'step');
  await page.getByLabel('차량 보유 여부', { exact: true }).selectOption('owned');
  await page.getByRole('button', { name: '차량 추가', exact: true }).click();
  await expect(page.getByLabel('차량 명의·계약 형태', { exact: true })).toHaveCount(2);
  await page.getByLabel('차량 사용 연수', { exact: true }).nth(1).fill('-1');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await expect(title).toHaveText('차량 정보');
  await expect(page.getByLabel('차량 사용 연수', { exact: true }).nth(1)).toBeFocused();
  await page.getByLabel('차량 사용 연수', { exact: true }).nth(1).fill('5');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await expect(stages.nth(5)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: '계산하기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await expect(title).toHaveText('차량 정보');
  await expect(page.getByLabel('차량 사용 연수', { exact: true }).nth(1)).toHaveValue('5');
});

test('guided entry distinguishes zero and unknown, reviews and edits at 320px', async ({
  page,
}, testInfo) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: calculation() });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await start(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('group', { name: '근로소득 (월·세전 기준) 여부', exact: true }),
  ).toHaveCount(0);
  await advanceTo(page, '월급이 있나요');
  await moneyState(page, '근로소득 (월·세전 기준)', 'none');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expectMoneyState(page, '근로소득 (월·세전 기준)', 'none');
  await expectMoneyState(page, '사업소득 (월·경비 차감 후)', 'unknown');
  await expect(page.getByLabel('입력한 근로소득의 기준', { exact: true })).toHaveCount(0);
  await expect(page.locator('.finance-step-actions')).toHaveCSS('position', 'static');
  await page.getByRole('button', { name: '다음', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/finance-wizard-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await advanceTo(page, '주택과 보증금');
  await money(page, '전월세 보증금', '500');
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveAttribute(
    'inputmode',
    'decimal',
  );
  await expect(page.locator('#finance-deposit-unit')).toContainText('입력한 금액: 5,000,000원');
  await page
    .getByLabel('전월세 보증금', { exact: true })
    .evaluate((input) => input.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `test-results/finance-manwon-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await next(page);
  await page.getByRole('button', { name: '모든 부채를 없음으로 선택', exact: true }).click();
  await next(page);
  await page.getByLabel('차량 보유 여부', { exact: true }).selectOption('none');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await expect(page.locator('.finance-review')).toContainText('5,000,000원');
  await expect(page.locator('.finance-review > article')).toHaveCount(5);
  await page.getByRole('button', { name: '재산 정보 수정', exact: true }).click();
  await expect(page.locator('#question-assets-home')).toBeFocused();
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('500');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await calculateAndExpect(page);
  const guide = page.getByRole('region', { name: '결과에 나오는 용어를 먼저 알아보세요' });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('50%라면 기준 금액의 절반');
  await expect(guide.locator('xpath=ancestor::details')).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const explanation = document.querySelector('.finance-result-guide');
      const summary = document.querySelector('.finance-result-summary');
      return Boolean(
        explanation.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);
  await guide.screenshot({
    path: `test-results/finance-result-terms-${testInfo.project.name}.png`,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(guide).toBeVisible();
  await expect(page.locator('.finance-result-summary')).toContainText('4.8%');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  expect(submitted.profile.members[0].earned_income).toBe(0);
  expect(submitted.profile.members[0].business_income).toBeNull();
  expect(submitted.profile.assets.housing).toBeNull();
  expect(submitted.profile.assets.rental_deposit).toBe(5000000);
  expect(submitted.profile.debts).toEqual({ bank: 0, public: 0, other: 0 });
  expect(submitted.profile.vehicles).toEqual([]);
  await page.getByText('계산 기준과 공식 자료 보기', { exact: true }).click();
  await expect(page.getByRole('link', { name: /공식 기준 자료/ })).toHaveAttribute(
    'href',
    'https://www.mohw.go.kr/',
  );
  await page.getByRole('button', { name: '입력 정보 수정', exact: true }).click();
  await expect(page.getByLabel('거주 지역', { exact: true })).toBeVisible();
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('500');
  await money(page, '전월세 보증금', '1,200');
  await expect(page.locator('.finance-result')).toHaveCount(0);
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await calculateAndExpect(page);
  expect(submitted.profile.assets.rental_deposit).toBe(12000000);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain('rental_deposit');
});

test('positive income basis survives backward navigation and display mode changes', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    const result = calculation();
    result.median.monthly_income = 7000000;
    result.median.ratio_percent = 273;
    return route.fulfill({ json: result });
  });
  await start(page);
  await advanceTo(page, '월급이 있나요');
  await money(page, '근로소득 (월·세전 기준)', '200');
  await page.getByLabel('입력한 근로소득의 기준', { exact: true }).selectOption('net');
  await money(page, '사업소득 (월·경비 차감 후)', '500');
  await page.getByLabel('입력한 사업소득의 기준', { exact: true }).selectOption('revenue');
  await next(page);
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByLabel('근로소득 (월·세전 기준)', { exact: true })).toHaveValue('200');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.locator('.finance-screen-title')).toHaveText('소득 정보');
  await expect(page.getByLabel('직업군', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('이 가구원의 공제 유형', { exact: true })).toHaveValue('unknown');
  await expect(page.getByLabel('입력한 근로소득의 기준', { exact: true })).toHaveValue('net');
  await expect(page.getByLabel('입력한 사업소득의 기준', { exact: true })).toHaveValue('revenue');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.locator('.finance-screen-title')).toHaveText('소득 정보');
  await expect(page.getByLabel('근로소득 (월·세전 기준)', { exact: true })).toHaveValue('200');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await next(page);
  await expect(page.locator('.finance-screen-title')).toHaveText('재산 정보');
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByLabel('입력한 근로소득의 기준', { exact: true })).toHaveValue('net');
  await expect(page.getByLabel('입력한 사업소득의 기준', { exact: true })).toHaveValue('revenue');
  await review(page);
  await calculateAndExpect(page);
  expect(submitted.profile.members[0]).toMatchObject({
    occupation: 'unknown',
    earned_income: 2000000,
    earned_income_basis: 'net',
    business_income: 5000000,
    business_income_basis: 'revenue',
  });
  await expect(
    page.locator('.finance-result-summary').getByText('확인 필요', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.finance-result-summary')).toContainText('7,000,000원');
  await expect(page.locator('.finance-result')).toContainText('입력한 소득이 세후');
});

test('money input preserves decimal editing and rejects amounts smaller than one won', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: calculation() });
  });
  await start(page);
  await advanceTo(page, '월급이 있나요');
  await money(page, '근로소득 (월·세전 기준)', '0');
  const income = page.getByLabel('근로소득 (월·세전 기준)', { exact: true });
  await expect(income).toBeVisible();
  await income.press('End');
  await income.pressSequentially('.');
  await expect(income).toHaveValue('0.');
  await income.pressSequentially('5');
  await expect(income).toHaveValue('0.5');
  await expect(page.locator('#finance-earned-0-unit')).toContainText('입력한 금액: 5,000원');
  await income.fill('0.00001');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('넷째 자리');
  await expect(income).toBeFocused();
  await expect(income).toHaveValue('0.00001');
  await income.fill('0.0001');
  await page.getByLabel('입력한 근로소득의 기준', { exact: true }).selectOption('gross');
  await next(page);
  await review(page);
  await calculateAndExpect(page);
  expect(submitted.profile.members[0].earned_income).toBe(1);
});

test('vehicle ownership, value and specifications survive grouping with distinct payloads', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: calculation() });
  });
  await start(page);
  await advanceTo(page, '보유하거나 빌려 쓰는 차량');
  await page.getByLabel('차량 보유 여부', { exact: true }).selectOption('owned');
  await page.getByLabel('차량 명의·계약 형태', { exact: true }).selectOption('joint');
  await page.getByLabel('등록증상 영업용 여부', { exact: true }).selectOption('non_commercial');
  await page.getByLabel('실제 차량 사용 목적', { exact: true }).selectOption('livelihood');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.locator('.finance-screen-title')).toHaveText('차량 정보');
  await expect(page.getByLabel('차량 명의·계약 형태', { exact: true })).toHaveValue('joint');
  await money(page, '차량 전체 가액', '600');
  await page.getByLabel('차량 금액의 기준', { exact: true }).selectOption('market');
  await page.getByLabel('차종', { exact: true }).selectOption('passenger');
  await page.getByLabel('배기량', { exact: true }).fill('1600');
  await page.getByLabel('차량 사용 연수', { exact: true }).fill('12');
  await page.getByLabel('승차 정원', { exact: true }).fill('5');
  await page.getByLabel('친환경차 구입 보조금', { exact: true }).selectOption('received');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await calculateAndExpect(page);
  expect(submitted.profile.vehicles).toEqual([
    {
      value: 6000000,
      value_basis: 'market',
      ownership: 'joint',
      registration_use: 'non_commercial',
      eco_subsidy: 'received',
      kind: 'passenger',
      use: 'livelihood',
      displacement_cc: 1600,
      age_years: 12,
      seats: 5,
    },
  ]);
});

test('server failure preserves inputs and can be retried', async ({ page }) => {
  await page.route('**/v1/finance/calculate', (route) =>
    route.fulfill({ status: 503, json: { detail: '계산 서버 점검 중입니다.' } }),
  );
  await start(page);
  await review(page);
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('계산 서버 점검 중');
  await expect(page.locator('.finance-result')).toHaveCount(0);
  await page.route('**/v1/finance/calculate', (route) => route.fulfill({ json: calculation() }));
  await page.getByRole('button', { name: '다시 계산하기', exact: true }).click();
  await expect(page.locator('.finance-result')).toBeVisible();
});

test('account load opens review, save requires consent, delete clears the draft', async ({
  page,
}) => {
  let getCount = 0;
  let saveBody;
  let deletion = false;
  let saved = null;
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({ json: { user: { id: 77, name: '계산회원', username: 'finance_user' } } }),
  );
  await page.route('**/v1/finance/profile', (route) => {
    if (route.request().method() === 'POST') {
      saveBody = route.request().postDataJSON();
      saved = {
        profile: saveBody.profile,
        calculation: calculation(),
        updated_at: '2026-09-25T00:00:00Z',
      };
      return route.fulfill({ json: saved });
    }
    getCount += 1;
    return route.fulfill({ json: saved || { profile: null, calculation: null, updated_at: null } });
  });
  await page.route('**/v1/finance/profile/delete', (route) => {
    deletion = true;
    return route.fulfill({ json: { deleted: true } });
  });
  await start(page);
  await advanceTo(page, '나이·공제 유형');
  await advanceTo(page, '주택과 보증금');
  await money(page, '전월세 보증금', '45.6789');
  await review(page);
  expect(getCount).toBe(1);
  await page.getByRole('button', { name: '저장한 정보 불러오기', exact: true }).click();
  await expect(
    page.getByText('계정에 저장한 정보가 없습니다. 지금 입력한 내용은 그대로 유지합니다.'),
  ).toBeVisible();
  await expect(page.locator('.finance-review')).toContainText('456,789원');
  await expect(page.getByRole('button', { name: '계정에 저장하기', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '이 정보를 내 계정에 저장', exact: true }).check();
  await page.getByRole('button', { name: '계정에 저장하기', exact: true }).click();
  await expect(page.getByText('계정에 저장했습니다.', { exact: true })).toBeVisible();
  expect(saveBody.consent).toBe(true);
  expect(saveBody.profile.members[0].occupation).toBe('unknown');
  expect(saveBody.profile.assets.rental_deposit).toBe(456789);
  await page.getByRole('button', { name: '저장한 정보 불러오기', exact: true }).click();
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await expect(page.getByLabel('직업군', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('45.6789');
  await page.getByLabel('전월세 보증금', { exact: true }).fill('45.6789');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await page.getByRole('checkbox', { name: '이 정보를 내 계정에 저장', exact: true }).check();
  await page.getByRole('button', { name: '계정에 저장하기', exact: true }).click();
  await expect(page.getByText('계정에 저장했습니다.', { exact: true })).toBeVisible();
  expect(saveBody.profile.assets.rental_deposit).toBe(456789);
  saved = {
    profile: storedProfile(),
    calculation: calculation(),
    updated_at: '2026-09-25T00:00:00Z',
  };
  await page.getByRole('button', { name: '저장한 정보 불러오기', exact: true }).click();
  await expect(page.locator('.finance-review')).toContainText('10,000,000원');
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('1,000');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await page.getByRole('button', { name: '계정에 저장한 정보 삭제', exact: true }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  expect(deletion).toBe(false);
  await page.getByRole('button', { name: '계정에 저장한 정보 삭제', exact: true }).click();
  await page.getByRole('button', { name: '저장 정보 삭제하기', exact: true }).click();
  await expect(page.getByText('계정에 저장한 소득·재산 정보를 삭제했습니다.')).toBeVisible();
  expect(deletion).toBe(true);
  await expect(page.getByRole('button', { name: '처음 계산하기', exact: true })).toBeVisible();
});

test('draft and position survive SPA navigation, but refresh clears guest financial data', async ({
  page,
}) => {
  await start(page);
  await advanceTo(page, '월급이 있나요');
  await money(page, '근로소득 (월·세전 기준)', '123.4567');
  await page.evaluate(() => {
    location.hash = 'home';
  });
  await expect(page.locator('.calculator-page')).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = 'calculator-details';
  });
  await expect(page.locator('.finance-screen-title')).toHaveText('소득 정보');
  await expect(page.getByLabel('근로소득 (월·세전 기준)', { exact: true })).toHaveValue('123.4567');
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain('123.4567');
  await page.reload();
  await expect(page.getByRole('button', { name: '처음 계산하기', exact: true })).toBeVisible();
});

test('question and grouped-section validation focus invalid fields, including review edits', async ({
  page,
}) => {
  await start(page);
  await advanceTo(page, '나이·공제 유형');
  await page.getByLabel('만 나이', { exact: true }).fill('-1');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('0 이상의 정수');
  await expect(page.getByLabel('만 나이', { exact: true })).toBeFocused();
  await page.getByLabel('만 나이', { exact: true }).fill('65');
  await page.getByLabel('만 나이', { exact: true }).press('Enter');
  await expect(page.locator('.finance-screen-title')).toHaveText('재산 정보');
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await money(page, '사업소득 (월·경비 차감 후)', '0.00001');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('넷째 자리');
  await expect(page.getByLabel('사업소득 (월·경비 차감 후)', { exact: true })).toBeFocused();
  await page.getByLabel('사업소득 (월·경비 차감 후)', { exact: true }).fill('1');
  await page.getByLabel('입력한 사업소득의 기준', { exact: true }).selectOption('net_expenses');
  await review(page);
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await page.getByLabel('가구원 수', { exact: true }).selectOption('2');
  await page.getByLabel('18세 미만 자녀 수', { exact: true }).selectOption('2');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '단계별로 수정하기', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByLabel('18세 미만 자녀 수', { exact: true })).toBeFocused();
  await page.getByLabel('18세 미만 자녀 수', { exact: true }).selectOption('0');
  await review(page);
});

test('changing household and vehicle applicability restores drafts but excludes inactive entries', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: calculation() });
  });
  await start(page);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await review(page);
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await page.getByLabel('가구원 수', { exact: true }).selectOption('2');
  await page.getByLabel('만 나이', { exact: true }).nth(1).fill('47');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('1');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('2');
  await expect(page.getByLabel('만 나이', { exact: true }).nth(1)).toHaveValue('47');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('1');
  await page.getByLabel('차량 보유 여부', { exact: true }).selectOption('owned');
  await money(page, '차량 전체 가액', '700');
  await page.getByLabel('차량 보유 여부', { exact: true }).selectOption('none');
  await page.getByLabel('차량 보유 여부', { exact: true }).selectOption('owned');
  await expect(page.getByLabel('차량 전체 가액', { exact: true })).toHaveValue('700');
  await page.getByLabel('차량 보유 여부', { exact: true }).selectOption('none');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await calculateAndExpect(page);
  expect(submitted.profile.members).toHaveLength(1);
  expect(submitted.profile.vehicle_status).toBe('none');
  expect(submitted.profile.vehicles).toEqual([]);
});

test('guest draft follows explicit login and logout clears all calculator memory', async ({
  page,
}) => {
  await page.route('**/v1/auth/login', (route) =>
    route.fulfill({ json: { user: { id: 88, name: '이어쓰기회원', username: 'finance_guest' } } }),
  );
  await page.route('**/v1/auth/logout', (route) =>
    route.fulfill({ json: { message: '로그아웃했습니다.' } }),
  );
  await start(page);
  await advanceTo(page, '월급이 있나요');
  await money(page, '근로소득 (월·세전 기준)', '234.5678');
  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await page.getByLabel('아이디', { exact: true }).fill('finance_guest');
  await page.getByLabel('비밀번호', { exact: true }).fill('Finance123!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByText('이어쓰기회원님', { exact: true })).toHaveText('이어쓰기회원님');
  await page.evaluate(() => {
    location.hash = 'calculator-details';
  });
  await expect(page.locator('.finance-screen-title')).toHaveText('소득 정보');
  await expect(page.getByLabel('근로소득 (월·세전 기준)', { exact: true })).toHaveValue('234.5678');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
  await page.evaluate(() => {
    location.hash = 'calculator-details';
  });
  await expect(page.getByRole('button', { name: '처음 계산하기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '처음 계산하기', exact: true }).click();
  await advanceTo(page, '월급이 있나요');
  await expectMoneyState(page, '근로소득 (월·세전 기준)', 'unknown');
});
