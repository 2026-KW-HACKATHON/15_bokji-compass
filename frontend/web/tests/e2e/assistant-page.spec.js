import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { blankDialogue, completeDialogue, dialoguePolicy } from '../fixtures/dialogue.js';
import { emptyMonitoringProfile } from '../../src/features/monitoring/monitoringModel.js';

const member = { id: 'assistant-a', name: '비서회원', age: 40, region: '서울' };
const blank = () => ({
  profile: null,
  enabled: false,
  updated_at: null,
  last_checked_at: null,
  needs: [],
  candidates: [],
  alerts: [],
  unread_count: 0,
});
const ready = () => ({
  ...blank(),
  enabled: true,
  profile: { ...emptyMonitoringProfile, housing_tenure: 'owner', building_year: 1920 },
  last_checked_at: '2026-10-08T02:00:00Z',
  needs: [
    {
      id: 'housing_repair',
      title: '주택 수리',
      reason: '저장한 주거 상황',
      keywords: ['주택'],
      questions: ['주택 유형을 확인해 주세요.'],
    },
  ],
  candidates: [{ ...completeDialogue().candidates[0], active: true, state: 'preparing' }],
  alerts: [
    {
      id: 'assistant-alert',
      policy_id: dialoguePolicy.id,
      need_id: 'housing_repair',
      title: '주택 수리 지원 후보가 생겼어요',
      body: '원문 조건을 확인해 주세요.',
      created_at: '2026-10-08T02:00:00Z',
      read: false,
    },
  ],
  unread_count: 1,
});

async function setup(page, initial = ready(), user = member) {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = { user, snapshot: initial, calls: [], reads: 0 };
  await page.route('**/api/v1/auth/kakao/status', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(state.user ? { json: { user: state.user } } : { status: 401, json: {} }),
  );
  await page.route('**/api/v1/auth/logout', (route) => {
    state.user = null;
    return route.fulfill({ json: { message: '로그아웃' } });
  });
  await page.route('**/api/v1/auth/login', (route) => {
    state.user = { ...member, id: 'assistant-b', name: '다음회원' };
    state.snapshot = blank();
    return route.fulfill({ json: { user: state.user } });
  });
  await page.route('**/api/v1/finance/profile', (route) =>
    route.fulfill({ json: { profile: null, calculation: null, updated_at: null } }),
  );
  await page.route('**/api/v1/monitoring**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    state.calls.push({ path, body });
    if (!body) state.reads++;
    if (path.endsWith('/profile'))
      state.snapshot = { ...state.snapshot, profile: body.profile, enabled: body.enabled };
    if (path.endsWith('/candidates/state')) state.snapshot.candidates[0].state = body.state;
    if (path.endsWith('/alerts/read')) {
      state.snapshot.alerts.forEach((item) => {
        item.read = true;
      });
      state.snapshot.unread_count = 0;
      return route.fulfill({ json: { updated: true } });
    }
    if (path.endsWith('/delete')) state.snapshot = blank();
    return route.fulfill({ json: state.snapshot });
  });
  return state;
}

async function openChat(page) {
  await page.getByRole('button', { name: 'AI 챗봇 열기' }).click();
  const chat = page.getByRole('dialog', { name: '복지나침반 AI 챗봇' });
  await chat.getByRole('button', { name: /생활 상황으로 상담하고 싶어요/ }).click();
  return chat;
}

test('assistant is a dedicated dashboard with real guidance and progress controls', async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.goto('/#assistant');
  await expect(page.getByRole('heading', { name: 'AI 복지비서', exact: true })).toBeVisible();
  const dashboard = page.locator('.monitoring-dashboard-grid');
  await expect(dashboard.getByRole('heading', { name: '내 상황 요약', exact: true })).toBeVisible();
  await expect(dashboard).toContainText('1920년 준공');
  await expect(page.getByRole('textbox', { name: '어떤 도움이 필요하세요?' })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('assistant-dashboard-normal.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '진행 중인 지원 보기' }).click();
  const progress = page.getByLabel(`${dialoguePolicy.title} 지원 진행 상태`);
  await expect(progress).toHaveValue('preparing');
  await progress.selectOption('applied');
  expect(state.calls.at(-1).body.state).toBe('applied');
  await page.getByRole('button', { name: '안내함 확인하기' }).click();
  await page.getByRole('button', { name: '표시된 안내 읽음' }).click();
  await expect(page.getByText('안 읽음 0개')).toBeVisible();
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(dashboard.getByRole('heading', { name: '내 상황 요약', exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('assistant-dashboard.png'), fullPage: true });
});

test('chat handoff preserves current follow-up and unsent input without repeating a question', async ({
  page,
}) => {
  await setup(page, blank());
  const calls = [];
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
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
  const chat = await openChat(page);
  await chat
    .getByRole('textbox', { name: '어떤 도움이 필요하세요?' })
    .fill('리모델링 지원금을 받을 수 있어?');
  await chat.getByRole('button', { name: '상담 시작하기', exact: true }).click();
  await chat.getByRole('textbox', { name: '건물은 몇 년에 지어졌나요?' }).fill('1920년 건축');
  await chat.getByRole('button', { name: 'AI 복지비서에서 이어보기' }).click();
  await expect(page).toHaveURL(/#assistant$/);
  await expect(chat).toHaveCount(0);
  const conversation = page.getByRole('region', { name: '생활 상황 상담', exact: true });
  await expect(
    conversation.getByRole('textbox', { name: '건물은 몇 년에 지어졌나요?' }),
  ).toHaveValue('1920년 건축');
  expect(calls).toHaveLength(1);
  await conversation.getByRole('button', { name: '답변하고 다시 확인하기' }).click();
  expect(calls[1]).toEqual({
    continuation: 'opaque-session-token',
    answer: { slot: 'building_year', value: '1920년 건축' },
  });
  await expect(conversation).toContainText('1920년 건축으로 확인했어요.');
  await page.getByRole('link', { name: '전체 공고', exact: true }).click();
  await page.getByRole('link', { name: 'AI 복지비서', exact: true }).click();
  await expect(conversation).toContainText('1920년 건축으로 확인했어요.');
  expect(calls).toHaveLength(2);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain('opaque-session-token');
  expect(storage).not.toContain('1920년 건축');
  await page.reload();
  await expect(conversation).toHaveCount(0);
});

test('selected policy and confirmed facts transfer but save consent must be checked again', async ({
  page,
}) => {
  const state = await setup(page, blank());
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [dialoguePolicy], total: 1, nextCursor: null } }),
  );
  const calls = [];
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: completeDialogue() });
  });
  let saves = 0;
  await page.route('**/api/v1/assistant/dialogue/profile', (route) => {
    saves++;
    state.snapshot = { ...blank(), profile: completeDialogue().profile_draft };
    return route.fulfill({ json: state.snapshot });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI 챗봇 열기' }).click();
  const chat = page.getByRole('dialog', { name: '복지나침반 AI 챗봇' });
  await chat.getByRole('button', { name: /공고 내용이 궁금해요/ }).click();
  await chat.getByRole('button', { name: new RegExp(dialoguePolicy.title) }).click();
  await chat.getByRole('button', { name: '내 상황을 더해서 확인하기' }).click();
  await chat.getByRole('textbox', { name: '어떤 도움이 필요하세요?' }).fill('내 상황으로 확인');
  await chat.getByRole('button', { name: '상담 시작하기', exact: true }).click();
  await chat.getByRole('checkbox', { name: /표시된 정보가 본인 정보임/ }).check();
  await chat.getByRole('button', { name: 'AI 복지비서에서 이어보기' }).click();
  const conversation = page.getByRole('region', { name: '생활 상황 상담', exact: true });
  await expect(conversation.locator('.guided-policy-context')).toContainText(dialoguePolicy.title);
  await expect(
    conversation.getByRole('checkbox', { name: /표시된 정보가 본인 정보임/ }),
  ).not.toBeChecked();
  await expect(conversation.getByRole('button', { name: '확인한 정보 저장하기' })).toBeDisabled();
  expect(calls[0].revision_id).toBe(dialoguePolicy.revisionId);
  expect(calls).toHaveLength(1);
  expect(saves).toBe(0);
  await conversation.getByRole('checkbox', { name: /표시된 정보가 본인 정보임/ }).check();
  await conversation.getByRole('button', { name: '확인한 정보 저장하기' }).click();
  await expect(page.locator('.monitoring-dashboard-grid')).toContainText('1920년 준공');
  expect(saves).toBe(1);
});

test('guest login returns to assistant and logout removes the previous account conversation', async ({
  page,
}) => {
  await setup(page, blank(), null);
  await page.goto('/#assistant');
  await page
    .locator('.monitoring-panel')
    .getByRole('link', { name: '로그인', exact: true })
    .click();
  await page.getByRole('button', { name: /아이디로 로그인/ }).click();
  await page.getByLabel('아이디', { exact: true }).fill('assistant_b');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/#assistant$/);
  await page.getByRole('button', { name: '상황을 대화로 추가하기', exact: true }).click();
  await page.getByRole('textbox', { name: '어떤 도움이 필요하세요?' }).fill('내 비공개 주거 상담');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('link', { name: 'AI 복지비서', exact: true }).click();
  await expect(page.getByRole('region', { name: '생활 상황 상담', exact: true })).toHaveCount(0);
  await expect(page.getByText('내 비공개 주거 상담', { exact: true })).toHaveCount(0);
});

for (const action of ['edit', 'delete']) {
  test(`profile ${action} invalidates the earlier conversation instead of reusing old facts`, async ({
    page,
  }) => {
    await setup(page);
    await page.route('**/api/v1/assistant/dialogue', (route) =>
      route.fulfill({ json: completeDialogue() }),
    );
    await page.goto('/#assistant');
    await page.getByRole('button', { name: '상황을 대화로 추가하기', exact: true }).click();
    await page.getByRole('textbox', { name: '어떤 도움이 필요하세요?' }).fill('집수리 지원');
    await page.getByRole('button', { name: '상담 시작하기', exact: true }).click();
    const conversation = page.getByRole('region', { name: '생활 상황 상담', exact: true });
    await expect(conversation).toContainText('1920년 건축으로 확인했어요.');
    const panel = page.getByRole('region', { name: '나를 위한 지원 현황', exact: true });
    if (action === 'edit') {
      await panel.getByRole('button', { name: '생활정보 수정하기', exact: true }).click();
      await panel.getByLabel('주택 준공연도').fill('2010');
      await panel
        .getByLabel('생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.', {
          exact: true,
        })
        .check();
      await panel.getByRole('button', { name: '생활정보와 안내 설정 저장', exact: true }).click();
      await expect(panel.locator('.monitoring-dashboard-grid')).toContainText('2010년 준공');
    } else {
      await panel.getByRole('button', { name: '안내 설정', exact: true }).click();
      await panel.getByRole('button', { name: '저장한 생활정보와 안내 삭제' }).click();
      await panel.getByRole('button', { name: '생활정보와 안내 기록 삭제', exact: true }).click();
    }
    await expect(conversation).toHaveCount(0);
    await page.getByRole('link', { name: '전체 공고', exact: true }).click();
    await page.getByRole('link', { name: 'AI 복지비서', exact: true }).click();
    await expect(conversation).toHaveCount(0);
  });
}
