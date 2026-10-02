import { test, expect } from '@playwright/test';
import { demoPolicies } from '../fixtures/policies.js';

const revision = '11111111-1111-1111-1111-111111111111';
const policy = { ...demoPolicies[0], revisionId: revision };
const faqItems = [
  '어떤 지원을 받을 수 있나요?',
  '누가 신청할 수 있나요?',
  '언제까지 신청하나요?',
  '어떻게 신청하나요?',
  '어떤 서류를 준비하나요?',
  '저도 지원받을 수 있나요?',
].map((question, index) => ({
  id: String(index),
  question,
  response: {
    revision_id: revision,
    status: 'insufficient_source',
    answer:
      index === 0 ? '준비된 지원 내용 안내입니다.' : '공식 공고 또는 담당 기관에서 확인해 주세요.',
    citations: [],
    follow_up_questions: [],
    preview: false,
    eligibility_decided: false,
    response_type: 'prepared',
  },
}));

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/assistant/faqs?**', (route) =>
    route.fulfill({
      json: { revision_id: revision, items: faqItems },
    }),
  );
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
  await page.getByText('원문 근거 보기', { exact: true }).click();
  await expect(page.getByText('신청자 만 19세 이상', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: policy.title, exact: true }).click();
  await expect(page.getByRole('textbox', { name: '궁금한 내용' })).toHaveValue('');
  await expect(page.getByText('신청자 만 19세 이상', { exact: true })).toHaveCount(0);
});

test('choosing prepared questions shows immediate replies without model requests', async ({
  page,
}, testInfo) => {
  let modelRequests = 0;
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { user: { id: 'test-member', name: '테스트 회원', region: '서울', age: 27 } },
    }),
  );
  page.on('request', (request) => {
    if (request.url().endsWith('/assistant/questions')) modelRequests++;
  });
  await page.goto('/#explore');
  await page.getByRole('button', { name: policy.title, exact: true }).click();
  const choices = page.getByRole('group', { name: '자주 묻는 질문' });
  await expect(choices.getByRole('button')).toHaveCount(6);
  await choices.getByRole('button', { name: faqItems[0].question }).click();
  await expect(page.getByText('준비된 지원 내용 안내입니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '질문 답변', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('faq.png') });
  await page.getByRole('button', { name: '다른 질문 고르기' }).click();
  await expect(choices.getByRole('button', { name: faqItems[0].question })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await choices.getByRole('button', { name: faqItems[4].question }).click();
  await expect(
    page.getByText('공식 공고 또는 담당 기관에서 확인해 주세요.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('준비된 지원 내용 안내입니다.', { exact: true })).toHaveCount(0);
  expect(modelRequests).toBe(0);
});

test('failed FAQ load can retry while free text stays available', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { user: { id: 'test-member', name: '테스트 회원' } },
    }),
  );
  let available = false;
  await page.route('**/api/v1/assistant/faqs?**', (route) =>
    !available
      ? route.fulfill({ status: 503, json: { detail: '일시 오류' } })
      : route.fulfill({ json: { revision_id: revision, items: faqItems } }),
  );
  await page.goto('/#explore');
  await page.getByRole('button', { name: policy.title, exact: true }).click();
  await expect(page.getByRole('textbox', { name: '궁금한 내용' })).toBeVisible();
  await expect(page.getByRole('button', { name: '기본 질문 다시 불러오기' })).toBeVisible();
  available = true;
  await page.getByRole('button', { name: '기본 질문 다시 불러오기' }).click();
  await expect(page.getByRole('group', { name: '자주 묻는 질문' }).getByRole('button')).toHaveCount(
    6,
  );
});

test('a prepared choice replaces a pending free-text request', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { user: { id: 'test-member', name: '테스트 회원' } },
    }),
  );
  let deliver;
  const started = new Promise((resolve) => {
    deliver = resolve;
  });
  await page.route('**/api/v1/assistant/questions', (route) => {
    deliver(route);
  });
  await page.goto('/#explore');
  await page.getByRole('button', { name: policy.title, exact: true }).click();
  await page.getByRole('textbox', { name: '궁금한 내용' }).fill('지원 내용?');
  await page.getByRole('button', { name: '질문 보내기' }).click();
  const pending = await started;
  await page
    .getByRole('group', { name: '자주 묻는 질문' })
    .getByRole('button', { name: faqItems[0].question })
    .click();
  await pending
    .fulfill({
      json: { ...faqItems[0].response, answer: '늦게 도착한 답변', response_type: undefined },
    })
    .catch(() => {});
  await expect(page.getByText('준비된 지원 내용 안내입니다.', { exact: true })).toBeVisible();
  await expect(page.getByText('늦게 도착한 답변', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '질문 보내기' })).toBeEnabled();
});
