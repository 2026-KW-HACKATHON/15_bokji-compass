import { test, expect } from '@playwright/test';
import { demoPolicies } from '../fixtures/policies.js';

const revision = '11111111-1111-1111-1111-111111111111';
const policy = { ...demoPolicies[0], revisionId: revision };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({
      json: { items: [policy], total: 1, nextCursor: null },
    }),
  );
});

test('guest question entry requires login', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/#explore');
  await page.getByRole('button', { name: policy.title, exact: true }).click();
  const section = page.getByRole('region', { name: '이 공고에 질문하기' });
  await expect(section.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
  await expect(section.getByRole('textbox')).toHaveCount(0);
});

test('member asks a grounded question and closing clears the conversation', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { user: { id: 'test-member', name: '테스트 회원', region: '서울', age: 27 } },
    }),
  );
  await page.route('**/api/v1/assistant/questions', (route) => {
    expect(route.request().postDataJSON()).toEqual({ revision_id: revision, question: '대상은?' });
    return route.fulfill({
      json: {
        revision_id: revision,
        status: 'grounded',
        answer: '지원 대상은 원문에서 확인할 수 있어요.',
        citations: [{ source_field: 'eligibility', quote: '신청자 만 19세 이상' }],
        follow_up_questions: ['신청 기간을 확인해 주세요.'],
        preview: false,
        eligibility_decided: false,
      },
    });
  });
  await page.goto('/#explore');
  await page.getByRole('button', { name: policy.title, exact: true }).click();
  await page.getByRole('textbox', { name: '궁금한 내용' }).fill('대상은?');
  await page.getByRole('button', { name: '질문 보내기' }).click();
  await expect(page.getByText('신청자 만 19세 이상', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: policy.title, exact: true }).click();
  await expect(page.getByRole('textbox', { name: '궁금한 내용' })).toHaveValue('');
  await expect(page.getByText('신청자 만 19세 이상', { exact: true })).toHaveCount(0);
});
