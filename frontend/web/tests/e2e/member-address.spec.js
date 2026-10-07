import { test, expect } from '@playwright/test';
import {
  addressPayload,
  mockPostcode,
  postcodeResults,
  selectPostcode,
} from '../fixtures/postcode.js';

async function mockMember(page, fields = {}) {
  const state = {
    user: {
      id: 'address-member',
      username: 'address_member',
      email: 'address@example.com',
      email_verified: true,
      name: '주소회원',
      age: 35,
      gender: 'undisclosed',
      region: '서울',
      postal_code: null,
      address: null,
      address_detail: null,
      ...fields,
    },
    bodies: [],
  };
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user: state.user } }));
  await page.route('**/v1/auth/profile', (route) => {
    const body = route.request().postDataJSON();
    state.bodies.push(body);
    state.user = { ...state.user, ...body };
    return route.fulfill({ json: { user: state.user } });
  });
  await page.route('**/v1/finance/profile', (route) =>
    route.fulfill({ json: { profile: null, calculation: null } }),
  );
  return state;
}

async function openMemberForm(page) {
  await expect(page.getByText('주소회원님', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '기본 정보', exact: true }).click();
  await page.getByRole('button', { name: /^기본 정보 (추가|수정)$/ }).click();
  return page.getByRole('form', { name: '회원 정보 수정' });
}

test('members select an exact address and restore it from their account after reload', async ({
  page,
}) => {
  const state = await mockMember(page);
  await mockPostcode(page);
  await page.goto('/#profile');
  let form = await openMemberForm(page);
  await expect(form.getByRole('combobox', { name: /거주 지역/ })).toHaveCount(0);
  await expect(form.getByLabel('우편번호', { exact: true })).toHaveAttribute('readonly', '');
  await expect(form.getByLabel('기본 주소', { exact: true })).toHaveAttribute('readonly', '');
  await selectPostcode(form, '부산');
  await expect(form.getByLabel('상세 주소', { exact: true })).toBeFocused();
  await expect(form.getByLabel('우편번호', { exact: true })).toHaveValue('47545');
  await expect(form.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.부산.roadAddress,
  );
  await form.getByLabel('상세 주소', { exact: true }).fill('101동 202호');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(form.getByLabel('상세 주소', { exact: true })).toHaveValue('101동 202호');
  await form.getByRole('button', { name: '회원 정보 저장', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('기본 정보를 저장했어요');
  expect(state.bodies).toEqual([
    {
      name: '주소회원',
      age: 35,
      gender: 'undisclosed',
      ...addressPayload('부산', '101동 202호'),
    },
  ]);
  await page.reload();
  form = await openMemberForm(page);
  await expect(form.getByLabel('우편번호', { exact: true })).toHaveValue('47545');
  await expect(form.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.부산.roadAddress,
  );
  await expect(form.getByLabel('상세 주소', { exact: true })).toHaveValue('101동 202호');
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(storage).not.toContain(postcodeResults.부산.roadAddress);
  expect(storage).not.toContain('101동 202호');
});

test('legacy region-only members keep their region when editing another field', async ({
  page,
}) => {
  const state = await mockMember(page);
  await mockPostcode(page);
  await page.goto('/#profile');
  const form = await openMemberForm(page);
  await expect(form.getByLabel('기본 주소', { exact: true })).toHaveValue('');
  await expect(form).toContainText('서울');
  await form.getByLabel('나이 (만 나이)').fill('36');
  await form.getByRole('button', { name: '회원 정보 저장', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('기본 정보를 저장했어요');
  expect(state.bodies).toEqual([
    {
      name: '주소회원',
      age: 36,
      gender: 'undisclosed',
      region: '서울',
      postal_code: null,
      address: null,
      address_detail: null,
    },
  ]);
});

test('choosing another address clears the old detail and closing search preserves the current draft', async ({
  page,
}) => {
  await mockMember(page, addressPayload('서울', '이전 101호'));
  await mockPostcode(page);
  await page.goto('/#profile');
  const form = await openMemberForm(page);
  await selectPostcode(form, '부산');
  await expect(form.getByLabel('상세 주소', { exact: true })).toHaveValue('');
  await form.getByLabel('상세 주소', { exact: true }).fill('새 202호');
  await form.getByRole('button', { name: '주소 검색', exact: true }).click();
  await expect(form.getByRole('group', { name: '테스트 주소 검색 결과' })).toBeVisible();
  await form.getByRole('button', { name: '주소 검색 닫기', exact: true }).click();
  await expect(form.getByRole('button', { name: '주소 검색', exact: true })).toBeFocused();
  await expect(form.getByRole('group', { name: '테스트 주소 검색 결과' })).toHaveCount(0);
  await expect(form.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.부산.roadAddress,
  );
  await expect(form.getByLabel('상세 주소', { exact: true })).toHaveValue('새 202호');
});

test('clearing an address removes postal, base, detail and derived region from the account', async ({
  page,
}) => {
  const state = await mockMember(page, addressPayload('서울', '101호'));
  await mockPostcode(page);
  await page.goto('/#profile');
  const form = await openMemberForm(page);
  await form.getByRole('button', { name: '주소 지우기', exact: true }).click();
  for (const label of ['우편번호', '기본 주소', '상세 주소']) {
    await expect(form.getByLabel(label, { exact: true })).toHaveValue('');
  }
  await form.getByRole('button', { name: '회원 정보 저장', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('기본 정보를 저장했어요');
  expect(state.bodies[0]).toMatchObject({
    region: null,
    postal_code: null,
    address: null,
    address_detail: null,
  });
  await page.reload();
  const restored = await openMemberForm(page);
  await expect(restored.getByLabel('기본 주소', { exact: true })).toHaveValue('');
});

test('member setup saves exact address and derives the recommendation region on a narrow screen', async ({
  page,
}) => {
  const state = await mockMember(page, { age: null, region: null });
  await mockPostcode(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/#profile?setup=1');
  const form = page.getByRole('form', { name: '맞춤 정보 설정' });
  await selectPostcode(form, '부산');
  await form.getByLabel('상세 주소', { exact: true }).fill('303호');
  await form.getByLabel('나이 (만 나이)').fill('35');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await form.getByRole('button', { name: '저장하고 시작하기', exact: true }).click();
  await expect(page).toHaveURL(/#home$/);
  expect(state.bodies).toEqual([{ age: 35, ...addressPayload('부산', '303호') }]);
  await page.goto('/#profile');
  await openMemberForm(page);
  await page.locator('.profile-recommendation-options summary').click();
  await expect(
    page.getByRole('region', { name: '지역과 연령' }).getByLabel('거주 지역'),
  ).toHaveValue('부산');
});

test('visitors keep broad region selection without an exact address search', async ({ page }) => {
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { detail: '로그인이 필요해요.' } }),
  );
  await page.goto('/#profile');
  await page.getByRole('tab', { name: '기본 정보', exact: true }).click();
  await page.getByRole('button', { name: '기본 정보 추가', exact: true }).click();
  const region = page.getByRole('region', { name: '지역과 연령' }).getByLabel('거주 지역');
  await expect(region).toHaveValue('전국');
  await region.selectOption('부산');
  await expect(page.getByRole('button', { name: '주소 검색', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('기본 주소', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '정보 저장', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('기본 정보 저장이 완료됐어요');
  await page.getByRole('button', { name: '기본 정보 수정', exact: true }).click();
  await expect(region).toHaveValue('부산');
});

test('a failed postcode script can be retried without losing the saved address', async ({
  page,
}) => {
  await mockMember(page, addressPayload('서울', '101호'));
  const provider = await mockPostcode(page, { preload: false, failedLoads: 1 });
  await page.goto('/#profile');
  const form = await openMemberForm(page);
  await form.getByRole('button', { name: '주소 검색', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText(/주소 검색/);
  await expect(form.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.서울.roadAddress,
  );
  await expect(form.getByLabel('상세 주소', { exact: true })).toHaveValue('101호');
  await selectPostcode(form, '부산');
  await expect(form.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.부산.roadAddress,
  );
  expect(provider.loads).toBe(2);
});
