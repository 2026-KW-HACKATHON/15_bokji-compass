import { test, expect } from '@playwright/test';
import { demoPolicies } from '../fixtures/policies.js';

const revision = '11111111-1111-1111-1111-111111111111';
const policy = { ...demoPolicies[0], revisionId: revision };
const faqItems = [
  ['benefits', '어떤 지원을 받을 수 있나요?'],
  ['eligibility', '누가 신청할 수 있나요?'],
  ['period', '언제까지 신청하나요?'],
  ['application', '어떻게 신청하나요?'],
  ['documents', '어떤 서류를 준비하나요?'],
  ['qualification', '신청 전에 무엇을 확인해야 하나요?'],
].map(([id, question]) => ({
  id,
  question,
  response: {
    revision_id: revision,
    status: 'grounded',
    answer: `${question}에 대한 원문 안내입니다.`,
    citations: [{ source_field: 'benefits', quote: '공고 원문 근거' }],
    follow_up_questions: [],
    preview: false,
    eligibility_decided: false,
    response_type: 'prepared',
  },
}));

async function mock(page, member = false) {
  await page.route('**/api/v1/auth/me', (route) =>
    member
      ? route.fulfill({
          json: { user: { id: 'assistant-member', name: '시험 회원', region: '서울', age: 27 } },
        })
      : route.fulfill({ status: 401, json: {} }),
  );
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [policy], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v1/assistant/faqs?**', (route) =>
    route.fulfill({ json: { revision_id: revision, items: faqItems } }),
  );
}
const open = async (page) => {
  await page.getByRole('button', { name: 'AI 챗봇 열기' }).click();
  return page.getByRole('dialog', { name: '복지나침반 AI 챗봇' });
};

test('guests can read fixed guidance and navigate without assistant API calls', async ({
  page,
}, testInfo) => {
  await mock(page);
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/assistant/')) requests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.sidebar-note')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('assistant-launcher.png') });
  const panel = await open(page);
  await page.screenshot({ path: testInfo.outputPath('assistant-menu.png') });
  await panel.getByRole('button', { name: /이용 방법이 궁금해요/ }).click();
  await panel.getByRole('button', { name: '저장한 공고는 어디에 보관되나요?' }).click();
  await expect(panel.getByText(/지금 사용하는 브라우저에 보관/)).toBeVisible();
  await panel.getByRole('button', { name: '저장한 공고 열기' }).click();
  await expect(page).toHaveURL(/#saved$/);
  await expect(panel).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

test('member selects FAQs, sends a grounded question and closing clears the reply', async ({
  page,
}, testInfo) => {
  await mock(page, true);
  let modelCalls = 0;
  await page.route('**/api/v1/assistant/questions', (route) => {
    modelCalls++;
    expect(route.request().postDataJSON()).toEqual({ revision_id: revision, question: '대상은?' });
    return route.fulfill({
      json: {
        ...faqItems[0].response,
        response_type: undefined,
        answer: '직접 질문한 답변입니다.',
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  let panel = await open(page);
  await panel.getByRole('button', { name: /공고 내용이 궁금해요/ }).click();
  await expect(panel.getByRole('heading', { name: '현재 진행중인 공고' })).toBeVisible();
  await expect(panel.locator('.chat-policy-list-heading')).toHaveCSS('border-top-style', 'solid');
  await page.screenshot({ path: testInfo.outputPath('assistant-policy-chooser.png') });
  await panel.getByRole('button', { name: new RegExp(policy.title) }).click();
  await panel.getByRole('button', { name: faqItems[0].question, exact: true }).click();
  await expect(panel.getByText(faqItems[0].response.answer, { exact: true })).toBeVisible();
  expect(modelCalls).toBe(0);
  await panel.getByRole('textbox', { name: '궁금한 내용' }).fill('대상은?');
  await panel.getByRole('button', { name: '질문 보내기' }).click();
  await expect(panel.getByText('직접 질문한 답변입니다.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: '궁금한 내용' })).toHaveValue('');
  await panel.getByText('원문 근거 보기', { exact: true }).click();
  await expect(panel.getByText('공고 원문 근거', { exact: true })).toBeVisible();
  expect(modelCalls).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('assistant-answer.png') });
  await panel.getByRole('button', { name: '상담창 닫기' }).click();
  await expect(page.getByRole('button', { name: 'AI 챗봇 열기' })).toBeFocused();
  panel = await open(page);
  await expect(panel.getByText('직접 질문한 답변입니다.', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: '어떤 내용이 궁금하세요?' })).toBeVisible();
});

test('question history keeps earlier replies across closing and changing policies without new requests', async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await mock(page, true);
  const second = {
    ...policy,
    id: 'second-policy',
    title: '다른 주거 공고',
    revisionId: '22222222-2222-2222-2222-222222222222',
  };
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [policy, second], total: 2, nextCursor: null } }),
  );
  await page.route('**/api/v1/assistant/faqs?**', (route) => {
    const revisionId = new URL(route.request().url()).searchParams.get('revision_id');
    return route.fulfill({
      json: {
        revision_id: revisionId,
        items: faqItems.map((item) => ({
          ...item,
          response: { ...item.response, revision_id: revisionId },
        })),
      },
    });
  });
  let modelCalls = 0;
  await page.route('**/api/v1/assistant/questions', (route) => {
    modelCalls++;
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        ...faqItems[0].response,
        revision_id: body.revision_id,
        response_type: undefined,
        answer: `${body.question}에 대한 저장된 답변`,
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  let panel = await open(page);
  await panel.getByRole('button', { name: /공고 내용이 궁금해요/ }).click();
  await panel.getByRole('button', { name: new RegExp(policy.title) }).click();
  await panel.getByRole('button', { name: faqItems[0].question, exact: true }).click();
  for (const question of ['첫 번째 질문', '두 번째 질문']) {
    await panel.getByRole('textbox', { name: '궁금한 내용' }).fill(question);
    await panel.getByRole('button', { name: '질문 보내기' }).click();
    await expect(panel.getByRole('region', { name: '질문 답변', exact: true })).toContainText(
      `${question}에 대한 저장된 답변`,
    );
    await expect(panel.getByRole('textbox', { name: '궁금한 내용' })).toHaveValue('');
  }
  await panel.getByRole('button', { name: '공고 바꾸기' }).click();
  await panel.getByRole('button', { name: new RegExp(second.title) }).click();
  await panel.getByRole('textbox', { name: '궁금한 내용' }).fill('다른 공고 질문');
  await panel.getByRole('button', { name: '질문 보내기' }).click();
  await expect(panel.getByRole('region', { name: '질문 답변', exact: true })).toContainText(
    '다른 공고 질문에 대한 저장된 답변',
  );
  await panel.getByRole('button', { name: '상담창 닫기' }).click();
  panel = await open(page);
  await panel.getByRole('button', { name: '질문 내역', exact: true }).click();
  await expect(panel.locator('.chat-history-list > .chat-policy-entry > button')).toHaveCount(4);
  await expect(
    panel.locator('.chat-history-list > .chat-policy-entry > button').first(),
  ).toContainText('다른 공고 질문');
  await page.screenshot({ path: testInfo.outputPath('assistant-history.png') });
  await panel.getByRole('button', { name: /첫 번째 질문/ }).click();
  await expect(panel.getByRole('heading', { name: policy.title, exact: true })).toBeVisible();
  await expect(panel.getByRole('region', { name: '질문 답변', exact: true })).toContainText(
    '첫 번째 질문에 대한 저장된 답변',
  );
  await panel.getByText('원문 근거 보기', { exact: true }).click();
  await expect(panel.getByText('공고 원문 근거', { exact: true })).toBeVisible();
  expect(modelCalls).toBe(3);
  await page.reload();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  panel = await open(page);
  await panel.getByRole('button', { name: '질문 내역', exact: true }).click();
  await expect(panel.getByText(/아직 질문 내역이 없어요/)).toBeVisible();
});

test('failed questions keep the draft and do not add a reply to history', async ({ page }) => {
  await mock(page, true);
  await page.route('**/api/v1/assistant/questions', (route) =>
    route.fulfill({ status: 503, json: { detail: '잠시 후 다시 시도해 주세요.' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  const panel = await open(page);
  await panel.getByRole('button', { name: /공고 내용이 궁금해요/ }).click();
  await panel.getByRole('button', { name: new RegExp(policy.title) }).click();
  await panel.getByRole('textbox', { name: '궁금한 내용' }).fill('신청 방법은?');
  await panel.getByRole('button', { name: '질문 보내기' }).click();
  await expect(panel.getByRole('alert')).toContainText('잠시 후 다시 시도');
  await expect(panel.getByRole('textbox', { name: '궁금한 내용' })).toHaveValue('신청 방법은?');
  await panel.getByRole('button', { name: '질문 내역', exact: true }).click();
  await expect(panel.getByText(/아직 질문 내역이 없어요/)).toBeVisible();
});

test('policy detail opens its own policy in the chatbot without stacked dialogs', async ({
  page,
}) => {
  await mock(page, true);
  await page.goto('/#explore');
  await page.getByRole('button', { name: policy.title, exact: true }).click();
  await expect(page.locator('.chat-launcher')).toHaveCount(0);
  await page.getByRole('button', { name: '챗봇 창에서 질문하기' }).click();
  const panel = page.getByRole('dialog', { name: '복지나침반 AI 챗봇' });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: policy.title, exact: true })).toBeVisible();
  await expect(panel.getByRole('region', { name: '상담할 공고 선택' })).toHaveCount(0);
  await panel.getByRole('button', { name: '공고 바꾸기' }).click();
  await expect(panel.getByRole('region', { name: '상담할 공고 선택' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  expect(await page.locator('body').evaluate((element) => element.style.overflow)).not.toBe(
    'hidden',
  );
});

test('easy mode uses the same topics, keeps the selected guide and fits 320px', async ({
  page,
}, testInfo) => {
  await mock(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  const panel = await open(page);
  await panel.getByRole('button', { name: /이용 방법이 궁금해요/ }).click();
  await panel.getByRole('button', { name: '쉬운 화면은 어떻게 켜나요?' }).click();
  await panel.getByRole('button', { name: '쉬운 화면으로 보기' }).click();
  await expect(panel).toHaveClass(/chat-dialog-easy/);
  await expect(panel.getByRole('heading', { name: '쉬운 화면은 어떻게 켜나요?' })).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds.x).toBe(0);
  expect(bounds.width).toBe(320);
  expect(
    await page
      .locator('.chat-content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('assistant-easy-320.png') });
  await panel.getByRole('button', { name: '상담창 닫기' }).click();
  await expect(page.getByText('챗봇에 물어보기', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktop = await open(page);
  expect((await desktop.boundingBox()).width).toBeGreaterThan(500);
  await page.screenshot({ path: testInfo.outputPath('assistant-easy-desktop.png') });
});

test('schedule entry selects the period FAQ and guests keep the login boundary', async ({
  page,
}) => {
  await mock(page, true);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  const panel = await open(page);
  await panel.getByRole('button', { name: /신청 일정을 보고 싶어요/ }).click();
  await panel.getByRole('button', { name: new RegExp(policy.title) }).click();
  await expect(panel.getByText(faqItems[2].response.answer, { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '공고 캘린더 보기' }).click();
  await expect(page).toHaveURL(/#calendar$/);
  await mock(page, false);
  await page.goto('/');
  await page.reload();
  const guest = await open(page);
  await guest.getByRole('button', { name: /공고 내용이 궁금해요/ }).click();
  await guest.getByRole('button', { name: new RegExp(policy.title) }).click();
  await expect(guest.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
  await expect(guest.getByRole('textbox', { name: '궁금한 내용' })).toHaveCount(0);
});

test('policy loading can retry and searching starts a fresh cursor', async ({ page }) => {
  await mock(page);
  let failing = true;
  const queries = [];
  await page.route('**/api/v1/policies?**', (route) => {
    queries.push(new URL(route.request().url()).searchParams);
    return failing
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({
          json: {
            items: [policy],
            total: 2,
            nextCursor: queries.at(-1).get('cursor') ? null : 'next-page',
          },
        });
  });
  await page.goto('/');
  const panel = await open(page);
  await panel.getByRole('button', { name: /공고 내용이 궁금해요/ }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  failing = false;
  await panel.getByRole('button', { name: '공고 다시 불러오기' }).click();
  await panel.getByRole('button', { name: '다음 공고' }).click();
  await expect(panel.getByRole('button', { name: '이전 공고' })).toBeVisible();
  await panel.getByRole('searchbox', { name: '공고 이름이나 관심 분야' }).fill('주거');
  await panel.getByRole('button', { name: '검색', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '검색 결과', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '이전 공고' })).toHaveCount(0);
  expect(queries.at(-1).get('q')).toBe('주거');
  expect(queries.at(-1).has('cursor')).toBe(false);
});
