import { test, expect } from '@playwright/test';

const user = { id: 333, username: 'prefill_member', name: '회원', age: 42, region: '경기' };
const profile = () => ({
  schema_version: 1,
  reference_year: 2026,
  household_size: 4,
  region: 'gyeonggi',
  household_scope_confirmed: true,
  minor_children: 2,
  recipient_status: 'none',
  members: Array.from({ length: 4 }, (_, index) => ({
    age: index === 0 ? 65 : 10,
    occupation: 'unknown',
    earned_income: index === 0 ? 3000000 : 0,
    earned_income_basis: 'gross',
    business_income: 0,
    business_income_basis: 'unknown',
    other_income: 0,
    private_transfer_income: 0,
    deduction: 'ordinary',
  })),
  assets: { housing: null, rental_deposit: 1234567, general: 0, financial: 0 },
  debts: { bank: 0, public: 0, other: 0 },
  vehicle_status: 'none',
  vehicles: [],
  additional_review: false,
});
const calculation = {
  reference_year: 2026,
  rules_version: 'test',
  median: { base: 6494738, monthly_income: 3000000, ratio_percent: 46.2, thresholds: [] },
  assets: {
    gross_total: null,
    net_total: null,
    without_vehicles: null,
    vehicle_total: 0,
    debt_total: 0,
  },
  assessments: [],
  sources: [],
  notes: [],
};
const record = (value) => ({
  profile: value,
  calculation: value ? calculation : null,
  updated_at: value ? '2026-10-06T00:00:00Z' : null,
});

test('account data loads once and fills quick, detailed and profile screens without repeating input', async ({
  page,
}) => {
  let reads = 0;
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => {
    reads += 1;
    return route.fulfill({ json: record(profile()) });
  });
  await page.goto('/#calculator');
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue(
    '300',
  );
  await page.getByRole('link', { name: '소득·재산 상세 계산', exact: true }).click();
  await expect(page.getByRole('button', { name: '전체 정보 수정', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await expect(page.getByLabel('거주 지역', { exact: true })).toHaveValue('gyeonggi');
  await expect(page.getByLabel('만 나이', { exact: true }).first()).toHaveValue('65');
  await expect(page.getByLabel('18세 미만 자녀 수', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('123.4567');
  await page.evaluate(() => {
    location.hash = 'profile';
  });
  await expect(page.locator('.profile-page')).toContainText('4명');
  expect(reads).toBe(1);
});

test('known member age and region prefill a new detailed form and quick household carries across', async ({
  page,
}) => {
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => route.fulfill({ json: record(null) }));
  await page.goto('/#calculator');
  await expect(page.getByText('회원님', { exact: true })).toHaveText('회원님');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('4');
  await page.getByRole('link', { name: '소득·재산 상세 계산', exact: true }).click();
  await page.getByRole('button', { name: '처음 계산하기', exact: true }).click();
  await expect(page.getByLabel('거주 지역', { exact: true })).toHaveValue('gyeonggi');
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('4');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByLabel('만 나이', { exact: true }).first()).toHaveValue('42');
  await expect(page.getByLabel('만 나이', { exact: true }).nth(1)).toHaveValue('');
  await page
    .getByRole('button', { name: '가구원 1의 소득 모두 없음으로 선택', exact: true })
    .click();
  await expect(
    page
      .getByRole('group', { name: '근로소득 (월·세전 기준) 여부', exact: true })
      .first()
      .getByRole('button', { name: '없어요', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('late saved data never replaces quick values already edited by the user', async ({ page }) => {
  let pending;
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => {
    pending = route;
  });
  await page.goto('/#calculator');
  await expect(page.getByText('회원님', { exact: true })).toHaveText('회원님');
  await expect(
    page.getByText('회원의 소득·재산 정보를 불러오고 있어요…', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('가구원 수', { exact: true }).selectOption('3');
  await page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true }).fill('123.4567');
  await pending.fulfill({ json: record(profile()) });
  await expect(page.getByText(/입력한 소득·재산 정보에서/)).toBeVisible();
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue(
    '123.4567',
  );
});

test('grouped child and household choices preserve exact counts through mode changes', async ({
  page,
}) => {
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user: null } }));
  await page.goto('/#calculator-details');
  await page.getByRole('button', { name: '처음 계산하기', exact: true }).click();
  await page.getByLabel('가구원 수', { exact: true }).selectOption('6');
  const children = page.getByLabel('18세 미만 자녀 수', { exact: true });
  await expect(children.locator('option')).toHaveText([
    '모름 · 확인 필요',
    '없음 (0명)',
    '1명',
    '2명',
    '3명 이상',
  ]);
  await children.selectOption('group');
  await page.getByLabel('실제 자녀 수', { exact: true }).selectOption('4');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(children).toHaveValue('group');
  await expect(page.getByLabel('실제 자녀 수', { exact: true })).toHaveValue('4');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('group');
  await page.getByLabel('실제 가구원 수', { exact: true }).selectOption('manual');
  await page.getByLabel('실제 가구원 수 직접 입력', { exact: true }).fill('13');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByLabel('만 나이', { exact: true })).toHaveCount(13);
});

test('quick household changes update a previously visited detailed draft and age edits keep quick income', async ({
  page,
}) => {
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => route.fulfill({ json: record(profile()) }));
  await page.goto('/#calculator-details');
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await page.getByLabel('전월세 보증금', { exact: true }).fill('777');
  await page.getByRole('link', { name: '중위소득 빠르게 확인하기', exact: true }).click();
  await page.getByLabel('가구원 수', { exact: true }).selectOption('2');
  await page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true }).fill('123');
  await page.getByRole('link', { name: '소득·재산 상세 계산', exact: true }).click();
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('만 나이', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('777');
  await page.getByLabel('만 나이', { exact: true }).first().fill('66');
  await page.getByRole('link', { name: '중위소득 빠르게 확인하기', exact: true }).click();
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue(
    '123',
  );
});

test('a delayed authentication response preserves choices entered while the session restores', async ({
  page,
}) => {
  let pendingAuth;
  await page.route('**/v1/auth/me', (route) => {
    pendingAuth = route;
  });
  await page.route('**/v1/finance/profile', (route) => route.fulfill({ json: record(profile()) }));
  await page.goto('/#calculator');
  await page.getByLabel('가구원 수', { exact: true }).selectOption('2');
  await page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true }).fill('123');
  await pendingAuth.fulfill({ json: { user } });
  await expect(page.getByText('회원님', { exact: true })).toHaveText('회원님');
  await expect(page.getByText(/입력한 소득·재산 정보에서/)).toBeVisible();
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue(
    '123',
  );
});

test('saved unknown income stays blank and saved zero remains an explicit zero', async ({
  page,
}) => {
  const saved = profile();
  saved.members[0].earned_income = null;
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => route.fulfill({ json: record(saved) }));
  await page.goto('/#calculator');
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue('');
  saved.members[0].earned_income = 0;
  await page.reload();
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue('0');
});

test('deleting saved data cancels a delayed retry and cannot restore the removed record', async ({
  page,
}) => {
  let reads = 0;
  let pending;
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => {
    reads += 1;
    if (reads === 1) return route.fulfill({ status: 503, json: { detail: '일시 오류' } });
    pending = route;
  });
  await page.route('**/v1/finance/profile/delete', (route) =>
    route.fulfill({ json: { deleted: true } }),
  );
  await page.goto('/#calculator-details');
  await page.getByRole('button', { name: '처음 계산하기', exact: true }).click();
  for (let index = 0; index < 4; index += 1) {
    const heading = page.locator('.finance-screen-title');
    const previous = await heading.textContent();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(heading).not.toHaveText(previous);
  }
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await page.getByRole('button', { name: '저장 정보 다시 불러오기', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await page.getByRole('button', { name: '계정에 저장한 정보 삭제', exact: true }).click();
  await page.getByRole('button', { name: '저장 정보 삭제하기', exact: true }).click();
  await expect(
    page.getByText('계정에 저장한 소득·재산 정보를 삭제했습니다.', { exact: true }),
  ).toBeVisible();
  await pending.fulfill({ json: record(profile()) }).catch(() => {});
  await page.getByRole('link', { name: '중위소득 빠르게 확인하기', exact: true }).click();
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true })).toHaveValue('');
  await page.evaluate(() => {
    location.hash = 'profile';
  });
  await page.getByRole('tab', { name: '소득·재산', exact: true }).click();
  await expect(page.getByRole('link', { name: '소득·재산 입력하기', exact: true })).toBeVisible();
});

test('saving updates the shared record so clearing a later draft shows the latest saved details', async ({
  page,
}) => {
  let saved = profile();
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => {
    if (route.request().method() === 'POST') saved = route.request().postDataJSON().profile;
    return route.fulfill({ json: record(saved) });
  });
  await page.goto('/#calculator-details');
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await page.getByLabel('근로소득 (월·세전 기준)', { exact: true }).first().fill('500');
  await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
  await page.getByRole('checkbox', { name: '이 정보를 내 계정에 저장', exact: true }).check();
  await page.getByRole('button', { name: '계정에 저장하기', exact: true }).click();
  await expect(page.getByText('계정에 저장했습니다.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '입력 정보 수정', exact: true }).click();
  await page.getByLabel('만 나이', { exact: true }).first().fill('66');
  await page.getByRole('button', { name: '이 화면의 입력 정보 지우기', exact: true }).click();
  await page.evaluate(() => {
    location.hash = 'profile';
  });
  await page.getByRole('tab', { name: '소득·재산', exact: true }).click();
  await page.getByText('입력한 소득·재산 상세 보기', { exact: true }).click();
  await expect(page.locator('.finance-review')).toContainText('5,000,000원');
  await expect(page.locator('.finance-review')).not.toContainText('3,000,000원');
});

test('continuing from profile preserves the current draft status through repeated visits', async ({
  page,
}) => {
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => route.fulfill({ json: record(profile()) }));
  await page.goto('/#calculator-details');
  await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
  await page.getByLabel('전월세 보증금', { exact: true }).fill('777');
  await page.evaluate(() => {
    location.hash = 'profile';
  });
  await page.getByRole('tab', { name: '소득·재산', exact: true }).click();
  await page.getByRole('link', { name: '계산기에서 이어서 입력', exact: true }).click();
  await expect(page.getByLabel('전월세 보증금', { exact: true })).toHaveValue('777');
  await page.evaluate(() => {
    location.hash = 'profile';
  });
  await page.getByRole('tab', { name: '소득·재산', exact: true }).click();
  await expect(page.getByText('작성 중인 정보가 있어요', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: '계산기에서 이어서 입력', exact: true }),
  ).toBeVisible();
});

test('reloading unknown income clears automatic totals and keeps a manually entered quick total', async ({
  page,
}) => {
  let saved = profile();
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => route.fulfill({ json: record(saved) }));
  await page.goto('/#calculator');
  const income = page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true });
  await expect(income).toHaveValue('300');
  await page.getByRole('link', { name: '소득·재산 상세 계산', exact: true }).click();
  saved.members[0].earned_income = null;
  await page.getByRole('button', { name: '저장한 정보 불러오기', exact: true }).click();
  await expect(
    page.getByText('계정에 저장된 정보를 불러왔습니다. 입력 내용을 확인하거나 수정해 주세요.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: '중위소득 빠르게 확인하기', exact: true }).click();
  await expect(income).toHaveValue('');
  await income.fill('123');
  await page.getByRole('link', { name: '소득·재산 상세 계산', exact: true }).click();
  saved = profile();
  saved.members[0].earned_income_basis = 'net';
  await page.getByRole('button', { name: '저장한 정보 불러오기', exact: true }).click();
  await expect(
    page.getByText('계정에 저장된 정보를 불러왔습니다. 입력 내용을 확인하거나 수정해 주세요.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: '중위소득 빠르게 확인하기', exact: true }).click();
  await expect(income).toHaveValue('123');
});

for (const operation of ['save', 'delete']) {
  test(`${operation} finishes across navigation and updates shared account information`, async ({
    page,
  }) => {
    let saved = profile();
    let pending;
    await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
    await page.route('**/v1/finance/profile', (route) => {
      if (route.request().method() === 'POST') {
        saved = route.request().postDataJSON().profile;
        pending = route;
        return;
      }
      return route.fulfill({ json: record(saved) });
    });
    await page.route('**/v1/finance/profile/delete', (route) => {
      saved = null;
      pending = route;
    });
    await page.goto('/#calculator-details');
    if (operation === 'save') {
      await page.getByRole('button', { name: '전체 정보 수정', exact: true }).click();
      await page.getByLabel('근로소득 (월·세전 기준)', { exact: true }).first().fill('500');
      await page.getByRole('button', { name: '입력 내용 확인', exact: true }).click();
      await page.getByRole('checkbox', { name: '이 정보를 내 계정에 저장', exact: true }).check();
      await page.getByRole('button', { name: '계정에 저장하기', exact: true }).click();
    } else {
      await page.getByRole('button', { name: '계정에 저장한 정보 삭제', exact: true }).click();
      await page.getByRole('button', { name: '저장 정보 삭제하기', exact: true }).click();
    }
    await expect.poll(() => Boolean(pending)).toBe(true);
    await page.evaluate(() => {
      location.hash = 'profile';
    });
    await page.getByRole('tab', { name: '소득·재산', exact: true }).click();
    if (operation === 'delete') {
      await page.getByRole('link', { name: '계산기에서 확인·수정', exact: true }).click();
      await expect(page.getByRole('button', { name: '전체 정보 수정', exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: '계정에 저장한 정보 삭제', exact: true }),
      ).toBeDisabled();
      await page.getByRole('checkbox', { name: '이 정보를 내 계정에 저장', exact: true }).check();
      await expect(
        page.getByRole('button', { name: '계정에 저장하기', exact: true }),
      ).toBeDisabled();
    }
    await pending.fulfill({ json: operation === 'save' ? record(saved) : { deleted: true } });
    if (operation === 'save') {
      await page.getByText('입력한 소득·재산 상세 보기', { exact: true }).click();
      await expect(page.locator('.finance-review')).toContainText('5,000,000원');
      await expect(page.locator('.finance-review')).not.toContainText('3,000,000원');
    } else {
      await expect(
        page.getByText('계정에 저장한 소득·재산 정보를 삭제했습니다.', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: '처음 계산하기', exact: true })).toBeVisible();
      await page.evaluate(() => {
        location.hash = 'profile';
      });
      await page.getByRole('tab', { name: '소득·재산', exact: true }).click();
      await expect(
        page.getByRole('link', { name: '소득·재산 입력하기', exact: true }),
      ).toBeVisible();
      await page.getByRole('link', { name: '소득·재산 입력하기', exact: true }).click();
      await expect(page.getByRole('button', { name: '처음 계산하기', exact: true })).toBeVisible();
    }
  });
}

test('a delayed delete keeps new choices entered after leaving the requesting screen', async ({
  page,
}) => {
  let pending;
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) => route.fulfill({ json: record(profile()) }));
  await page.route('**/v1/finance/profile/delete', (route) => {
    pending = route;
  });
  await page.goto('/#calculator-details');
  await page.getByRole('button', { name: '계정에 저장한 정보 삭제', exact: true }).click();
  await page.getByRole('button', { name: '저장 정보 삭제하기', exact: true }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.getByRole('link', { name: '중위소득 빠르게 확인하기', exact: true }).click();
  await page.getByLabel('가구원 수', { exact: true }).selectOption('2');
  const income = page.getByLabel('가구 전체 월소득 (선택 · 만원)', { exact: true });
  await income.fill('123');
  const response = page.waitForResponse((response) =>
    response.url().endsWith('/v1/finance/profile/delete'),
  );
  await pending.fulfill({ json: { deleted: true } });
  await response;
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('2');
  await expect(income).toHaveValue('123');
  await page.getByRole('link', { name: '소득·재산 상세 계산', exact: true }).click();
  await expect(page.getByLabel('가구원 수', { exact: true })).toHaveValue('2');
});
