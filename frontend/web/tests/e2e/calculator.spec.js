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

test('guest calculation keeps zero distinct from unknown and supports easy steps at 320px', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: calculation() });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#calculator');
  await page.getByLabel('근로소득 (월·세전 기준)', { exact: true }).fill('0');
  await page.getByLabel('전월세 보증금', { exact: true }).fill('10,000,000');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('근로소득 (월·세전 기준)', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('입력한 근로소득의 기준', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('10,000,000');
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.getByText('123,456원', { exact: true })).toBeVisible();
  await expect(page.getByText('추가 확인 필요', { exact: true })).toBeVisible();
  expect(submitted.profile.members[0].earned_income).toBe(0);
  expect(submitted.profile.members[0].business_income).toBeNull();
  expect(submitted.profile.assets.housing).toBeNull();
  expect(submitted.profile.assets.rental_deposit).toBe(10000000);
  await page.getByText('계산 기준과 공식 자료 보기', { exact: true }).click();
  await expect(page.getByRole('link', { name: /공식 기준 자료/ })).toHaveAttribute(
    'href',
    'https://www.mohw.go.kr/',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(
    'rental_deposit',
  );
  await page.getByRole('button', { name: '입력 정보 수정', exact: true }).click();
  await expect(page.getByLabel('근로소득 (월·세전 기준)', { exact: true })).toHaveValue('0');
});

test('income basis is asked for positive amounts and survives easy mode without conversion', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    const result = calculation();
    result.median.monthly_income = null;
    result.median.ratio_percent = null;
    return route.fulfill({ json: result });
  });
  await page.goto('/#calculator');
  await expect(page.getByLabel('입력한 근로소득의 기준', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('입력한 사업소득의 기준', { exact: true })).toHaveCount(0);
  await page.getByLabel('근로소득 (월·세전 기준)', { exact: true }).fill('2,000,000');
  await page.getByLabel('입력한 근로소득의 기준', { exact: true }).selectOption('net');
  await page.getByLabel('사업소득 (월·경비 차감 후)', { exact: true }).fill('5,000,000');
  await page.getByLabel('입력한 사업소득의 기준', { exact: true }).selectOption('revenue');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('입력한 근로소득의 기준', { exact: true })).toHaveValue('net');
  await expect(page.getByLabel('입력한 사업소득의 기준', { exact: true })).toHaveValue('revenue');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.locator('.finance-result')).toBeVisible();
  expect(submitted.profile.members[0]).toMatchObject({
    earned_income: 2000000,
    earned_income_basis: 'net',
    business_income: 5000000,
    business_income_basis: 'revenue',
  });
  await expect(
    page.locator('.finance-result-summary').getByText('확인 필요', { exact: true }),
  ).toHaveCount(2);
});

test('vehicle ownership, registration and actual use remain independent in easy mode', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/finance/calculate', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: calculation() });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#calculator');
  await page.getByLabel('차량 보유 여부', { exact: true }).selectOption('owned');
  await page.getByLabel('차량 명의·계약 형태', { exact: true }).selectOption('joint');
  await page.getByLabel('등록증상 영업용 여부', { exact: true }).selectOption('non_commercial');
  await page.getByLabel('실제 차량 사용 목적', { exact: true }).selectOption('livelihood');
  await page.getByLabel('차량 전체 가액', { exact: true }).fill('6,000,000');
  await page.getByLabel('차량 금액의 기준', { exact: true }).selectOption('market');
  await page.getByLabel('차종', { exact: true }).selectOption('passenger');
  await page.getByLabel('배기량', { exact: true }).fill('1600');
  await page.getByLabel('차령', { exact: true }).fill('12');
  await page.getByLabel('승차 정원', { exact: true }).fill('5');
  await page.getByLabel('친환경차 구입 보조금', { exact: true }).selectOption('received');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByLabel('등록증상 영업용 여부', { exact: true })).toHaveValue(
    'non_commercial',
  );
  await expect(page.getByLabel('실제 차량 사용 목적', { exact: true })).toHaveValue('livelihood');
  await expect(page.getByLabel('차량 전체 가액', { exact: true })).toHaveValue('6,000,000');
  await expect(page.getByLabel('차종', { exact: true })).toBeHidden();
  await page.getByText('차종·차량 제원·보조금 확인', { exact: true }).click();
  await expect(page.getByLabel('친환경차 구입 보조금', { exact: true })).toHaveValue('received');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.locator('.finance-result')).toBeVisible();
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

test('server failure does not display a fabricated result and can be retried', async ({ page }) => {
  await page.route('**/v1/finance/calculate', (route) =>
    route.fulfill({ status: 503, json: { detail: '계산 서버 점검 중입니다.' } }),
  );
  await page.goto('/#calculator');
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('계산 서버 점검 중');
  await expect(page.locator('.finance-result')).toHaveCount(0);
  await page.route('**/v1/finance/calculate', (route) => route.fulfill({ json: calculation() }));
  await page.getByRole('button', { name: '다시 계산하기', exact: true }).click();
  await expect(page.locator('.finance-result')).toBeVisible();
});

test('account saving requires consent and stored data is loaded only by explicit action', async ({
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
  await page.goto('/#calculator');
  await expect(page.getByText('계산회원님', { exact: true })).toBeVisible();
  await page.getByLabel('전월세 보증금', { exact: true }).fill('456789');
  expect(getCount).toBe(0);
  await page.getByRole('button', { name: '저장한 정보 불러오기', exact: true }).click();
  await expect(
    page.getByText('계정에 저장한 정보가 없습니다. 지금 입력한 내용은 그대로 유지합니다.'),
  ).toBeVisible();
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('456789');
  await expect(page.getByRole('button', { name: '계정에 저장하기', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '이 정보를 내 계정에 저장', exact: true }).check();
  await page.getByRole('button', { name: '계정에 저장하기', exact: true }).click();
  await expect(page.getByText('계정에 저장했습니다.', { exact: true })).toBeVisible();
  expect(saveBody.consent).toBe(true);
  expect(saveBody.profile.assets.rental_deposit).toBe(456789);
  saved = {
    profile: storedProfile(),
    calculation: calculation(),
    updated_at: '2026-09-25T00:00:00Z',
  };
  await page.getByRole('button', { name: '저장한 정보 불러오기', exact: true }).click();
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('10,000,000');
  await page.getByRole('button', { name: '계정에 저장한 정보 삭제', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('삭제하면 다시 입력해야');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장 정보 삭제하기', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '계정에 저장한 정보 삭제', exact: true }).click();
  await page.getByRole('button', { name: '저장 정보 삭제하기', exact: true }).click();
  await expect(page.getByText('계정에 저장한 소득·재산 정보를 삭제했습니다.')).toBeVisible();
  expect(deletion).toBe(true);
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('');
});
