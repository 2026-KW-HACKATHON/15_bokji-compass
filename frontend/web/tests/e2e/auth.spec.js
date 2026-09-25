import { test, expect } from '@playwright/test';

test('signup with development SMS, login, reload and logout against the API', async ({ page }) => {
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
  await page.getByLabel('전화번호', { exact: true }).fill('010' + suffix);
  await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
  const codeBox = page.locator('.notice-box').filter({ hasText: '개발용 인증번호:' });
  await expect(codeBox).toBeVisible();
  const code = (await codeBox.textContent()).match(/\d{6}/)[0];
  await page.getByLabel('문자 인증번호').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('틀렸거나 만료');
  await page.getByLabel('문자 인증번호').fill(code);
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeEnabled();
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

test('changing phone clears verified status and server failure is visible', async ({ page }) => {
  await page.clock.install();
  await page.route('**/v1/auth/phone/request', (route) =>
    route.fulfill({
      json: {
        challenge_id: 'test-challenge',
        development_code: '123456',
        expires_in: 300,
        retry_after: 60,
      },
    }),
  );
  await page.route('**/v1/auth/phone/verify', (route) =>
    route.fulfill({
      json: {
        verification_token: 'test-proof',
        expires_in: 300,
      },
    }),
  );
  await page.goto('/#signup');
  await page.getByLabel('전화번호', { exact: true }).fill('01012345678');
  await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
  await page.getByLabel('문자 인증번호').fill('123456');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeEnabled();
  await page.getByLabel('전화번호', { exact: true }).fill('01099999999');
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeDisabled();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('button', { name: '인증번호 받기', exact: true })).toBeEnabled();
  await page.goto('/#login');
  await page.route('**/v1/auth/login', (route) => route.abort());
  await page.getByLabel('아이디', { exact: true }).fill('tester');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('연결이 원활하지 않습니다');
  await expect(page.getByRole('alert')).toBeFocused();
});

test('changing mode during a phone request keeps verification visible and validates hidden fields', async ({
  page,
}) => {
  let releaseResponse;
  const responseReady = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  await page.route('**/v1/auth/phone/request', async (route) => {
    await responseReady;
    return route.fulfill({
      json: {
        challenge_id: 'test-challenge',
        development_code: '123456',
        expires_in: 300,
        retry_after: 60,
      },
    });
  });
  await page.route('**/v1/auth/phone/verify', (route) =>
    route.fulfill({ json: { verification_token: 'test-proof', expires_in: 300 } }),
  );
  await page.goto('/#signup');
  await page.getByLabel('전화번호', { exact: true }).fill('01012345678');
  const requested = page.waitForRequest('**/v1/auth/phone/request');
  await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
  await requested;
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('heading', { name: /전화번호 인증/ })).toBeVisible();
  releaseResponse();
  await expect(page.getByLabel('문자 인증번호')).toBeVisible();
  await expect(page.getByLabel('문자 인증번호')).toBeFocused();
  await expect(page.getByLabel('아이디', { exact: true })).toBeHidden();
  await page.getByLabel('문자 인증번호').fill('123456');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('아이디는');
  await expect(page.getByLabel('아이디', { exact: true })).toBeVisible();
  await expect(page.getByLabel('전화번호', { exact: true })).toBeHidden();
});

test('easy signup validates each step and keeps input when the screen mode changes', async ({
  page,
}) => {
  let submitted;
  await page.route('**/v1/auth/phone/request', (route) =>
    route.fulfill({
      json: {
        challenge_id: 'test-challenge',
        development_code: '123456',
        expires_in: 300,
        retry_after: 60,
      },
    }),
  );
  await page.route('**/v1/auth/phone/verify', (route) =>
    route.fulfill({ json: { verification_token: 'test-proof', expires_in: 300 } }),
  );
  await page.route('**/v1/auth/signup', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { message: '회원가입이 완료됐어요. 로그인해 주세요.' },
    });
  });
  await page.goto('/#signup');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('list', { name: '회원가입 단계' })).toBeVisible();
  await expect(page.getByLabel('이름', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('아이디는');
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByLabel('아이디', { exact: true }).fill('easy_user');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: '비밀번호 숨기기', exact: true }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('MismatchPassword42!');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('일치하지');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('heading', { name: /기본 정보/ })).toBeFocused();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('이름을');
  await page.getByLabel('이름', { exact: true }).fill('김복지');
  await page.getByLabel('나이 (만 나이)').fill('67');
  await page.getByRole('combobox', { name: '성별', exact: true }).selectOption('undisclosed');
  await page.getByRole('combobox', { name: '거주 지역', exact: true }).selectOption('부산');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByRole('heading', { name: /전화번호 인증/ })).toBeFocused();
  await page.getByLabel('전화번호', { exact: true }).fill('01012345678');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('easy_user');
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('ExamplePassword42!');
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('김복지');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('전화번호', { exact: true })).toHaveValue('01012345678');
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByLabel('나이 (만 나이)')).toHaveValue('67');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
  await expect(page.getByLabel('문자 인증번호')).toBeFocused();
  await page.getByLabel('문자 인증번호').fill('123456');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  expect(submitted).toEqual({
    username: 'easy_user',
    password: 'ExamplePassword42!',
    confirm_password: 'ExamplePassword42!',
    name: '김복지',
    age: 67,
    gender: 'undisclosed',
    region: '부산',
    phone: '01012345678',
    verification_token: 'test-proof',
  });
});
