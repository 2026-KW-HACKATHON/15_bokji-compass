import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { blankDialogue, completeDialogue, dialoguePolicy } from '../fixtures/dialogue.js';

async function setup(page) {
  await mockPolicyApi(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { user: { id: 'dialogue-member', name: '상담회원', age: 40, region: '서울' } },
    }),
  );
  await page.route('**/api/v1/monitoring', (route) =>
    route.fulfill({
      json: {
        profile: null,
        enabled: false,
        updated_at: null,
        last_checked_at: null,
        needs: [],
        candidates: [],
        alerts: [],
        unread_count: 0,
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI 챗봇 열기' }).click();
  const panel = page.getByRole('dialog', { name: '복지나침반 AI 챗봇' });
  await panel.getByRole('button', { name: /생활 상황으로 상담하고 싶어요/ }).click();
  return panel;
}
async function start(panel, question = '리모델링 지원금을 받을 수 있어?') {
  await panel.getByRole('textbox', { name: '어떤 도움이 필요하세요?' }).fill(question);
  await panel.getByRole('button', { name: '상담 시작하기', exact: true }).click();
}

test('guests can start and continue chatbot guidance without account storage', async ({ page }) => {
  await mockPolicyApi(page);
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: {} }));
  let turns = 0;
  await page.route('**/api/v1/assistant/chat/dialogue', (route) => {
    turns++;
    const body = route.request().postDataJSON();
    return route.fulfill({ json: body.answer ? completeDialogue() : blankDialogue() });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI 챗봇 열기' }).click();
  const panel = page.getByRole('dialog', { name: '복지나침반 AI 챗봇' });
  await panel.getByRole('button', { name: /생활 상황으로 상담하고 싶어요/ }).click();
  await expect(panel.getByRole('link', { name: '로그인', exact: true })).toHaveCount(0);
  await start(panel);
  await panel.getByRole('button', { name: '본인', exact: true }).click();
  await expect(panel.getByText(/1920년 건축으로 확인/)).toBeVisible();
  expect(turns).toBe(2);
  await expect(
    panel.getByRole('button', { name: '확인한 정보 저장하기', exact: true }),
  ).toHaveCount(0);
});

test('missing facts are answered in the conversation and storing only confirmed facts is opt in', async ({
  page,
}, testInfo) => {
  const calls = [];
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (!body.answer) return route.fulfill({ json: blankDialogue() });
    if (body.answer.slot === 'subject' || body.answer.value === '3000')
      return route.fulfill({
        json: blankDialogue({
          ...(body.answer.value === '3000'
            ? {
                answer_accepted: false,
                answer: '준공 연도는 올해 이전의 실제 연도로 입력해 주세요.',
              }
            : {}),
          follow_up: {
            slot: 'building_year',
            question: '건물은 몇 년에 지어졌나요?',
            input_type: 'number',
            options: [],
            allow_unknown: true,
          },
        }),
      });
    expect(body.answer).toEqual({ slot: 'building_year', value: '1920년 건축' });
    return route.fulfill({ json: completeDialogue() });
  });
  let saved = 0;
  await page.route('**/api/v1/assistant/dialogue/profile', (route) => {
    saved++;
    expect(route.request().postDataJSON()).toEqual({
      continuation: 'opaque-session-token',
      consent: true,
      confirmed: true,
    });
    return route.fulfill({
      json: {
        profile: completeDialogue().profile_draft,
        enabled: false,
        updated_at: '2026-10-07T00:00:00Z',
        last_checked_at: null,
        needs: [],
        candidates: [],
        alerts: [],
        unread_count: 0,
      },
    });
  });
  const panel = await setup(page);
  await start(panel);
  await expect(panel.getByText(/현재 가진 정보로는/)).toBeVisible();
  await panel.getByRole('button', { name: '본인', exact: true }).click();
  await panel.getByRole('button', { name: '정보 추가하기', exact: true }).click();
  const input = panel.getByRole('textbox', { name: '건물은 몇 년에 지어졌나요?' });
  await expect(input).toBeFocused();
  await input.fill('3000');
  await panel.getByRole('button', { name: '답변하고 다시 확인하기' }).click();
  await expect(panel.getByText('준공 연도는 올해 이전의 실제 연도로 입력해 주세요.')).toBeVisible();
  await expect(input).toHaveValue('3000');
  await input.fill('1920년 건축');
  await panel.getByRole('button', { name: '답변하고 다시 확인하기' }).click();
  await expect(panel.getByText(/건축 연도만으로 지원 여부를 확정할 수 없으며/)).toBeVisible();
  await expect(panel.getByRole('heading', { name: dialoguePolicy.title })).toBeVisible();
  await expect(panel.getByRole('link', { name: /공식 공고 확인/ })).toHaveAttribute(
    'href',
    dialoguePolicy.sourceUrl,
  );
  const save = panel.getByRole('button', { name: '확인한 정보 저장하기' });
  await expect(save).toBeDisabled();
  expect(saved).toBe(0);
  await panel.getByRole('checkbox', { name: /표시된 정보가 본인 정보임/ }).check();
  await save.click();
  await expect(panel.getByText(/내 정보에서 지속 복지 안내를 켜면/)).toBeVisible();
  expect(saved).toBe(1);
  expect(calls).toHaveLength(4);
  const bounds = await panel.boundingBox();
  const heading = await panel.getByRole('heading', { name: '복지나침반 AI 챗봇' }).boundingBox();
  expect(heading.y).toBeGreaterThanOrEqual(bounds.y);
  await page.screenshot({ path: testInfo.outputPath('guided-confirmed.png') });
});

test('leakage first gives practical steps and allows skipping optional support without storing damage', async ({
  page,
}, testInfo) => {
  const calls = [];
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    return route.fulfill({
      json: blankDialogue({
        topic: 'housing_leak',
        answer: body.answer
          ? '지금은 생활 대응 안내를 먼저 확인해 주세요.'
          : '누수 상황에서는 먼저 안전을 확인해 주세요.',
        practical_steps: [
          '물이 전기설비에 닿았거나 천장이 처졌다면 가까이 가지 마세요.',
          '안전한 곳에서 관리사무소나 임대인에게 상황을 알려 주세요.',
        ],
        missing_fields: [],
        follow_up: body.answer
          ? null
          : {
              slot: 'support_interest',
              question: '집수리 지원도 함께 알아볼까요?',
              input_type: 'select',
              options: [
                { value: true, label: '함께 알아보기' },
                { value: false, label: '생활 대응만 보기' },
              ],
              allow_unknown: true,
            },
      }),
    });
  });
  const panel = await setup(page);
  await start(panel, '집에 누수가 생겼어. 어떻게 해야 해?');
  await expect(panel.getByRole('heading', { name: '먼저 이렇게 대처해 주세요' })).toBeVisible();
  await expect(panel.getByText(/전기설비에 닿았거나/)).toBeVisible();
  await panel.getByRole('button', { name: '생활 대응만 보기' }).click();
  expect(calls[1].answer).toEqual({ slot: 'support_interest', value: false });
  await expect(panel.getByRole('button', { name: '확인한 정보 저장하기' })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await panel
      .locator('.chat-content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('guided-leak-320.png') });
});

test('cancelled late responses cannot replace a fresh consultation', async ({ page }) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let count = 0;
  await page.route('**/api/v1/assistant/dialogue', async (route) => {
    const sequence = ++count;
    if (sequence === 1) await held;
    await route
      .fulfill({
        json: blankDialogue({ answer: sequence === 1 ? '늦게 도착한 안내' : '새 상담의 안내' }),
      })
      .catch(() => {});
  });
  const panel = await setup(page);
  await start(panel);
  await panel.getByRole('button', { name: '요청 취소하기' }).click();
  await start(panel, '취업을 준비하고 있어요');
  await expect(panel.getByText('새 상담의 안내', { exact: true })).toBeVisible();
  release();
  await expect(panel.getByText('늦게 도착한 안내', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: '상담창 닫기' }).click();
  await page.getByRole('button', { name: 'AI 챗봇 열기' }).click();
  await panel.getByRole('button', { name: /생활 상황으로 상담하고 싶어요/ }).click();
  await expect(panel.getByText('새 상담의 안내', { exact: true })).toHaveCount(0);
});

test('expired sessions keep the entered answer and offer a fresh consultation', async ({
  page,
}) => {
  await page.route('**/api/v1/assistant/dialogue', (route) =>
    route.request().postDataJSON().answer
      ? route.fulfill({ status: 410, json: { detail: 'internal private detail' } })
      : route.fulfill({ json: blankDialogue() }),
  );
  const panel = await setup(page);
  await start(panel);
  await panel.getByRole('button', { name: '본인', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('새 상담을 시작');
  await expect(panel.getByText('internal private detail')).toHaveCount(0);
  await panel.getByRole('button', { name: '새 상담 시작하기' }).click();
  await expect(panel.getByRole('textbox', { name: '어떤 도움이 필요하세요?' })).toHaveValue('');
});

test('selected policy passes its revision and preserves a known mismatch with source evidence', async ({
  page,
}) => {
  const panel = await setup(page);
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [dialoguePolicy], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    expect(route.request().postDataJSON().revision_id).toBe(dialoguePolicy.revisionId);
    return route.fulfill({
      json: blankDialogue({
        selected_policy: {
          policy: dialoguePolicy,
          schedule_status: 'unknown',
          comparison: {
            status: 'not_matched',
            eligibility_decided: false,
            notes: ['현재 지역과 공고 지역이 달라요.'],
            checks: [
              {
                label: '거주 지역',
                state: 'mismatch',
                note: '공고에서 정한 지역을 확인해 주세요.',
                quote: '부산 지역 거주자',
              },
            ],
          },
        },
      }),
    });
  });
  await panel.getByRole('button', { name: '처음으로', exact: true }).click();
  await panel.getByRole('button', { name: /공고 내용이 궁금해요/ }).click();
  await panel.getByRole('button', { name: new RegExp(dialoguePolicy.title) }).click();
  await panel.getByRole('button', { name: '내 상황을 더해서 확인하기' }).click();
  await start(panel);
  await expect(panel.getByText('현재 알려준 정보와 맞지 않는 공고 조건이 있어요.')).toBeVisible();
  await panel.getByText('공고 조건과 비교 근거 보기').click();
  await expect(panel.getByText('부산 지역 거주자', { exact: true })).toBeVisible();
});

test('easy mode supports unknown answers and a direct route to correct saved facts', async ({
  page,
}, testInfo) => {
  const panel = await setup(page);
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    const body = route.request().postDataJSON();
    if (body.answer) expect(body.answer.value).toBeNull();
    return route.fulfill({
      json: blankDialogue({
        answer: body.answer
          ? '확인하지 못한 정보는 모르는 상태로 남겨둘게요.'
          : blankDialogue().answer,
        follow_up: body.answer ? null : blankDialogue().follow_up,
      }),
    });
  });
  await panel.getByRole('button', { name: '처음으로', exact: true }).click();
  await panel.getByRole('button', { name: /이용 방법이 궁금해요/ }).click();
  await panel.getByRole('button', { name: '쉬운 화면은 어떻게 켜나요?' }).click();
  await panel.getByRole('button', { name: '쉬운 화면으로 보기' }).click();
  await panel.getByRole('button', { name: '처음으로', exact: true }).click();
  await panel.getByRole('button', { name: /생활 상황으로 상담하고 싶어요/ }).click();
  await start(panel);
  await panel.getByRole('button', { name: '모르겠어요 / 건너뛰기' }).click();
  await expect(panel.getByText('확인하지 못한 정보는 모르는 상태로 남겨둘게요.')).toBeVisible();
  await expect(panel).toHaveClass(/chat-dialog-easy/);
  await page.screenshot({ path: testInfo.outputPath('guided-easy.png') });
  await panel.getByRole('button', { name: '저장한 생활정보 수정하기' }).click();
  await expect(page).toHaveURL(/#profile$/);
  await expect(panel).toHaveCount(0);
});
