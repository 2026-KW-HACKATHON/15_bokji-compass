import { test, expect } from '@playwright/test';
import {
  currentTransferMonth,
  transferMonthLabels,
} from '../../../packages/core/src/financeModel.js';

const profile = () => ({
  schema_version: 1,
  reference_year: 2026,
  household_size: 1,
  region: 'seoul',
  household_scope_confirmed: true,
  minor_children: 0,
  recipient_status: 'none',
  members: [
    {
      age: 40,
      earned_income: 0,
      business_income: 0,
      other_income: 670000,
      private_transfer_income: 200000,
      deduction: 'ordinary',
    },
  ],
  assets: { housing: 0, rental_deposit: 0, general: 0, financial: 0 },
  debts: { bank: 0, public: 0, other: 0 },
  vehicle_status: 'none',
  vehicles: [],
});

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/v1/finance/calculate', {
    data: { profile: profile() },
  });
  expect(response.ok()).toBeTruthy();
  const calculation = await response.json();
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: 'transfer-test', username: 'transfer', name: '시험', age: 40, region: '서울' },
      },
    }),
  );
  await page.route('**/v1/finance/profile', (route) =>
    route.fulfill({
      json: {
        profile: profile(),
        calculation,
        updated_at: '2026-10-08',
      },
    }),
  );
  await page.goto('/#calculator-details');
  await expect(page.getByRole('button', { name: '계산하기', exact: true })).toBeVisible();
});

test('incomplete support keeps a partial amount without a green comparison, including easy mode', async ({
  page,
}) => {
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  const assessment = page.locator('.finance-assessment').filter({ hasText: '생계급여 기본 산식' });
  await expect(assessment.getByRole('status')).toContainText('지원금 반영 후 기준 비교');
  await assessment.getByText('기준 비교와 확인할 내용 보기', { exact: true }).click();
  await expect(assessment).toContainText('지원금 미반영 참고액');
  await expect(assessment).toContainText('670,000원');
  await expect(assessment.locator('.finance-check-state')).toHaveText('지원금 반영 후 비교 필요');
  await expect(assessment.locator('.finance-check-state.within')).toHaveCount(0);
});

test('regular small support is assessed after entering history and the repeat shortcut', async ({
  page,
}) => {
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await page.getByLabel('가구 전체의 지원 여부', { exact: true }).selectOption('received');
  await page.getByLabel('누구에게 받았나요?', { exact: true }).selectOption('family_friends');
  await page.getByLabel('받은 돈을 어떻게 사용했나요?', { exact: true }).selectOption('living');
  const month = transferMonthLabels(currentTransferMonth())[0];
  await page
    .getByRole('group', { name: `${month} 지원금 합계 여부`, exact: true })
    .getByRole('button', { name: '있어요', exact: true })
    .click();
  await page.getByLabel(`${month} 지원금 합계`, { exact: true }).fill('20');
  await page.getByLabel(`${month} 받은 횟수`, { exact: true }).fill('2');
  await page
    .getByRole('button', { name: '첫 달 금액·횟수를 12개월에 동일하게 적용', exact: true })
    .click();
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  const assessment = page.locator('.finance-assessment').filter({ hasText: '생계급여 기본 산식' });
  await expect(assessment.locator('.finance-check-state')).toHaveText('입력값은 기준 이내');
  await expect(assessment).toContainText('670,000원');
  await assessment.getByText('계산 내역 보기', { exact: true }).click();
  await expect(assessment).toContainText('가족·지인 지원금 월 소득 반영액');
  await expect(assessment.getByRole('status')).toHaveCount(0);
});

test('support history fields translate in every language while keeping entered money', async ({
  page,
}) => {
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await page.getByLabel('가구 전체의 지원 여부', { exact: true }).selectOption('received');
  await page.getByLabel('누구에게 받았나요?', { exact: true }).selectOption('family_friends');
  await page.getByLabel('받은 돈을 어떻게 사용했나요?', { exact: true }).selectOption('living');
  const month = transferMonthLabels(currentTransferMonth())[0];
  await page
    .getByRole('group', { name: month + ' 지원금 합계 여부', exact: true })
    .getByRole('button', { name: '있어요', exact: true })
    .click();
  const amount = page.locator('#finance-transfer-month-0');
  await amount.fill('20');
  for (const locale of ['en', 'zh', 'vi', 'ja']) {
    await page.locator('.language-selector select').selectOption(locale);
    await expect(page.locator('.finance-form-fields')).not.toContainText(/[가-힣]/);
    await expect(amount).toHaveValue('20');
    await expect(page.locator('#finance-transfer-count-0')).toBeVisible();
  }
});
