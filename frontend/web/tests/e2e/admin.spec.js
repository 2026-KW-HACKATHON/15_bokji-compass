import { test, expect } from '@playwright/test';

async function session(page, role) {
  await page.route('**/v1/admin/policies?**', (route) =>
    route.fulfill({ json: { items: [], total: 0, nextCursor: null } }),
  );
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: 'admin-test-id', name: '관리자', is_admin: Boolean(role), admin_role: role },
      },
    }),
  );
}

test('superadmin creates a QR administrator and handles revoked authority', async ({ page }) => {
  await session(page, 'superadmin');
  const items = [{ username: 'bokji_admin', role: 'superadmin', created_at: 1 }];
  let revoked = false;
  await page.route('**/v1/admin/accounts', async (route) => {
    if (revoked)
      return route.fulfill({
        status: 403,
        json: { detail: '최고 관리자만 관리자 계정을 관리할 수 있어요.' },
      });
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual(['confirm_password', 'password', 'username']);
      expect(route.request().headers()['x-auth-request']).toBe('1');
      items.push({ username: body.username, role: 'qr_admin', created_at: 2 });
      return route.fulfill({
        status: 201,
        json: { username: body.username, admin_role: 'qr_admin' },
      });
    }
    return route.fulfill({ json: { items } });
  });
  await page.goto('/#admin');
  await expect(page.getByRole('link', { name: '관리자 관리', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'QR 관리자 생성' })).toBeEnabled();
  await page.getByLabel('로그인 아이디').fill('qr_helper');
  await page.getByLabel('비밀번호', { exact: true }).fill('TestPassword42!');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('TestPassword42!');
  await page.getByRole('button', { name: 'QR 관리자 생성' }).click();
  await expect(page.getByRole('status')).toHaveText('qr_helper QR 관리자를 만들었습니다.');
  await expect(page.getByText('qr_helper · QR 관리자')).toBeVisible();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  revoked = true;
  await page.getByLabel('로그인 아이디').fill('next_helper');
  await page.getByLabel('비밀번호', { exact: true }).fill('TestPassword42!');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('TestPassword42!');
  await page.getByRole('button', { name: 'QR 관리자 생성' }).click();
  await expect(page.getByRole('alert')).toContainText('최고 관리자만');
  await expect(page.getByRole('button', { name: 'QR 관리자 생성' })).toBeDisabled();
  await expect(page.getByText('qr_helper · QR 관리자')).toHaveCount(0);
});

test('QR administrator has QR access but no management form even at a direct URL', async ({
  page,
}) => {
  await session(page, 'qr_admin');
  let calls = 0;
  await page.route('**/v1/admin/accounts', (route) => {
    calls++;
    return route.fulfill({ status: 403, json: {} });
  });
  await page.goto('/#admin');
  await expect(page.getByRole('link', { name: '전시 QR 관리', exact: true })).toBeVisible();
  await expect(page.getByText('최고 관리자 계정으로 로그인해 주세요.')).toBeVisible();
  await expect(page.getByRole('link', { name: '관리자 관리', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'QR 관리자 생성' })).toHaveCount(0);
  expect(calls).toBe(0);
});

test('ordinary member has neither administrator menu', async ({ page }) => {
  await session(page, null);
  await page.goto('/#admin');
  await expect(page.getByText('최고 관리자 계정으로 로그인해 주세요.')).toBeVisible();
  await expect(page.getByRole('link', { name: '전시 QR 관리', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '관리자 관리', exact: true })).toHaveCount(0);
});
