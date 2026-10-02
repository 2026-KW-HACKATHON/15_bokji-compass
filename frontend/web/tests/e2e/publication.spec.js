import { test, expect } from '@playwright/test';
import { demoPolicies } from '../fixtures/policies.js';

const revisionId = '11111111-1111-4111-8111-111111111111';
const policy = { ...demoPolicies[0], revisionId };
async function fixture(page) {
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: 'test-admin', name: '관리자', admin_role: 'superadmin', is_admin: true },
      },
    }),
  );
  await page.route('**/v1/admin/accounts', (route) => route.fulfill({ json: { items: [] } }));
  const state = { status: 'draft', revoked: false, conflict: false, wait: null };
  const summary = () => ({
    revisionId,
    policyKey: policy.id,
    title: policy.title,
    category: policy.category,
    reviewStatus: state.status,
    createdAt: '2026-10-01T08:00:00',
    canPublish: true,
    warnings: ['신청 기간은 공식 원문에서 확인해 주세요.'],
  });
  await page.route('**/v1/admin/policies?**', (route) =>
    route.fulfill({
      json: {
        autoPublish: true,
        items: [summary()],
        total: 1,
        nextCursor: null,
      },
    }),
  );
  await page.route(`**/v1/admin/policies/${revisionId}`, (route) =>
    route.fulfill({
      json: {
        ...summary(),
        preview: policy,
        sourceFields: { eligibility: '신청자 만 19세 이상' },
        history: [],
      },
    }),
  );
  await page.route(`**/v1/admin/policies/${revisionId}/publication`, async (route) => {
    if (state.wait) await state.wait;
    if (state.revoked)
      return route.fulfill({ status: 403, json: { detail: '최고 관리자만 공개할 수 있어요.' } });
    if (state.conflict)
      return route.fulfill({
        status: 409,
        json: { detail: '공개 상태가 변경되었습니다. 다시 불러와 주세요.' },
      });
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual(['action', 'expected_status', 'note']);
    expect(body.expected_status).toBe(state.status);
    expect(route.request().headers()['x-auth-request']).toBe('1');
    state.status = body.action === 'publish' ? 'published' : 'reviewed';
    return route.fulfill({
      json: { revisionId, reviewStatus: state.status, matchingEnabled: false },
    });
  });
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({
      json: {
        items: state.status === 'published' ? [policy] : [],
        total: state.status === 'published' ? 1 : 0,
        nextCursor: null,
      },
    }),
  );
  return state;
}

test('review, publish and withdraw update public explorer; pending mutation keeps dialog open', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto('/#admin');
  await expect(page.getByText('기본 승인 방식: 자동 승인.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /공고 검토/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const publish = page.getByRole('button', { name: '검토한 공고 공개', exact: true });
  await expect(publish).toBeDisabled();
  await expect(page.getByText('신청 기간은 공식 원문에서 확인해 주세요.')).toBeVisible();
  await page.getByText('수집 원문 확인', { exact: true }).click();
  await expect(page.getByText('신청자 만 19세 이상', { exact: true })).toBeVisible();
  await page.getByLabel('원문과 확인 필요한 내용을 검토했습니다.').check();
  await page.getByLabel('검토 메모 (선택)').fill('원문 검토 완료');
  let release;
  state.wait = new Promise((resolve) => {
    release = resolve;
  });
  await publish.click();
  await expect(page.getByRole('button', { name: '변경 중…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  release();
  await expect(page.getByText('공고를 공개했습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/#explore');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.goto('/#admin');
  await page.getByRole('button', { name: /공고 검토/ }).click();
  await page.getByRole('button', { name: '비공개로 전환', exact: true }).click();
  await expect(page.getByText('공고를 비공개로 전환했습니다.', { exact: true })).toBeVisible();
  await page.goto('/#explore');
  await expect(page.getByText('조건에 맞는 공고가 없어요')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('stale status requires reload and revoked authority removes review controls', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto('/#admin');
  await page.getByRole('button', { name: /공고 검토/ }).click();
  await page.getByLabel('원문과 확인 필요한 내용을 검토했습니다.').check();
  state.conflict = true;
  await page.getByRole('button', { name: '검토한 공고 공개', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('공개 상태가 변경');
  await expect(page.getByRole('button', { name: '검토한 공고 공개', exact: true })).toHaveCount(0);
  state.conflict = false;
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await page.getByLabel('원문과 확인 필요한 내용을 검토했습니다.').check();
  state.revoked = true;
  await page.getByRole('button', { name: '검토한 공고 공개', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('최고 관리자 계정으로 다시 로그인해 주세요.')).toBeVisible();
  await expect(page.getByRole('button', { name: /공고 검토/ })).toHaveCount(0);
});
