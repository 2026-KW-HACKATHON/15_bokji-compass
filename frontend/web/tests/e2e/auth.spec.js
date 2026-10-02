import { test, expect } from '@playwright/test';

test('signup without phone, login, reload and logout against the API', async ({ page }) => {
  const suffix = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 10));
  const username = 'user_' + suffix;
  await page.goto('/#signup');
  await page.getByLabel('이름', { exact: true }).fill('홍길동');
  await page.getByLabel('아이디', { exact: true }).fill(username);
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('MismatchPassword42!');
  await page.getByLabel('나이 (만 나이)').fill('25');
  await page.getByRole('combobox', { name: '성별', exact: true }).selectOption('undisclosed');
  await page.getByRole('combobox', { name: '거주 지역', exact: true }).selectOption('서울');
  await expect(page.getByLabel('전화번호', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('일치하지');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  await page.getByRole('link', { name: '로그인하러 가기' }).click();
  await page.getByLabel('아이디', { exact: true }).fill(username);
  await page.getByLabel('비밀번호', { exact: true }).fill('WrongPassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByText('홍길동님', { exact: true })).toBeVisible();
  await expect(page.getByText(username + '님', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('홍길동님', { exact: true })).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(storage).not.toContain('ExamplePassword');
  expect(storage).not.toContain('bokji_session');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
});

test('easy signup has two steps and preserves fields across mode changes', async ({ page }) => {
  let submitted;
  await page.route('**/v1/auth/signup', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { message: '회원가입이 완료됐어요. 로그인해 주세요.' },
    });
  });
  await page.goto('/#signup');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('list', { name: '회원가입 단계' }).locator('li')).toHaveCount(2);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('아이디는');
  await page.getByLabel('아이디', { exact: true }).fill('easy_user');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('heading', { name: /기본 정보/ })).toBeFocused();
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('이름을');
  await page.getByLabel('이름', { exact: true }).fill('김복지');
  await page.getByLabel('나이 (만 나이)').fill('67');
  await page.getByRole('combobox', { name: '성별', exact: true }).selectOption('undisclosed');
  await page.getByRole('combobox', { name: '거주 지역', exact: true }).selectOption('부산');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('easy_user');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('김복지');
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  expect(submitted.age).toBe(67);
  expect(submitted).not.toHaveProperty('phone');
  expect(submitted).not.toHaveProperty('verification_token');
});

test('Kakao availability, start failure and cancellation are visible', async ({ page }) => {
  await page.goto('/#login');
  await expect(page.getByRole('button', { name: '카카오 로그인', exact: true })).toBeDisabled();
  await expect(page.getByText(/카카오 로그인을 준비 중/)).toBeVisible();
  await page.route('**/v1/auth/kakao/status', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route('**/v1/auth/kakao/start', (route) =>
    route.fulfill({ status: 503, json: { detail: '카카오 연결을 확인해 주세요.' } }),
  );
  await page.reload();
  await page.getByRole('button', { name: '카카오 로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('카카오 연결');
  await expect(page.getByRole('alert')).toBeFocused();
  await page.goto('/#login?kakao=cancelled');
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('취소');
});

test('Kakao first signup only asks for basic profile and establishes user UI', async ({ page }) => {
  let submitted;
  await page.route('**/v1/auth/kakao/status', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route('**/v1/auth/kakao/pending', (route) =>
    route.fulfill({ json: { name: '카카오별명' } }),
  );
  await page.route('**/v1/auth/kakao/complete', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { user: { id: 'kakao-test', username: 'k_test', ...submitted } },
    });
  });
  await page.goto('/#signup?kakao=complete');
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('카카오별명');
  await expect(page.getByLabel('아이디', { exact: true })).toBeHidden();
  await expect(page.getByLabel('전화번호', { exact: true })).toHaveCount(0);
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('이름', { exact: true })).toBeVisible();
  await page.getByLabel('나이 (만 나이)').fill('35');
  await page.getByRole('combobox', { name: '성별', exact: true }).selectOption('undisclosed');
  await page.getByRole('combobox', { name: '거주 지역', exact: true }).selectOption('서울');
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByText('카카오별명님', { exact: true })).toBeVisible();
  expect(submitted).toEqual({ name: '카카오별명', age: 35, gender: 'undisclosed', region: '서울' });
});

test('expired Kakao signup requires a new login', async ({ page }) => {
  await page.route('**/v1/auth/kakao/pending', (route) =>
    route.fulfill({
      status: 401,
      json: { detail: '카카오 인증이 만료됐어요. 다시 로그인해 주세요.' },
    }),
  );
  await page.goto('/#signup?kakao=complete');
  await expect(page.getByRole('alert')).toContainText('만료');
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeDisabled();
});
