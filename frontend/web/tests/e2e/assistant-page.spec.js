import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { blankDialogue, completeDialogue, dialoguePolicy } from '../fixtures/dialogue.js';
import { emptyMonitoringProfile } from '../../src/features/monitoring/monitoringModel.js';
import { assistantIntroKey } from '../../src/features/assistant/assistantIntroModel.js';

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

async function setup(page, initial = ready(), user = member, { introSeen = true } = {}) {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (introSeen) {
    await page.addInitScript(
      (keys) => keys.forEach((key) => localStorage.setItem(key, 'seen')),
      [assistantIntroKey(member.id), assistantIntroKey('assistant-b'), assistantIntroKey(null)],
    );
  }
  const state = { user, snapshot: initial, calls: [], reads: 0, failSaves: 0, failFeedback: 0 };
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
  await page.route('**/api/v1/monitoring**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    state.calls.push({ path, body });
    if (!body) state.reads++;
    if (path.endsWith('/profile')) {
      if (state.failSaves > 0) {
        state.failSaves--;
        return route.fulfill({ status: 422, json: {} });
      }
      state.snapshot = { ...state.snapshot, profile: body.profile, enabled: body.enabled };
    }
    if (path.endsWith('/candidates/state')) state.snapshot.candidates[0].state = body.state;
    if (path.endsWith('/candidates/feedback')) {
      await state.feedbackWait;
      if (state.failFeedback > 0) {
        state.failFeedback--;
        return route.fulfill({ status: 503, json: {} });
      }
      state.snapshot.recommendation_feedback =
        body.reason === null
          ? []
          : [
              {
                policy_id: body.policy_id,
                need_id: body.need_id,
                reason: body.reason,
                title: dialoguePolicy.title,
                updated_at: '2026-10-08T05:00:00Z',
              },
            ];
    }
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

test('saved internal checks become readable application guidance without asking for unrelated data', async ({
  page,
}, testInfo) => {
  const snapshot = ready();
  snapshot.candidates[0].questions = [
    snapshot.needs[0].questions[0],
    '공고의 regular_income_status 조건에 필요한 정보를 확인해 주세요.',
    '공고의 employment_vulnerability 조건에 필요한 정보를 확인해 주세요.',
    '공고의 local_geography_knowledge 조건에 필요한 정보를 확인해 주세요.',
    '원문에 기재된 추가 지원대상 조건을 확인해 주세요.',
    '공고의 전체 조건·예외를 공식 안내와 함께 확인해 주세요.',
    '지원 대상 안내: 정기소득이 없는 사람',
  ];
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 1200 });
  }
  await setup(page, snapshot);
  await page.goto('/#assistant');
  const card = page.locator('.monitoring-candidate');
  await expect(card.getByText('신청 전 확인사항', { exact: true })).toBeVisible();
  await expect(
    card.getByText('지원 대상 안내: 정기소득이 없는 사람', { exact: true }),
  ).toBeVisible();
  await expect(card.locator('.monitoring-questions li')).toHaveCount(2);
  await expect(card).not.toContainText(
    /regular_income_status|employment_vulnerability|local_geography_knowledge/,
  );
  await expect(card).not.toContainText(snapshot.needs[0].questions[0]);
  await expect(card.getByRole('combobox', { name: /지원 진행 상태/ })).toHaveCount(0);
  await expect(card.getByRole('button', { name: '이 공고 추천하지 않기' })).toBeVisible();
  await expect(card.getByRole('link', { name: /공식 공고/ })).toHaveAttribute(
    'href',
    dialoguePolicy.sourceUrl,
  );
  await expect(page.locator('html')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('html').evaluate((element) => element.clientWidth),
  );
  const capture = testInfo.project.name === 'mobile' ? card.locator('.monitoring-questions') : card;
  await capture.screenshot({
    path: `C:/15_bokji-compass/tmp/assistant-guidance-${testInfo.project.name}.png`,
    scale: 'css',
  });
});

async function openAssistantNavigation(page) {
  await page
    .getByRole('navigation', { name: '주 메뉴', exact: true })
    .getByRole('link', { name: 'AI 비서', exact: true })
    .click();
}

for (const [reason, label] of [
  ['not_eligible', '지원 대상이 아니에요'],
  ['not_interested', '관심 없는 공고예요'],
]) {
  test(`recommendation feedback ${reason} persists, can be cancelled and restored`, async ({
    page,
  }, info) => {
    const state = await setup(page);
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 1100 });
    await page.goto('/#assistant');
    const card = page.locator('.monitoring-candidate');
    const trigger = card.getByRole('button', { name: '이 공고 추천하지 않기' });
    await expect(card.getByRole('combobox', { name: /지원 진행 상태/ })).toHaveCount(0);
    await trigger.click();
    await expect(card.getByRole('radio').first()).toBeFocused();
    await expect(card.getByRole('button', { name: '추천에서 제외', exact: true })).toBeDisabled();
    await card.getByRole('radio', { name: label }).check();
    await card.getByRole('button', { name: '취소', exact: true }).click();
    await expect(trigger).toBeFocused();
    expect(state.calls.some((call) => call.path.endsWith('/candidates/feedback'))).toBe(false);
    await trigger.click();
    await card.getByRole('radio', { name: label }).check();
    if (reason === 'not_interested')
      await expect(card).toContainText('비슷한 공고의 추천 순위를 낮춰요.');
    await card.locator('.recommendation-feedback').screenshot({
      path: info.outputPath('recommendation-feedback-form.png'),
      scale: 'css',
    });
    await card.getByRole('button', { name: '추천에서 제외', exact: true }).click();
    await expect(card).toHaveCount(0);
    expect(state.calls.find((call) => call.path.endsWith('/candidates/feedback')).body).toEqual({
      policy_id: dialoguePolicy.id,
      need_id: 'housing_repair',
      reason,
    });
    await page.reload();
    await expect(card).toHaveCount(0);
    await expect(page.locator('.monitoring-panel')).toContainText(
      '추천에서 제외한 공고 외에 현재 안내할 지원 후보가 없어요.',
    );
    const excluded = page.locator('.recommendation-excluded');
    await excluded.locator('summary').click();
    await expect(excluded).toContainText(label);
    await excluded.getByRole('button', { name: '다시 추천받기' }).click();
    await expect(card).toHaveCount(1);
    expect(
      state.calls.filter((call) => call.path.endsWith('/candidates/feedback')).at(-1).body.reason,
    ).toBeNull();
    expect(state.snapshot.candidates[0].state).toBe('preparing');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('failed recommendation feedback keeps the reason and card available for retry', async ({
  page,
}) => {
  const state = await setup(page);
  state.failFeedback = 1;
  let releaseFeedback;
  state.feedbackWait = new Promise((resolve) => {
    releaseFeedback = resolve;
  });
  await page.goto('/#assistant');
  const card = page.locator('.monitoring-candidate');
  await card.getByRole('button', { name: '이 공고 추천하지 않기' }).click();
  await card.getByRole('radio', { name: '관심 없는 공고예요' }).check();
  await card.getByRole('button', { name: '추천에서 제외', exact: true }).click();
  await expect(card).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: '추천에서 제외하는 중이에요.' }),
  ).toBeVisible();
  releaseFeedback();
  await expect(card).toBeVisible();
  await expect(card.getByRole('alert')).toContainText('제외하지 못해 공고를 다시 표시했어요.');
  await expect(card.getByRole('radio', { name: '관심 없는 공고예요' })).toBeChecked();
  await expect(card.getByRole('button', { name: '추천에서 제외', exact: true })).toBeEnabled();
  await card.getByRole('button', { name: '추천에서 제외', exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('exclusion hides the card before saving and a delayed old read cannot restore it', async ({
  page,
}) => {
  const state = await setup(page);
  let releaseFeedback;
  let releaseRead;
  state.feedbackWait = new Promise((resolve) => {
    releaseFeedback = resolve;
  });
  await page.goto('/#assistant');
  const card = page.locator('.monitoring-candidate');
  await expect(card).toBeVisible();
  const oldSnapshot = structuredClone(state.snapshot);
  let oldReadStarted;
  const started = new Promise((resolve) => {
    oldReadStarted = resolve;
  });
  const delayed = new Promise((resolve) => {
    releaseRead = resolve;
  });
  await page.route(
    '**/api/v1/monitoring',
    async (route) => {
      oldReadStarted();
      await delayed;
      await route.fulfill({ json: oldSnapshot });
    },
    { times: 1 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event('bokji:monitoring-changed')));
  await started;
  await card.getByRole('button', { name: '이 공고 추천하지 않기' }).click();
  await card.getByRole('radio', { name: '지원 대상이 아니에요' }).check();
  await card.getByRole('button', { name: '추천에서 제외', exact: true }).click();
  await expect(card).toBeHidden();
  expect(state.snapshot.recommendation_feedback).toBeUndefined();
  releaseFeedback();
  await expect(card).toHaveCount(0);
  releaseRead();
  await expect(page.locator('.recommendation-excluded')).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('the first assistant visit explains the service and opens optional information entry', async ({
  page,
}) => {
  const state = await setup(page, blank(), member, { introSeen: false });
  await page.goto('/#assistant');
  await expect(page.locator('#assistant-intro-title')).toBeVisible();
  await expect(page.locator('#assistant-page-title')).toBeHidden();
  await expect(page.getByRole('region', { name: 'AI 복지비서 주요 기능' })).toBeVisible();
  await expect(page.locator('.assistant-intro-features article')).toHaveCount(3);
  await page.getByRole('button', { name: 'AI 복지비서 시작하기', exact: true }).click();
  const form = page.locator('.assistant-profile-form');
  await expect(form).toBeVisible();
  await expect(form.getByLabel('경제활동 구분')).toHaveValue('');
  await expect(form.getByRole('button', { name: '내 정보 저장하기', exact: true })).toBeDisabled();
  await form.getByLabel('경제활동 구분').selectOption('working');
  await form.getByLabel('세부 상태').selectOption('프리랜서');
  await form.getByLabel('가구 구성').selectOption({ label: '1인 가구' });
  await page.getByRole('button', { name: 'AI 복지비서 이용 안내', exact: true }).click();
  await expect(page.locator('#assistant-intro-title')).toBeVisible();
  await expect(form).toBeHidden();
  await page.getByRole('button', { name: 'AI 복지비서 시작하기', exact: true }).click();
  await expect(form.getByLabel('경제활동 구분')).toHaveValue('working');
  await expect(form.getByLabel('세부 상태')).toHaveValue('프리랜서');
  await expect(form.getByLabel('가구 구성')).toHaveValue('혼자 살아요');
  expect(state.calls.filter(({ path }) => path.endsWith('/profile'))).toEqual([]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), assistantIntroKey(member.id)),
  ).toBe('seen');
  await page.reload();
  await expect(page.locator('#assistant-page-title')).toBeVisible();
  await expect(page.locator('#assistant-intro-title')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '내 정보 입력하기', exact: true })).toBeVisible();
  expect(state.calls.filter(({ path }) => path.endsWith('/profile'))).toEqual([]);
});

test('the dedicated introduction route starts the overview and keeps its draft when reopening help', async ({
  page,
}) => {
  const state = await setup(page, blank(), member, { introSeen: false });
  await page.goto('/#assistant-intro');
  await expect(page.locator('#assistant-intro-title')).toBeVisible();
  await page.getByRole('button', { name: 'AI 복지비서 시작하기', exact: true }).click();
  await expect(page).toHaveURL(/#assistant-overview\?setup=1$/);
  const form = page.locator('.assistant-profile-form');
  await expect(form).toBeVisible();
  await form.getByLabel('경제활동 구분').selectOption('not_working');
  await form.getByLabel('세부 상태').selectOption('무직');
  await page.getByRole('button', { name: 'AI 복지비서 이용 안내', exact: true }).click();
  await expect(page.locator('#assistant-intro-title')).toBeVisible();
  await expect(form).toBeHidden();
  await page.getByRole('button', { name: 'AI 복지비서 시작하기', exact: true }).click();
  await expect(form.getByLabel('세부 상태')).toHaveValue('무직');
  await expect(form.getByLabel('구직 상태')).toHaveValue('');
  expect(state.calls.filter(({ path }) => path.endsWith('/profile'))).toEqual([]);
});

test('the guest introduction explains the service before linking to login', async ({ page }) => {
  const state = await setup(page, blank(), null, { introSeen: false });
  await page.goto('/#assistant');
  await expect(page.locator('#assistant-intro-title')).toBeVisible();
  await expect(page.locator('#assistant-page-title')).toBeHidden();
  const start = page.getByRole('link', { name: '로그인하고 시작하기', exact: true });
  await expect(start).toHaveAttribute('href', '#login?return=assistant');
  await start.click();
  await expect(page).toHaveURL(/#login\?return=assistant$/);
  expect(state.calls.filter(({ path }) => path.endsWith('/profile'))).toEqual([]);
});

test('assistant is a dedicated dashboard with real guidance and progress controls', async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.goto('/#assistant');
  await expect(
    page.getByRole('heading', {
      name: '나에게 맞는 복지를 찾고, 다음 기회도 챙겨요.',
      exact: true,
    }),
  ).toBeVisible();
  const dashboard = page.locator('.assistant-summary');
  await expect(dashboard.getByRole('heading', { name: '내 정보', exact: true })).toBeVisible();
  await expect(dashboard).toContainText('1920년 준공');
  await expect(page.getByRole('textbox', { name: '어떤 도움이 필요하세요?' })).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('assistant-dashboard-normal.png'),
    fullPage: true,
  });
  await page
    .getByRole('navigation', { name: 'AI 복지비서 상세 항목' })
    .getByRole('button', { name: '신청 현황', exact: true })
    .click();
  const progress = page.getByLabel(`${dialoguePolicy.title} 지원 진행 상태`);
  await expect(progress).toHaveValue('preparing');
  await progress.selectOption('applied');
  expect(state.calls.at(-1).body.state).toBe('applied');
  await page
    .getByRole('navigation', { name: 'AI 복지비서 상세 항목' })
    .getByRole('button', { name: '새 안내', exact: true })
    .click();
  await page.getByRole('button', { name: '표시된 안내 읽음' }).click();
  await expect(page.getByText('안 읽음 0개')).toBeVisible();
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(dashboard.getByRole('heading', { name: '내 정보', exact: true })).toBeVisible();
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
  await expect(page).toHaveURL(/#assistant-chat$/);
  await expect(chat).toHaveCount(0);
  const conversation = page.getByRole('region', { name: 'AI 비서 대화', exact: true });
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
  await openAssistantNavigation(page);
  await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
  await expect(conversation).toContainText('1920년 건축으로 확인했어요.');
  expect(calls).toHaveLength(2);
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(storage).not.toContain('opaque-session-token');
  expect(storage).not.toContain('1920년 건축');
  await page.reload();
  await expect(conversation.getByRole('textbox', { name: 'AI 비서에게 물어보기' })).toHaveValue('');
  await expect(conversation).not.toContainText('1920년 건축으로 확인했어요.');
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
  const conversation = page.getByRole('region', { name: 'AI 비서 대화', exact: true });
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
  await expect(conversation).toContainText('확인한 정보를 저장했어요.');
  await page.getByRole('button', { name: '추천 공고로 돌아가기', exact: true }).click();
  await expect(page.locator('.assistant-summary')).toContainText('1920년 준공');
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
  await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
  await page.getByRole('textbox', { name: 'AI 비서에게 물어보기' }).fill('내 비공개 주거 상담');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await openAssistantNavigation(page);
  await expect(page.getByRole('region', { name: 'AI 비서 대화', exact: true })).toHaveCount(0);
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
    await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
    await page.getByRole('textbox', { name: 'AI 비서에게 물어보기' }).fill('집수리 지원');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    const conversation = page.getByRole('region', { name: 'AI 비서 대화', exact: true });
    await expect(conversation).toContainText('1920년 건축으로 확인했어요.');
    await page.getByRole('button', { name: '추천 공고로 돌아가기', exact: true }).click();
    const panel = page.getByRole('region', { name: '나를 위한 지원 현황', exact: true });
    if (action === 'edit') {
      await panel.getByRole('button', { name: '내 정보 수정', exact: true }).click();
      await panel.getByLabel('주택 준공연도').fill('2010');
      await panel
        .getByLabel('생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.', {
          exact: true,
        })
        .check();
      await panel.getByRole('button', { name: '저장하고 지원 찾기', exact: true }).click();
      await expect(panel.locator('.assistant-summary')).toContainText('2010년 준공');
    } else {
      await panel
        .getByRole('navigation', { name: 'AI 복지비서 상세 항목' })
        .getByRole('button', { name: '내 정보', exact: true })
        .click();
      await panel.getByRole('button', { name: '저장한 생활정보와 안내 삭제' }).click();
      await panel.getByRole('button', { name: '생활정보와 안내 기록 삭제', exact: true }).click();
    }
    await expect(conversation).toHaveCount(0);
    await page.getByRole('link', { name: '전체 공고', exact: true }).click();
    await openAssistantNavigation(page);
    await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
    await expect(conversation.getByRole('textbox', { name: 'AI 비서에게 물어보기' })).toHaveValue(
      '',
    );
    await expect(conversation).not.toContainText('1920년 건축으로 확인했어요.');
  });
}

test('first visit has one information entry point and separates saving consent from ongoing guidance', async ({
  page,
}) => {
  const state = await setup(page, blank());
  await page.goto('/#assistant');
  const panel = page.getByRole('region', { name: '나를 위한 지원 현황', exact: true });
  await expect(panel.getByRole('heading', { name: '내 정보부터 간단히 알려주세요' })).toBeVisible();
  await expect(panel.locator('.assistant-summary')).toHaveCount(0);
  await expect(panel.locator('.monitoring-dashboard-nav')).toHaveCount(0);
  await expect(page.locator('.assistant-page-conversation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'AI 챗봇 열기' })).toHaveCount(0);
  await expect(panel.locator('.assistant-member-summary')).toContainText('40세');
  await expect(panel.locator('.assistant-member-summary')).toContainText('서울');
  await panel.getByRole('button', { name: '내 정보 입력하기', exact: true }).click();
  const form = panel.getByRole('form', { name: '나에게 맞는 지원을 위한 정보' });
  await expect(form.getByRole('heading', { name: '나에게 맞는 지원을 위한 정보' })).toBeFocused();
  await expect(form.getByLabel('주택 준공연도')).not.toBeVisible();
  await expect(form.getByLabel('피해 발생일')).not.toBeVisible();
  const save = form.getByRole('button', { name: '내 정보 저장하기', exact: true });
  const watch = form.getByRole('switch', { name: '새 공고도 계속 알려받기 (선택)' });
  const consent = form.getByRole('checkbox', {
    name: '생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.',
  });
  await expect(watch).not.toBeChecked();
  await expect(consent).not.toBeChecked();
  await expect(save).toBeDisabled();
  await form.getByLabel('경제활동 구분').selectOption('not_working');
  await form.getByLabel('세부 상태').selectOption('취업 준비 중');
  await form.getByLabel('가구 구성').selectOption('혼자 살아요');
  // A suggested interest and occupation never become an assumed eligibility fact.
  const interest = form.getByRole('checkbox', { name: '일자리', exact: true });
  await interest.locator('..').click();
  await expect(interest).toBeChecked();
  await expect(form.getByLabel('구직 상태')).toHaveValue('');
  await watch.check();
  await expect(form.getByRole('button', { name: '저장하고 지원 찾기' })).toBeDisabled();
  await watch.uncheck();
  await consent.check();
  await save.click();
  await expect(panel.locator('.assistant-summary')).toContainText('취업 준비 중');
  await expect(form).toHaveCount(0);
  expect(
    state.calls.filter(({ path }) => path.endsWith('/profile')).map(({ body }) => body),
  ).toEqual([
    {
      profile: {
        ...emptyMonitoringProfile,
        occupation: '취업 준비 중',
        household: '혼자 살아요',
        interests: ['일자리'],
      },
      consent: true,
      enabled: false,
    },
  ]);
});

test('editing preserves collapsed information and a failed save keeps the draft for retry', async ({
  page,
}) => {
  const original = {
    ...emptyMonitoringProfile,
    occupation: '직장인',
    household: '가족과 살아요',
    interests: ['주거', '일자리'],
    housing_tenure: 'owner',
    housing_type: 'detached',
    building_year: 1920,
    repair_needed: false,
    job_seeking: false,
    disaster_type: 'flood',
    disaster_damage: false,
    disaster_occurred_on: '2026-01-01',
  };
  const state = await setup(page, { ...blank(), profile: original, enabled: true });
  state.failSaves = 1;
  await page.goto('/#assistant');
  await page.getByRole('button', { name: '내 정보 수정', exact: true }).click();
  const form = page.getByRole('form', { name: '나에게 맞는 지원을 위한 정보' });
  await expect(form.getByLabel('주택 준공연도')).toHaveValue('1920');
  await expect(form.getByLabel('피해 발생일')).toHaveValue('2026-01-01');
  await form
    .locator('details')
    .filter({ has: page.getByLabel('주택 준공연도') })
    .locator('summary')
    .click();
  await form
    .locator('details')
    .filter({ has: page.getByLabel('피해 발생일') })
    .locator('summary')
    .click();
  await expect(form.getByLabel('주택 준공연도')).not.toBeVisible();
  await expect(form.getByLabel('피해 발생일')).not.toBeVisible();
  await expect(form.getByRole('switch', { name: '새 공고도 계속 알려받기 (선택)' })).toBeChecked();
  await form.getByLabel('세부 상태').selectOption('자영업자');
  const consent = form.getByRole('checkbox', {
    name: '생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.',
  });
  await expect(consent).not.toBeChecked();
  await consent.check();
  await form.getByRole('button', { name: '저장하고 지원 찾기' }).click();
  await expect(form.getByRole('alert')).toContainText('입력한 생활정보와 날짜를 확인해 주세요.');
  await expect(form.getByRole('alert')).toBeFocused();
  await expect(form.getByLabel('세부 상태')).toHaveValue('자영업자');
  await expect(consent).toBeChecked();
  await expect(page.locator('.assistant-summary')).toHaveCount(0);
  expect(state.snapshot.profile).toEqual(original);
  await form.getByRole('button', { name: '저장하고 지원 찾기' }).click();
  await expect(page.locator('.assistant-summary')).toContainText('자영업자');
  expect(
    state.calls.filter(({ path }) => path.endsWith('/profile')).map(({ body }) => body),
  ).toEqual([
    { profile: { ...original, occupation: '자영업자' }, consent: true, enabled: true },
    { profile: { ...original, occupation: '자영업자' }, consent: true, enabled: true },
  ]);
});

for (const hasProfile of [false, true]) {
  test(`cancel discards unsaved changes and consent (${hasProfile ? 'existing' : 'first'} profile)`, async ({
    page,
  }) => {
    const state = await setup(page, hasProfile ? ready() : blank());
    await page.goto('/#assistant');
    const entry = page.getByRole('button', {
      name: hasProfile ? '내 정보 수정' : '내 정보 입력하기',
      exact: true,
    });
    await entry.click();
    const form = page.getByRole('form', { name: '나에게 맞는 지원을 위한 정보' });
    await form.getByLabel('경제활동 구분').selectOption('student');
    await form
      .getByRole('switch', { name: '새 공고도 계속 알려받기 (선택)' })
      .setChecked(!hasProfile);
    await form
      .getByRole('checkbox', {
        name: '생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.',
      })
      .check();
    await form.getByRole('button', { name: '취소', exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(state.calls.filter(({ path }) => path.endsWith('/profile'))).toEqual([]);
    await entry.click();
    await expect(form.getByLabel('경제활동 구분')).toHaveValue('');
    await expect(form.getByRole('switch', { name: '새 공고도 계속 알려받기 (선택)' })).toBeChecked({
      checked: hasProfile,
    });
    await expect(
      form.getByRole('checkbox', {
        name: '생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.',
      }),
    ).not.toBeChecked();
    if (hasProfile) await expect(form.getByLabel('주택 준공연도')).toHaveValue('1920');
  });
}

test('economic activity changes require an explicit detail and retain unedited legacy facts', async ({
  page,
}) => {
  const original = {
    ...emptyMonitoringProfile,
    occupation: '은퇴 후',
    job_seeking: false,
    housing_tenure: 'owner',
    building_year: 1990,
  };
  const state = await setup(page, { ...blank(), profile: original });
  await page.goto('/#assistant');
  await page.getByRole('button', { name: '내 정보 수정', exact: true }).click();
  const form = page.getByRole('form', { name: '나에게 맞는 지원을 위한 정보' });
  const activity = form.getByLabel('경제활동 구분');
  await expect(activity).toHaveValue('legacy');
  await expect(activity.locator('option').filter({ hasText: '은퇴 후' })).toHaveCount(0);
  await form.getByLabel('가구 구성').selectOption({ label: '1인 가구' });
  await form
    .getByRole('checkbox', {
      name: '생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.',
    })
    .check();
  await form.getByRole('button', { name: '내 정보 저장하기', exact: true }).click();
  expect(state.snapshot.profile).toEqual({ ...original, household: '혼자 살아요' });
  await page.getByRole('button', { name: '내 정보 수정', exact: true }).click();
  await activity.selectOption('working');
  const detail = form.getByLabel('세부 상태');
  await expect(detail).toHaveValue('');
  await detail.selectOption({ label: '임금근로자' });
  await expect(detail).toHaveValue('직장인');
  await activity.selectOption('not_working');
  await expect(detail).toHaveValue('');
  await expect(detail.locator('option').filter({ hasText: '임금근로자' })).toHaveCount(0);
  await detail.selectOption('무직');
  await expect(form.getByLabel('구직 상태')).toHaveValue('false');
  await form
    .getByRole('checkbox', {
      name: '생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.',
    })
    .check();
  await form.getByRole('button', { name: '내 정보 저장하기', exact: true }).click();
  expect(state.snapshot.profile).toEqual({
    ...original,
    occupation: '무직',
    household: '혼자 살아요',
  });
});
