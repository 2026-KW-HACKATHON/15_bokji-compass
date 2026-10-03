import { test, expect } from '@playwright/test';

const password = 'ExamplePassword42!';
const next = (page) => page.getByRole('button', { name: '다음', exact: true }).click();
async function startSignup(page) {
  await page.goto('/#signup');
  await page.getByRole('button', { name: '아이디로 회원가입' }).click();
}
async function chooseUsername(page, username = 'wizard_user') {
  await page.getByLabel('아이디', { exact: true }).fill(username);
  await page.getByRole('button', { name: '중복확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  await next(page);
}
async function fillRemaining(page) {
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await next(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  await next(page);
  await page.getByLabel('이름', { exact: true }).fill('홍길동');
  await next(page);
  await page.getByLabel('나이 (만 나이)').fill('25');
  await next(page);
  await page.getByLabel('성별', { exact: true }).selectOption('undisclosed');
  await next(page);
  await page.getByLabel('거주 지역', { exact: true }).selectOption('서울');
  await next(page);
}
async function mockSignup(page, { signupStatus = 201 } = {}) {
  await page.route('**/v1/auth/username/check', (route) =>
    route.fulfill({
      json: { username: route.request().postDataJSON().username.toLowerCase(), available: true },
    }),
  );
  await page.route('**/v1/auth/signup', (route) =>
    route.fulfill({
      status: signupStatus,
      json:
        signupStatus === 201
          ? { message: '회원가입이 완료됐어요. 로그인해 주세요.' }
          : { detail: '이미 사용 중인 아이디예요.' },
    }),
  );
}

test('phone-free signup, DB username check, login, member edit, reload and logout', async ({
  page,
}, testInfo) => {
  const suffix = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 10));
  const username = 'user_' + suffix;
  await page.goto('/#signup');
  await expect(
    page.getByRole('button', { name: '카카오톡으로 로그인/회원가입하기' }),
  ).toBeDisabled();
  await expect(page.getByText('카카오 로그인을 준비 중이에요.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('아이디', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('signup-method.png'), fullPage: true });
  await startSignup(page);
  await expect(page.getByLabel('전화번호', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '사용할 아이디를 정해 주세요' })).toBeFocused();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
  await chooseUsername(page, username);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await next(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('MismatchPassword42!');
  await next(page);
  await expect(page.getByRole('alert')).toContainText('일치하지');
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  await next(page);
  await page.getByLabel('이름', { exact: true }).fill('홍길동');
  await next(page);
  await page.getByLabel('나이 (만 나이)').fill('25');
  await next(page);
  await page.getByLabel('성별', { exact: true }).selectOption('undisclosed');
  await next(page);
  await page.getByLabel('거주 지역', { exact: true }).selectOption('서울');
  await next(page);
  await expect(page.locator('.signup-review')).toContainText(username);
  await expect(page.locator('.signup-review')).not.toContainText(password);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('signup-review.png'), fullPage: true });
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  await page.getByRole('link', { name: '로그인하러 가기' }).click();
  await page.getByLabel('아이디', { exact: true }).fill(username);
  await page.getByLabel('비밀번호', { exact: true }).fill('WrongPassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByText('홍길동님', { exact: true })).toBeVisible();
  await page.goto('/#profile');
  const member = page.getByRole('form', { name: '회원 정보 수정' });
  await expect(member.getByLabel('아이디', { exact: true })).toHaveValue(username);
  await expect(member.getByLabel('아이디', { exact: true })).toHaveAttribute('readonly', '');
  await member.getByLabel('이름', { exact: true }).fill('김복지');
  await member.getByLabel('나이 (만 나이)').fill('67');
  await member.getByLabel('성별', { exact: true }).selectOption('female');
  await member.getByLabel('회원 거주 지역').selectOption('부산');
  await member.getByRole('button', { name: '회원 정보 저장' }).click();
  await expect(member.getByRole('status')).toContainText('저장했어요');
  await expect(page.getByText('김복지님', { exact: true })).toBeVisible();
  await page.reload();
  await expect(member.getByLabel('이름', { exact: true })).toHaveValue('김복지');
  await expect(member.getByLabel('나이 (만 나이)')).toHaveValue('67');
  await expect(member.getByLabel('회원 거주 지역')).toHaveValue('부산');
  await page.screenshot({ path: testInfo.outputPath('member-profile.png'), fullPage: true });
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(storage).not.toContain(password);
  expect(storage).not.toContain('bokji_session');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
});

test('duplicate check, edits, previous steps and mode switches preserve the wizard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockSignup(page);
  let submitted;
  await page.route('**/v1/auth/signup', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { message: '회원가입이 완료됐어요.' } });
  });
  await page.route('**/v1/auth/username/check', (route) =>
    route.fulfill({
      json: { available: route.request().postDataJSON().username !== 'taken_user' },
    }),
  );
  await startSignup(page);
  await page.getByRole('button', { name: '중복확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('아이디는');
  await page.getByLabel('아이디', { exact: true }).fill('taken_user');
  await page.getByRole('button', { name: '중복확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('이미 사용 중');
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
  await page.getByLabel('아이디', { exact: true }).fill('first_user');
  await page.getByRole('button', { name: '중복확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  await page.getByLabel('아이디', { exact: true }).fill('changed_user');
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '중복확인', exact: true }).click();
  await next(page);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue(password);
  await expect(page.getByLabel('아이디', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('changed_user');
  await next(page);
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue(password);
  await next(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  await next(page);
  await next(page);
  await expect(page.getByRole('alert')).toContainText('이름을');
  await page.getByLabel('이름', { exact: true }).fill('김복지');
  await next(page);
  await page.getByLabel('나이 (만 나이)').fill('121');
  await next(page);
  await expect(page.getByRole('alert')).toContainText('0~120');
  await page.getByLabel('나이 (만 나이)').fill('67');
  await next(page);
  await page.getByLabel('성별', { exact: true }).selectOption('undisclosed');
  await next(page);
  await page.getByLabel('거주 지역', { exact: true }).selectOption('부산');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('거주 지역', { exact: true })).toHaveValue('부산');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await next(page);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  expect(submitted).toEqual({
    username: 'changed_user',
    password,
    confirm_password: password,
    name: '김복지',
    age: 67,
    gender: 'undisclosed',
    region: '부산',
  });
});

test('final uniqueness conflict returns to username check and preserves entered info', async ({
  page,
}) => {
  await mockSignup(page, { signupStatus: 409 });
  await startSignup(page);
  await chooseUsername(page);
  await fillRemaining(page);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('이미 사용 중');
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('wizard_user');
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '중복확인', exact: true })).toBeEnabled();
});

test('login network failure is visible and focused', async ({ page }) => {
  await page.route('**/v1/auth/login', (route) => route.abort());
  await page.goto('/#login');
  await page.getByLabel('아이디', { exact: true }).fill('tester');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('연결이 원활하지 않습니다');
  await expect(page.getByRole('alert')).toBeFocused();
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
  await next(page);
  await page.getByLabel('나이 (만 나이)').fill('35');
  await next(page);
  await page.getByRole('combobox', { name: '성별', exact: true }).selectOption('undisclosed');
  await next(page);
  await page.getByRole('combobox', { name: '거주 지역', exact: true }).selectOption('서울');
  await next(page);
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
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
});

test('Kakao start rejects other sites and navigates to the expected authorization page', async ({
  page,
}) => {
  await page.route('**/v1/auth/kakao/status', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  let authorizationUrl = 'https://example.com/oauth/authorize';
  await page.route('**/v1/auth/kakao/start', (route) =>
    route.fulfill({ json: { authorization_url: authorizationUrl } }),
  );
  await page.route('https://kauth.kakao.com/oauth/authorize?**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>OAuth test destination</h1>' }),
  );
  await page.goto('/#signup');
  const button = page.getByRole('button', { name: '카카오톡으로 로그인/회원가입하기' });
  await button.click();
  await expect(page.getByRole('alert')).toContainText('로그인 주소');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page).toHaveURL(/#signup$/);
  authorizationUrl = 'https://kauth.kakao.com/oauth/authorize?client_id=synthetic&state=synthetic';
  await button.click();
  await expect(page).toHaveURL(authorizationUrl);
  await expect(page.getByRole('heading', { name: 'OAuth test destination' })).toBeVisible();
});

test('Kakao expiry at final submission preserves profile and requires a new login', async ({
  page,
}) => {
  await page.route('**/v1/auth/kakao/status', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route('**/v1/auth/kakao/pending', (route) =>
    route.fulfill({ json: { name: '카카오회원' } }),
  );
  let attempts = 0;
  await page.route('**/v1/auth/kakao/complete', (route) => {
    attempts += 1;
    return route.fulfill({
      status: 401,
      json: { detail: '카카오 인증이 만료됐어요. 다시 로그인해 주세요.' },
    });
  });
  await page.goto('/#signup?kakao=complete');
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('카카오회원');
  await next(page);
  await page.getByLabel('나이 (만 나이)').fill('35');
  await next(page);
  await page.getByLabel('성별', { exact: true }).selectOption('undisclosed');
  await next(page);
  await page.getByLabel('거주 지역', { exact: true }).selectOption('서울');
  await next(page);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('만료');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.locator('.signup-review')).toContainText('카카오회원');
  await expect(page.getByRole('button', { name: '회원가입', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '다른 카카오 계정으로 로그인' })).toBeEnabled();
  expect(attempts).toBe(1);
});

test('mode change during username lookup preserves the current step and checked value', async ({
  page,
}) => {
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/v1/auth/username/check', async (route) => {
    await ready;
    return route.fulfill({ json: { username: 'pending_user', available: true } });
  });
  await startSignup(page);
  await page.getByLabel('아이디', { exact: true }).fill('pending_user');
  const requested = page.waitForRequest('**/v1/auth/username/check');
  await page.getByRole('button', { name: '중복확인', exact: true }).click();
  await requested;
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('heading', { name: '사용할 아이디를 정해 주세요' })).toBeVisible();
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('pending_user');
  release();
  await expect(page.getByRole('button', { name: '중복확인 완료', exact: true })).toBeVisible();
  await next(page);
  await expect(page.getByRole('heading', { name: '비밀번호를 만들어 주세요' })).toBeFocused();
});
