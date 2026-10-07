import { test, expect } from '@playwright/test';
import {
  addressPayload,
  mockPostcode,
  postcodeResults,
  selectPostcode,
} from '../fixtures/postcode.js';
import {
  acceptKakaoConsent,
  acceptSignupConsent,
  aiConsentLabel,
  consentVersion,
  expectedConsent,
  privacyNotice,
  profileConsentLabel,
  requiredConsentLabel,
} from '../fixtures/privacy-consent.js';

const password = 'ExamplePassword42!';
test.beforeEach(async ({ page }) => {
  await mockPostcode(page);
});
async function openBasics(page, recommendation = false) {
  await page.getByRole('tab', { name: '기본 정보', exact: true }).click();
  const edit = page.getByRole('button', { name: /^기본 정보 (추가|수정)$/ });
  if (await edit.count()) await edit.click();
  if (recommendation && (await page.getByRole('form', { name: '회원 정보 수정' }).count())) {
    const options = page.locator('.profile-recommendation-options');
    if ((await options.getAttribute('open')) === null) await options.locator('summary').click();
  }
}
const next = (page) => page.getByRole('button', { name: '다음', exact: true }).click();
async function startSignup(page, { profile = true } = {}) {
  await page.goto('/#signup');
  await acceptSignupConsent(page, { profile });
  await page.getByRole('button', { name: '아이디로 회원가입' }).click();
}
async function chooseUsername(page, username = 'wizard_user') {
  await page.getByLabel('아이디', { exact: true }).fill(username);
  await page.getByRole('button', { name: '중복확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  await next(page);
}
async function confirmEmail(page, email = 'wizard@example.com', actual = false) {
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByRole('button', { name: '인증번호 발송', exact: true }).click();
  await expect(page.getByLabel('이메일 인증번호', { exact: true })).toBeVisible();
  const code = actual
    ? (
        await (
          await page.request.get(`/api/__test/email-code?email=${encodeURIComponent(email)}`)
        ).json()
      ).code
    : '123456';
  await page.getByLabel('이메일 인증번호', { exact: true }).fill(code);
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  await next(page);
}
async function mockEmail(page) {
  await page.route('**/v1/auth/email/request', (route) =>
    route.fulfill({ json: { message: '인증번호를 보냈어요.', expires_in: 600, resend_after: 60 } }),
  );
  await page.route('**/v1/auth/email/verify', (route) =>
    route.fulfill({ json: { message: '이메일 인증이 완료됐어요.', expires_in: 600 } }),
  );
}
async function fillRemaining(page) {
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await next(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  await next(page);
  await confirmEmail(page);
  await page.getByLabel('이름', { exact: true }).fill('홍길동');
  await next(page);
  await page.getByLabel('나이 (만 나이)').fill('25');
  await next(page);
  await page.getByLabel('성별', { exact: true }).selectOption('undisclosed');
  await next(page);
  await selectPostcode(page, '서울');
  await next(page);
}
async function mockSignup(page, { signupStatus = 201 } = {}) {
  await mockEmail(page);
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

async function mockKakaoSignup(page, name = '카카오별명') {
  const state = { user: null, signupBodies: [], profileBodies: [] };
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({
      status: state.user ? 200 : 401,
      json: state.user ? { user: state.user } : { detail: '로그인이 필요해요.' },
    }),
  );
  await page.route('**/v1/auth/kakao/pending', (route) => route.fulfill({ json: { name } }));
  await page.route('**/v1/auth/kakao/complete', (route) => {
    state.signupBodies.push(route.request().postDataJSON());
    state.user = {
      id: 'kakao-test',
      username: 'k_test',
      email: route.request().postDataJSON().email,
      email_verified: false,
      name: route.request().postDataJSON().consent.profile ? name || null : null,
      age: null,
      gender: 'undisclosed',
      region: null,
    };
    return route.fulfill({ status: 201, json: { user: state.user } });
  });
  await page.route('**/v1/auth/profile', (route) => {
    const body = route.request().postDataJSON();
    state.profileBodies.push(body);
    state.user = { ...state.user, ...body };
    return route.fulfill({ json: { user: state.user } });
  });
  await page.route('**/v1/auth/logout', (route) => {
    state.user = null;
    return route.fulfill({ json: { message: '로그아웃했어요.' } });
  });
  return state;
}

async function mockAccountSwitch(page, nextUser) {
  let current = {
    id: 'member-a',
    username: 'member_a',
    name: '첫회원',
    age: 67,
    region: '서울',
    gender: 'undisclosed',
  };
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user: current } }));
  await page.route('**/v1/auth/logout', (route) => {
    current = null;
    return route.fulfill({ json: { message: '로그아웃했어요.' } });
  });
  await page.route('**/v1/auth/login', (route) => {
    current = {
      id: 'member-b',
      username: 'member_b',
      name: '다음회원',
      gender: 'undisclosed',
      ...nextUser,
    };
    return route.fulfill({ json: { user: current } });
  });
}

async function loginNextAccount(page) {
  await page.getByRole('link', { name: '로그인', exact: true }).first().click();
  await page.getByLabel('아이디', { exact: true }).fill('member_b');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByText('다음회원님', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '내 정보', exact: true }).first().click();
  await openBasics(page, true);
}

test('signup requires an explicit collection decision before opening signup methods', async ({
  page,
}) => {
  const requests = [];
  page.on('request', (request) => {
    if (
      /\/auth\/(signup|username\/check|email\/request|kakao\/start)$/.test(
        new URL(request.url()).pathname,
      )
    ) {
      requests.push(request.url());
    }
  });
  await page.goto('/#signup');
  await expect(
    page.getByRole('heading', { name: '개인정보 수집·이용 안내', exact: true }),
  ).toBeVisible();
  const required = page.getByRole('checkbox', { name: requiredConsentLabel, exact: true });
  const profile = page.getByRole('checkbox', { name: profileConsentLabel, exact: true });
  const proceed = page.getByRole('button', { name: '동의하고 가입 방법 선택', exact: true });
  await expect(required).not.toBeChecked();
  await expect(profile).not.toBeChecked();
  await expect(proceed).toBeDisabled();
  await expect(page.getByLabel('아이디', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('이메일', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '아이디로 회원가입' })).toHaveCount(0);
  const accountNotice = page.getByRole('region', { name: '회원가입 개인정보 안내', exact: true });
  await expect(accountNotice.locator('dt')).toHaveText([
    '수집 항목',
    '이용 목적',
    '보유 기간',
    '거부 권리',
  ]);
  await expect(accountNotice).toContainText('회원 탈퇴');
  await expect(accountNotice).toContainText(/(?:즉시|지체 없이) 삭제/);
  const aiNotice = page.getByRole('region', { name: 'AI 개인정보 처리 안내', exact: true });
  await expect(aiNotice).toContainText('질문 내용');
  await expect(aiNotice).toContainText('국외이전');
  await expect(page.getByRole('checkbox', { name: aiConsentLabel, exact: true })).toHaveCount(0);
  await page.getByText('관련 법령 확인', { exact: true }).click();
  await expect(page.getByRole('link', { name: '국가법령정보센터에서 법령 보기' })).toHaveAttribute(
    'href',
    'https://www.law.go.kr/법령/개인정보보호법',
  );
  await profile.check();
  await expect(proceed).toBeDisabled();
  await required.check();
  await expect(proceed).toBeEnabled();
  await required.uncheck();
  await expect(proceed).toBeDisabled();
  expect(requests).toEqual([]);
});

test('an outdated privacy notice blocks signup until a current notice is loaded', async ({
  page,
}) => {
  let current = false;
  await page.route('**/v1/auth/privacy-notice', (route) =>
    route.fulfill({
      json: { ...privacyNotice, version: current ? privacyNotice.version : '2026-01-01.1' },
    }),
  );
  await page.goto('/#signup');
  await expect(page.getByRole('alert')).toContainText('최신 개인정보 안내');
  await expect(
    page.getByRole('button', { name: '동의하고 가입 방법 선택', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: requiredConsentLabel, exact: true })).toHaveCount(
    0,
  );
  current = true;
  await page.getByRole('button', { name: '안내 다시 불러오기', exact: true }).click();
  await acceptSignupConsent(page);
  await expect(page.getByRole('button', { name: '아이디로 회원가입' })).toBeVisible();
});

test('external AI consent is a separate opt-in recorded with its notice version', async ({
  page,
}) => {
  const aiVersion = 'ai-test-notice.1';
  await page.route('**/v1/auth/privacy-notice', (route) =>
    route.fulfill({
      json: {
        ...privacyNotice,
        ai: {
          enabled: true,
          notice_version: aiVersion,
          provider_name: '테스트 AI 처리 업체',
          contact: 'processor@example.com',
          countries: ['미국'],
          purpose: '사용자 질문에 대한 복지 안내 답변 생성',
          items: ['질문 내용', '지역', '연령대'],
          transfer_time: '사용자가 질문을 전송하는 시점',
          transfer_method: '암호화된 통신',
          retention: '테스트용 보유 기간',
          training: '모델 학습에 사용하지 않음',
        },
      },
    }),
  );
  await mockSignup(page);
  let submitted;
  await page.route('**/v1/auth/signup', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { message: '회원가입이 완료됐어요.' } });
  });
  await page.goto('/#signup');
  const aiChoice = page.getByRole('checkbox', { name: aiConsentLabel, exact: true });
  await expect(aiChoice).not.toBeChecked();
  const aiNotice = page.getByRole('region', { name: 'AI 개인정보 처리 안내', exact: true });
  await expect(aiNotice).toContainText('테스트 AI 처리 업체');
  await expect(aiNotice).toContainText('미국');
  await expect(aiNotice).toContainText('모델 학습에 사용하지 않음');
  await aiChoice.check();
  await expect(
    page.getByRole('button', { name: '동의하고 가입 방법 선택', exact: true }),
  ).toBeDisabled();
  await acceptSignupConsent(page);
  await page.getByRole('button', { name: '아이디로 회원가입' }).click();
  await chooseUsername(page, 'ai_optin_user');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await next(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  await next(page);
  await confirmEmail(page);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  expect(submitted.consent).toEqual({
    ...expectedConsent(false, true),
    ai_notice_version: aiVersion,
  });
});

test('declining optional profile and AI consent still allows ID signup without demographics', async ({
  page,
}) => {
  await mockSignup(page);
  let submitted;
  await page.route('**/v1/auth/signup', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { message: '회원가입이 완료됐어요.' } });
  });
  await startSignup(page, { profile: false });
  await chooseUsername(page, 'minimal_user');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await next(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  await next(page);
  await confirmEmail(page);
  await expect(page.getByRole('heading', { name: '가입 정보를 확인해 주세요' })).toBeVisible();
  for (const label of ['이름', '나이 (만 나이)', '성별', '거주 지역']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  expect(submitted).toEqual({
    username: 'minimal_user',
    email: 'wizard@example.com',
    password,
    confirm_password: password,
    name: null,
    age: null,
    gender: 'undisclosed',
    region: null,
    postal_code: null,
    address: null,
    address_detail: null,
    consent: expectedConsent(),
  });
});

test('Kakao callback requires our notice consent and accepts optional refusal', async ({
  page,
}) => {
  const state = await mockKakaoSignup(page);
  await page.goto('/#signup?kakao=complete');
  await expect(
    page.getByRole('heading', { name: '개인정보 수집·이용 안내', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '동의하고 가입 계속하기', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('이메일', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '가입하고 시작하기' })).toHaveCount(0);
  expect(state.signupBodies).toEqual([]);
  await acceptKakaoConsent(page);
  await page.getByLabel('이메일', { exact: true }).fill('minimal-kakao@example.com');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page).toHaveURL(/#home$/);
  expect(state.signupBodies).toEqual([
    { email: 'minimal-kakao@example.com', consent: expectedConsent() },
  ]);
  expect(state.profileBodies).toEqual([]);
});

for (const nextUser of [
  { age: 25, region: '부산' },
  { age: null, region: null },
]) {
  test(`member recommendations clear on logout and belong to the next account (${nextUser.region || 'unset'})`, async ({
    page,
  }) => {
    await mockAccountSwitch(page, nextUser);
    await page.goto('/#profile');
    await expect(page.getByText('첫회원님', { exact: true })).toBeVisible();
    await openBasics(page, true);
    const recommendation = page.getByRole('region', { name: '지역과 연령' });
    await expect(recommendation.getByLabel('거주 지역')).toHaveValue('서울');
    await expect(recommendation.getByLabel('연령대 (선택)')).toHaveValue('65세 이상');
    expect(await page.evaluate(() => localStorage.getItem('bokji.profile.v2'))).toBeNull();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByRole('link', { name: '내 정보', exact: true }).first().click();
    await openBasics(page, true);
    await expect(recommendation.getByLabel('거주 지역')).toHaveValue('전국');
    await expect(recommendation.getByLabel('연령대 (선택)')).toHaveValue('선택하지 않음');
    await loginNextAccount(page);
    await expect(recommendation.getByLabel('거주 지역')).toHaveValue(nextUser.region || '전국');
    await expect(recommendation.getByLabel('연령대 (선택)')).toHaveValue(
      nextUser.age == null ? '선택하지 않음' : '19~34세',
    );
    expect(await page.evaluate(() => localStorage.getItem('bokji.profile.v2'))).toBeNull();
  });
}

for (const remember of [false, true]) {
  test(`explicit recommendation edits honor browser storage consent across accounts (${remember})`, async ({
    page,
  }) => {
    await mockAccountSwitch(page, { age: 25, region: '부산' });
    await page.goto('/#profile');
    await expect(page.getByText('첫회원님', { exact: true })).toBeVisible();
    await openBasics(page, true);
    const recommendation = page.getByRole('region', { name: '지역과 연령' });
    await recommendation.getByLabel('거주 지역').selectOption('제주');
    await recommendation.getByLabel('연령대 (선택)').selectOption('35~49세');
    await page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' }).setChecked(remember);
    await page.getByRole('button', { name: '정보 저장', exact: true }).click();
    await openBasics(page, true);
    const saved = await page.evaluate(() => localStorage.getItem('bokji.profile.v2'));
    if (remember) expect(JSON.parse(saved)).toMatchObject({ region: '제주', ageBand: '35~49세' });
    else expect(saved).toBeNull();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByRole('link', { name: '내 정보', exact: true }).first().click();
    await openBasics(page, true);
    await expect(recommendation.getByLabel('거주 지역')).toHaveValue(remember ? '제주' : '전국');
    await loginNextAccount(page);
    await expect(recommendation.getByLabel('거주 지역')).toHaveValue(remember ? '제주' : '부산');
    await expect(recommendation.getByLabel('연령대 (선택)')).toHaveValue(
      remember ? '35~49세' : '19~34세',
    );
    await page.reload();
    await expect(page.getByText('다음회원님', { exact: true })).toBeVisible();
    await openBasics(page, true);
    await expect(recommendation.getByLabel('거주 지역')).toHaveValue(remember ? '제주' : '부산');
    await expect(page.getByRole('checkbox', { name: '이 브라우저에 내 정보 저장' })).toBeChecked({
      checked: remember,
    });
  });
}

test('phone-free signup, DB username check, login, member edit, reload and logout', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const suffix = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 10));
  const username = 'user_' + suffix;
  await page.goto('/#signup');
  await acceptSignupConsent(page, { profile: true });
  await expect(
    page.getByRole('button', { name: '카카오톡으로 로그인/회원가입하기' }),
  ).toBeDisabled();
  await expect(page.getByText('카카오 로그인을 준비 중이에요.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('아이디', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('signup-method.png'), fullPage: true });
  await page.getByRole('button', { name: '아이디로 회원가입' }).click();
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
  await confirmEmail(page, `${username}@example.com`, true);
  await page.getByLabel('이름', { exact: true }).fill('홍길동');
  await next(page);
  await page.getByLabel('나이 (만 나이)').fill('25');
  await next(page);
  await page.getByLabel('성별', { exact: true }).selectOption('undisclosed');
  await next(page);
  await selectPostcode(page, '서울');
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
  await openBasics(page);
  const member = page.getByRole('form', { name: '회원 정보 수정' });
  await expect(member.getByLabel('아이디', { exact: true })).toHaveValue(username);
  await expect(member.getByLabel('이메일', { exact: true })).toHaveValue(`${username}@example.com`);
  await expect(member.getByLabel('아이디', { exact: true })).toHaveAttribute('readonly', '');
  await member.getByLabel('이름', { exact: true }).fill('김복지');
  await member.getByLabel('나이 (만 나이)').fill('67');
  await member.getByLabel('성별', { exact: true }).selectOption('female');
  await selectPostcode(member, '부산');
  await member.getByRole('button', { name: '회원 정보 저장' }).click();
  await expect(page.getByRole('status')).toContainText('기본 정보를 저장했어요');
  await expect(page.getByText('김복지님', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('김복지님', { exact: true })).toBeVisible();
  await openBasics(page);
  await expect(member.getByLabel('이름', { exact: true })).toHaveValue('김복지');
  await expect(member.getByLabel('나이 (만 나이)')).toHaveValue('67');
  await expect(member.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.부산.roadAddress,
  );
  await page.screenshot({ path: testInfo.outputPath('member-profile.png'), fullPage: true });
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(storage).not.toContain(password);
  expect(storage).not.toContain('bokji_session');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
});

test('account withdrawal requires confirmation, ends the session and releases the username', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const username =
    'delete_' + String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 10));
  async function signup(email) {
    await startSignup(page, { profile: false });
    await chooseUsername(page, username);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await next(page);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await next(page);
    await confirmEmail(page, email, true);
    await page.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  }
  async function login() {
    await page.getByRole('link', { name: '로그인하러 가기' }).click();
    await page.getByLabel('아이디', { exact: true }).fill(username);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByText('회원님', { exact: true })).toBeVisible();
  }

  await signup(`${username}@example.com`);
  await login();
  const before = await page.request.get('/api/v1/auth/me');
  expect(before.status()).toBe(200);
  const firstAccount = (await before.json()).user;
  const storedKeys = ['bokji.profile.v2', 'bokji.saved.v2.api', 'bokji.saved.v2.demo'];
  await page.evaluate((keys) => {
    localStorage.setItem(
      keys[0],
      JSON.stringify({ region: '서울', ageBand: '19~34세', interests: [] }),
    );
    for (const key of keys.slice(1))
      localStorage.setItem(key, JSON.stringify(['withdrawal-fixture']));
  }, storedKeys);
  await page.goto('/#profile');
  await openBasics(page);
  await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click();
  const confirmation = page.getByRole('checkbox', {
    name: '삭제되는 정보를 확인했고 회원 탈퇴에 동의합니다.',
    exact: true,
  });
  const withdraw = page.getByRole('button', { name: '탈퇴하고 개인정보 삭제', exact: true });
  await expect(confirmation).not.toBeChecked();
  await expect(withdraw).toBeDisabled();
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
  await confirmation.check();
  await expect(withdraw).toBeEnabled();
  await page
    .locator('.account-withdrawal')
    .screenshot({ path: testInfo.outputPath('withdrawal-review-panel.png') });
  await page.screenshot({ path: testInfo.outputPath('withdrawal-review.png'), fullPage: true });
  const request = page.waitForRequest('**/v1/auth/withdraw');
  await withdraw.click();
  expect((await request).postDataJSON()).toEqual({
    notice_version: consentVersion,
    confirmation: true,
  });
  await expect(page.getByRole('link', { name: '로그인', exact: true }).first()).toBeVisible();
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  expect(
    await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), storedKeys),
  ).toEqual([null, null, null]);
  await page.reload();
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);

  await signup(`${username}-rejoin@example.com`);
  await login();
  const after = await page.request.get('/api/v1/auth/me');
  expect(after.status()).toBe(200);
  const rejoinedAccount = (await after.json()).user;
  expect(rejoinedAccount.username).toBe(username);
  expect(rejoinedAccount.id).not.toBe(firstAccount.id);
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
  await confirmEmail(page);
  await page.getByLabel('이름', { exact: true }).fill('김복지');
  await next(page);
  await page.getByLabel('나이 (만 나이)').fill('121');
  await next(page);
  await expect(page.getByRole('alert')).toContainText('0~120');
  await page.getByLabel('나이 (만 나이)').fill('67');
  await next(page);
  await page.getByLabel('성별', { exact: true }).selectOption('undisclosed');
  await next(page);
  await selectPostcode(page, '부산');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.부산.roadAddress,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await next(page);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('회원가입이 완료');
  expect(submitted).toEqual({
    username: 'changed_user',
    email: 'wizard@example.com',
    password,
    confirm_password: password,
    name: '김복지',
    age: 67,
    gender: 'undisclosed',
    ...addressPayload('부산'),
    consent: expectedConsent(true),
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

test('email errors, address edits and expired signup proof require verification', async ({
  page,
}, testInfo) => {
  await mockSignup(page);
  await startSignup(page);
  await chooseUsername(page);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await next(page);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  await next(page);
  await page.getByRole('button', { name: '인증번호 발송', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('올바른 이메일');
  await page.route('**/v1/auth/email/request', (route) =>
    route.fulfill({ status: 503, json: { detail: '인증 메일 발송 설정이 필요해요.' } }),
  );
  await page.getByLabel('이메일', { exact: true }).fill('wizard@example.com');
  await page.getByRole('button', { name: '인증번호 발송', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('설정이 필요');
  await mockEmail(page);
  await page.getByRole('button', { name: '인증번호 발송', exact: true }).click();
  await expect(page.getByRole('button', { name: /재발송까지/ })).toBeDisabled();
  await page.route('**/v1/auth/email/verify', (route) =>
    route.fulfill({ status: 400, json: { detail: '인증번호를 확인해 주세요.' } }),
  );
  await page.getByLabel('이메일 인증번호', { exact: true }).fill('111111');
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('인증번호를 확인');
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
  await mockEmail(page);
  await page.getByLabel('이메일 인증번호', { exact: true }).fill('123456');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await page.screenshot({ path: testInfo.outputPath('email-verification.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeEnabled();
  await page.getByLabel('이메일', { exact: true }).fill('changed@example.com');
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
  await expect(page.getByLabel('이메일 인증번호', { exact: true })).toHaveCount(0);
});

test('expired proof at final signup returns to email without clearing other fields', async ({
  page,
}) => {
  await mockSignup(page);
  await page.route('**/v1/auth/signup', (route) =>
    route.fulfill({
      status: 401,
      json: { detail: '이메일 인증이 만료됐어요. 다시 인증해 주세요.' },
    }),
  );
  await startSignup(page);
  await chooseUsername(page);
  await fillRemaining(page);
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('heading', { name: '이메일을 인증해 주세요' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('만료');
  await expect(page.getByLabel('이메일', { exact: true })).toHaveValue('wizard@example.com');
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
});

test('Kakao signup requires valid email before creating an account', async ({ page }) => {
  const state = await mockKakaoSignup(page);
  await page.goto('/#signup?kakao=complete');
  await acceptKakaoConsent(page, { profile: true });
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page.getByRole('alert')).toContainText('올바른 이메일');
  expect(state.signupBodies).toEqual([]);
  await page.getByLabel('이메일', { exact: true }).fill('missing-at');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  expect(state.signupBodies).toEqual([]);
  await page.getByLabel('이메일', { exact: true }).fill('Kakao@Example.com');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page).toHaveURL(/#profile\?setup=1$/);
  expect(state.signupBodies).toEqual([
    { email: 'kakao@example.com', consent: expectedConsent(true) },
  ]);
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

for (const name of ['카카오별명', '']) {
  test(`Kakao signup without profile supports skipping and reload (${name || 'no nickname'})`, async ({
    page,
  }, testInfo) => {
    const state = await mockKakaoSignup(page, name);
    await page.goto('/#signup?kakao=complete');
    await acceptKakaoConsent(page, { profile: true });
    await expect(page.getByRole('button', { name: '가입하고 시작하기' })).toBeEnabled();
    await expect(
      page.locator('.auth-card input:not([type="checkbox"]), .auth-card select'),
    ).toHaveCount(1);
    await expect(page.getByRole('button', { name: '다른 카카오 계정으로 로그인' })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('kakao-signup.png'), fullPage: true });
    await page.getByLabel('이메일', { exact: true }).fill('Kakao@Example.com');
    await page.getByRole('button', { name: '가입하고 시작하기' }).click();
    await expect(page.getByText(`${name || '회원'}님`, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#profile\?setup=1$/);
    const setup = page.getByRole('form', { name: '맞춤 정보 설정' });
    await expect(setup.getByLabel('나이 (만 나이)')).toHaveValue('');
    await expect(setup.getByLabel('기본 주소', { exact: true })).toHaveValue('');
    await expect(setup.getByLabel('이름', { exact: true })).toHaveCount(0);
    await expect(setup.getByLabel('성별', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'AI 챗봇 열기' })).toHaveCount(0);
    await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath('kakao-optional-setup.png'),
      fullPage: true,
    });
    await setup.getByLabel('나이 (만 나이)').fill('35');
    await setup.getByRole('link', { name: '나중에 하기' }).click();
    await expect(page).toHaveURL(/#home$/);
    expect(state.signupBodies).toEqual([
      { email: 'kakao@example.com', consent: expectedConsent(true) },
    ]);
    expect(state.profileBodies).toEqual([]);
    await page.reload();
    await expect(page.getByText(`${name || '회원'}님`, { exact: true })).toBeVisible();
    await page.getByRole('link', { name: '내 정보', exact: true }).first().click();
    await openBasics(page, true);
    await openBasics(page);
    const member = page.getByRole('form', { name: '회원 정보 수정' });
    await expect(member.getByLabel('이름', { exact: true })).toHaveValue(name);
    await expect(member.getByLabel('나이 (만 나이)')).toHaveValue('');
    await expect(member.getByLabel('기본 주소', { exact: true })).toHaveValue('');
    await member.getByRole('button', { name: '회원 정보 저장' }).click();
    await expect(page.getByRole('status')).toContainText('기본 정보를 저장했어요');
    expect(state.profileBodies).toEqual([
      {
        name: name || null,
        age: null,
        gender: 'undisclosed',
        region: null,
        postal_code: null,
        address: null,
        address_detail: null,
      },
    ]);
  });
}

test('Kakao optional setup validates, saves once and supplies recommendation settings', async ({
  page,
}) => {
  const state = await mockKakaoSignup(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#signup?kakao=complete');
  await acceptKakaoConsent(page, { profile: true });
  await page.getByLabel('이메일', { exact: true }).fill('Kakao@Example.com');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  const setup = page.getByRole('form', { name: '맞춤 정보 설정' });
  await setup.getByLabel('나이 (만 나이)').fill('121');
  await setup.getByRole('button', { name: '저장하고 시작하기' }).click();
  await expect(setup.getByRole('alert')).toContainText('0~120');
  await expect(setup.getByRole('alert')).toBeFocused();
  expect(state.profileBodies).toEqual([]);
  await setup.getByLabel('나이 (만 나이)').fill('35');
  await selectPostcode(setup, '부산');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(setup.getByLabel('나이 (만 나이)')).toHaveValue('35');
  await expect(setup.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.부산.roadAddress,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await setup.getByRole('button', { name: '저장하고 시작하기' }).click();
  await expect(page).toHaveURL(/#home$/);
  expect(state.signupBodies).toEqual([
    { email: 'kakao@example.com', consent: expectedConsent(true) },
  ]);
  expect(state.profileBodies).toEqual([{ age: 35, ...addressPayload('부산') }]);
  await page.getByRole('link', { name: '내 정보', exact: true }).first().click();
  await openBasics(page, true);
  await expect(page.getByLabel('연령대 (선택)')).toHaveValue('35~49세');
  await expect(
    page.getByRole('region', { name: '지역과 연령' }).getByLabel('거주 지역'),
  ).toHaveValue('부산');
  await openBasics(page);
  const member = page.getByRole('form', { name: '회원 정보 수정' });
  await expect(member.getByLabel('나이 (만 나이)')).toHaveValue('35');
  await expect(member.getByLabel('이름', { exact: true })).toHaveValue('카카오별명');
  await page.reload();
  await expect(page.getByText('카카오별명님', { exact: true })).toBeVisible();
  await openBasics(page, true);
  await expect(member.getByLabel('나이 (만 나이)')).toHaveValue('35');
  await expect(member.getByLabel('기본 주소', { exact: true })).toHaveValue(
    postcodeResults.부산.roadAddress,
  );
  await expect(page.getByLabel('연령대 (선택)')).toHaveValue('35~49세');
  await expect(
    page.getByRole('region', { name: '지역과 연령' }).getByLabel('거주 지역'),
  ).toHaveValue('부산');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('link', { name: '내 정보', exact: true }).first().click();
  await openBasics(page, true);
  await expect(page.getByLabel('연령대 (선택)')).toHaveValue('선택하지 않음');
  await expect(
    page.getByRole('region', { name: '지역과 연령' }).getByLabel('거주 지역'),
  ).toHaveValue('전국');
  expect(await page.evaluate(() => localStorage.getItem('bokji.profile.v2'))).toBeNull();
});

test('Kakao signup cancellation returns to the initial method screen', async ({ page }) => {
  await mockKakaoSignup(page);
  let cancellations = 0;
  await page.route('**/v1/auth/kakao/cancel', (route) => {
    cancellations += 1;
    return route.fulfill({ json: { message: '가입 방법을 다시 선택해 주세요.' } });
  });
  await page.goto('/#signup?kakao=complete');
  await acceptKakaoConsent(page);
  await page.getByRole('button', { name: '가입 방법 다시 선택' }).click();
  await expect(page).toHaveURL(/#signup$/);
  await expect(
    page.getByRole('heading', { name: '개인정보 수집·이용 안내', exact: true }),
  ).toBeVisible();
  await acceptSignupConsent(page);
  await expect(page.getByRole('heading', { name: '가입 방법을 선택해 주세요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '아이디로 회원가입' })).toBeVisible();
  await expect(page.getByLabel('이름', { exact: true })).toHaveCount(0);
  expect(cancellations).toBe(1);
});

test('expired Kakao signup requires a new login', async ({ page }) => {
  await page.route('**/v1/auth/kakao/pending', (route) =>
    route.fulfill({
      status: 401,
      json: { detail: '카카오 인증이 만료됐어요. 다시 로그인해 주세요.' },
    }),
  );
  await page.goto('/#signup?kakao=complete');
  await acceptKakaoConsent(page);
  await expect(page.getByRole('alert')).toContainText('만료');
  await expect(page.getByRole('button', { name: '가입하고 시작하기' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '가입 방법 다시 선택' })).toBeEnabled();
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
  await acceptSignupConsent(page);
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

test('Kakao expiry at completion requires returning to login methods', async ({ page }) => {
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
  await acceptKakaoConsent(page, { profile: true });
  await expect(page.getByRole('button', { name: '가입하고 시작하기' })).toBeEnabled();
  await page.getByLabel('이메일', { exact: true }).fill('Kakao@Example.com');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page.getByRole('alert')).toContainText('만료');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('button', { name: '가입하고 시작하기' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '가입 방법 다시 선택' })).toBeEnabled();
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
