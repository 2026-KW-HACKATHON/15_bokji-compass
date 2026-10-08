import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { blankDialogue, completeDialogue } from '../fixtures/dialogue.js';
import { assistantIntroKey } from '../../src/features/assistant/assistantIntroModel.js';

const member = { id: 'conversation-a', name: '대화회원', age: 40, region: '서울' };
const blankMonitoring = {
  profile: null,
  enabled: false,
  updated_at: null,
  last_checked_at: null,
  needs: [],
  candidates: [],
  alerts: [],
  unread_count: 0,
};

async function setup(page, { guest = false, easy = false } = {}) {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(
    ({ introKeys, easy }) => {
      introKeys.forEach((key) => localStorage.setItem(key, 'seen'));
      if (easy) localStorage.setItem('bokji.easy.v1', JSON.stringify(true));
    },
    {
      introKeys: [assistantIntroKey(member.id), assistantIntroKey('conversation-b')],
      easy,
    },
  );
  const state = { user: guest ? null : member, calls: [] };
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(state.user ? { json: { user: state.user } } : { status: 401, json: {} }),
  );
  await page.route('**/api/v1/auth/kakao/status', (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.route('**/api/v1/auth/logout', (route) => {
    state.user = null;
    return route.fulfill({ json: { message: '로그아웃' } });
  });
  await page.route('**/api/v1/auth/login', (route) => {
    state.user = { ...member, id: 'conversation-b', name: '다음대화회원' };
    return route.fulfill({ json: { user: state.user } });
  });
  await page.route('**/api/v1/finance/profile', (route) =>
    route.fulfill({ json: { profile: null, calculation: null, updated_at: null } }),
  );
  await page.route('**/api/v1/monitoring', (route) => route.fulfill({ json: blankMonitoring }));
  return state;
}

const conversation = (page) => page.getByRole('region', { name: 'AI 비서 대화', exact: true });
const composer = (page) =>
  conversation(page).getByRole('textbox', { name: 'AI 비서에게 물어보기' });
async function send(page, text) {
  await composer(page).fill(text);
  await conversation(page).getByRole('button', { name: '보내기', exact: true }).click();
}

test('assistant chat keeps successive messages without subject or region forms', async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    const body = route.request().postDataJSON();
    state.calls.push(body);
    return route.fulfill({
      json:
        state.calls.length === 1
          ? blankDialogue({
              answer: '잘 들려요! 편하게 이야기해 주세요.',
              follow_up: null,
              missing_fields: [],
            })
          : {
              ...completeDialogue(),
              answer: body.question ? '서류도 함께 확인해 드릴게요.' : completeDialogue().answer,
            },
    });
  });
  await page.goto('/#assistant-overview');
  await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-chat$/);
  await expect(
    page.getByRole('heading', { name: 'AI 비서와 대화하기', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI 챗봇 열기' })).toHaveCount(0);
  await send(page, '테스트 대화야 아무말이나 보내봐');
  await expect(
    conversation(page).getByText('잘 들려요! 편하게 이야기해 주세요.', { exact: true }),
  ).toBeVisible();
  await expect(conversation(page).getByRole('button', { name: '본인', exact: true })).toHaveCount(
    0,
  );
  await send(page, '신청할 때 어떤 서류가 필요한가요?');
  await expect(
    conversation(page).getByText('서류도 함께 확인해 드릴게요.', { exact: true }),
  ).toBeVisible();
  expect(state.calls).toEqual([
    { question: '테스트 대화야 아무말이나 보내봐', mode: 'conversation' },
    {
      continuation: 'opaque-session-token',
      question: '신청할 때 어떤 서류가 필요한가요?',
      mode: 'conversation',
    },
  ]);
  await expect(
    conversation(page).getByRole('log', { name: '이전 대화', exact: true }),
  ).toBeVisible();
  await expect(conversation(page)).toContainText('테스트 대화야 아무말이나 보내봐');
  await expect(
    conversation(page).getByRole('button', { name: '확인한 정보 저장하기' }),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.assistant-conversation-page').screenshot({
    path: info.outputPath('assistant-conversation.png'),
    scale: 'css',
    style: '.portal-header, .skip-link { visibility: hidden !important; }',
  });
});

test('a conversation continues beyond the former turn cap without restarting the context', async ({
  page,
}) => {
  const state = await setup(page);
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    state.calls.push(route.request().postDataJSON());
    return route.fulfill({
      json: blankDialogue({
        answer: `계속 상담 ${state.calls.length}번째 안내`,
        follow_up: null,
        missing_fields: [],
      }),
    });
  });
  await page.goto('/#assistant-chat');
  for (let turn = 1; turn <= 9; turn++) {
    await send(page, `이어지는 질문 ${turn}`);
    await expect(
      conversation(page).getByText(`계속 상담 ${turn}번째 안내`, { exact: true }),
    ).toBeVisible();
  }
  expect(state.calls).toHaveLength(9);
  expect(state.calls[0]).toEqual({ question: '이어지는 질문 1', mode: 'conversation' });
  expect(state.calls.slice(1).every((body) => body.continuation === 'opaque-session-token')).toBe(
    true,
  );
  await conversation(page).getByRole('button', { name: '새 상담 시작하기', exact: true }).click();
  await expect(composer(page)).toHaveValue('');
  await send(page, '다른 내용으로 시작할게요');
  expect(state.calls.at(-1)).toEqual({
    question: '다른 내용으로 시작할게요',
    mode: 'conversation',
  });
});

test('guests can use the conversation page and continue without account storage', async ({
  page,
}) => {
  const state = await setup(page, { guest: true });
  await page.route('**/api/v1/assistant/chat/dialogue', (route) => {
    state.calls.push(route.request().postDataJSON());
    return route.fulfill({ json: completeDialogue() });
  });
  await page.goto('/#assistant-chat');
  await send(page, '내 상황에 맞는 도움을 알려 주세요');
  await send(page, '신청 절차도 알려 주세요');
  expect(state.calls).toEqual([
    { question: '내 상황에 맞는 도움을 알려 주세요', mode: 'conversation' },
    {
      continuation: 'opaque-session-token',
      question: '신청 절차도 알려 주세요',
      mode: 'conversation',
    },
  ]);
  await expect(
    conversation(page).getByRole('button', { name: '확인한 정보 저장하기' }),
  ).toHaveCount(0);
});

test('failed messages keep the draft and retry only once while a request is pending', async ({
  page,
}) => {
  const state = await setup(page);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/assistant/dialogue', async (route) => {
    state.calls.push(route.request().postDataJSON());
    if (state.calls.length === 1) return route.fulfill({ status: 503, json: {} });
    await held;
    return route.fulfill({ json: blankDialogue({ answer: '다시 보낸 질문에 대한 안내예요.' }) });
  });
  await page.goto('/#assistant-chat');
  await send(page, '실패해도 남아 있어야 할 질문');
  await expect(conversation(page).getByRole('alert')).toBeVisible();
  await expect(composer(page)).toHaveValue('실패해도 남아 있어야 할 질문');
  await composer(page).fill('실패 이후 새로 수정한 질문');
  await conversation(page).getByRole('button', { name: '다시 시도하기', exact: true }).click();
  await expect(
    conversation(page).getByRole('button', { name: '보내기', exact: true }),
  ).toBeDisabled();
  await composer(page).dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
  expect(state.calls).toHaveLength(2);
  release();
  await expect(
    conversation(page).getByText('다시 보낸 질문에 대한 안내예요.', { exact: true }),
  ).toBeVisible();
  expect(state.calls[1]).toEqual(state.calls[0]);
  await expect(composer(page)).toHaveValue('실패 이후 새로 수정한 질문');
});

test('navigation restores the same account conversation and unsent text only in tab memory', async ({
  page,
}) => {
  const state = await setup(page);
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    state.calls.push(route.request().postDataJSON());
    return route.fulfill({ json: completeDialogue() });
  });
  await page.goto('/#assistant-chat');
  await send(page, '메모리에서만 유지되는 상담');
  await expect(conversation(page).getByText(/1920년 건축으로 확인/)).toBeVisible();
  await composer(page).fill('아직 보내지 않은 개인 질문');
  await page.getByRole('button', { name: '추천 공고로 돌아가기', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-overview$/);
  await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
  await expect(composer(page)).toHaveValue('아직 보내지 않은 개인 질문');
  await expect(conversation(page).getByText(/1920년 건축으로 확인/)).toBeVisible();
  expect(state.calls).toHaveLength(1);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain('opaque-session-token');
  expect(storage).not.toContain('메모리에서만 유지되는 상담');
  expect(storage).not.toContain('아직 보내지 않은 개인 질문');
  await page.reload();
  await expect(composer(page)).toHaveValue('');
  await expect(conversation(page).getByText(/1920년 건축으로 확인/)).toHaveCount(0);
});

test('logout and another account login discard earlier conversation and continuation', async ({
  page,
}) => {
  const state = await setup(page);
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    state.calls.push(route.request().postDataJSON());
    return route.fulfill({ json: completeDialogue() });
  });
  await page.goto('/#assistant-chat');
  await send(page, '첫 계정의 비공개 상담');
  await expect(conversation(page).getByText(/1920년 건축으로 확인/)).toBeVisible();
  await composer(page).fill('첫 계정의 보내지 않은 질문');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.evaluate(() => {
    window.location.hash = 'login?return=assistant-chat';
  });
  await page.getByLabel('아이디', { exact: true }).fill('conversation_b');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-chat$/);
  await expect(composer(page)).toHaveValue('');
  await expect(conversation(page)).not.toContainText('첫 계정의 비공개 상담');
  await expect(conversation(page).getByText(/1920년 건축으로 확인/)).toHaveCount(0);
  await send(page, '다음 계정의 첫 질문');
  expect(state.calls.at(-1)).toEqual({ question: '다음 계정의 첫 질문', mode: 'conversation' });
});

test('easy and narrow screens preserve Korean composition, line breaks and keyboard submission', async ({
  page,
}, info) => {
  const state = await setup(page, { easy: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    state.calls.push(route.request().postDataJSON());
    return route.fulfill({
      json: blankDialogue({ answer: '키보드 질문을 확인했어요.', follow_up: null }),
    });
  });
  await page.goto('/#assistant-chat');
  await composer(page).fill('한글을 입력하고 있어요');
  await composer(page).dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    keyCode: 229,
  });
  expect(state.calls).toHaveLength(0);
  await expect(composer(page)).toHaveValue('한글을 입력하고 있어요');
  await composer(page).focus();
  await composer(page).press('End');
  await composer(page).press('Shift+Enter');
  await expect(composer(page)).toHaveValue('한글을 입력하고 있어요\n');
  expect(state.calls).toHaveLength(0);
  await composer(page).press('Enter');
  await expect(
    conversation(page).getByText('키보드 질문을 확인했어요.', { exact: true }),
  ).toBeVisible();
  expect(state.calls).toEqual([{ question: '한글을 입력하고 있어요', mode: 'conversation' }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.assistant-conversation-page').screenshot({
    path: info.outputPath('assistant-conversation-easy-320.png'),
    scale: 'css',
    style: '.portal-header, .skip-link { visibility: hidden !important; }',
  });
});

test('chatbot handoff moves the unsubmitted answer into the conversation composer', async ({
  page,
}) => {
  const state = await setup(page);
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    const body = route.request().postDataJSON();
    state.calls.push(body);
    return route.fulfill({
      json: body.answer
        ? completeDialogue()
        : blankDialogue({
            follow_up: {
              slot: 'building_year',
              question: '건물은 몇 년에 지어졌나요?',
              input_type: 'number',
              options: [],
              allow_unknown: true,
            },
          }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI 챗봇 열기' }).click();
  const chat = page.getByRole('dialog', { name: '복지나침반 AI 챗봇' });
  await chat.getByRole('button', { name: /생활 상황으로 상담하고 싶어요/ }).click();
  await chat.getByRole('textbox', { name: '어떤 도움이 필요하세요?' }).fill('집수리 공고 상담');
  await chat.getByRole('button', { name: '상담 시작하기', exact: true }).click();
  await chat.getByRole('textbox', { name: '건물은 몇 년에 지어졌나요?' }).fill('1920년 건축');
  await chat.getByRole('button', { name: 'AI 복지비서에서 이어보기', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-chat$/);
  await expect(chat).toHaveCount(0);
  await expect(composer(page)).toHaveValue('1920년 건축');
  expect(state.calls).toHaveLength(1);
  await conversation(page).getByRole('button', { name: '보내기', exact: true }).click();
  expect(state.calls[1]).toEqual({
    continuation: 'opaque-session-token',
    question: '1920년 건축',
    mode: 'conversation',
  });
});
