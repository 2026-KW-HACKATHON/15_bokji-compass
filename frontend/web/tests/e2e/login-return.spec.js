import { test, expect } from '@playwright/test';

for (const destination of ['calculator-details', 'calculator', 'profile', 'https://example.com']) {
  test(`login returns to the supported input page (${destination})`, async ({ page }) => {
    await page.route('**/v1/auth/me', (route) =>
      route.fulfill({ status: 401, json: { detail: '로그인이 필요해요.' } }),
    );
    await page.route('**/v1/auth/kakao/status', (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route('**/v1/finance/profile', (route) =>
      route.fulfill({ json: { profile: null, calculation: null, updated_at: null } }),
    );
    await page.route('**/v1/auth/login', (route) =>
      route.fulfill({
        json: {
          user: {
            id: 'return-member',
            username: 'return_member',
            name: '계산회원',
            age: null,
            region: null,
            gender: 'undisclosed',
          },
        },
      }),
    );
    await page.goto('/#login?return=' + encodeURIComponent(destination));
    await page.getByLabel('아이디', { exact: true }).fill('return_member');
    await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    const expected = destination.startsWith('https:') ? 'home' : destination;
    await expect(page).toHaveURL(new RegExp(`#${expected}$`));
    await expect(page.getByText('계산회원님', { exact: true })).toHaveText('계산회원님');
  });
}
