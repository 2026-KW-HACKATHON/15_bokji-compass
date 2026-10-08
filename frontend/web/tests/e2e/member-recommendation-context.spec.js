import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { completeDialogue, dialoguePolicy } from '../fixtures/dialogue.js';
import { assistantIntroKey } from '../../src/features/assistant/assistantIntroModel.js';

test('changing account gender refreshes recommendations and discards the previous consultation', async ({
  page,
}) => {
  await mockPolicyApi(page);
  const state = {
    user: {
      id: 'gender-context-member',
      username: 'gender_context_member',
      name: '성별수정회원',
      age: 40,
      gender: 'female',
      region: '서울',
    },
    recommendationGenders: [],
    monitoringGenders: [],
    profileBodies: [],
  };
  const policy = { ...dialoguePolicy, title: '시험용 여성 지원 공고' };
  const candidate = { ...completeDialogue().candidates[0], policy };
  const snapshot = () => ({
    profile: completeDialogue().profile_draft,
    enabled: true,
    updated_at: '2026-10-08T02:00:00Z',
    last_checked_at: '2026-10-08T02:00:00Z',
    needs: [],
    candidates:
      state.user.gender === 'female' ? [{ ...candidate, active: true, state: 'watching' }] : [],
    alerts: [],
    unread_count: 0,
  });
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'seen'),
    assistantIntroKey(state.user.id),
  );
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: state.user } }));
  await page.route('**/api/v1/auth/profile', (route) => {
    const body = route.request().postDataJSON();
    state.profileBodies.push(body);
    state.user = { ...state.user, ...body };
    return route.fulfill({ json: { user: state.user } });
  });
  await page.route('**/api/v1/finance/profile', (route) =>
    route.fulfill({ json: { profile: null, calculation: null, updated_at: null } }),
  );
  await page.route('**/api/v1/recommendations', (route) => {
    state.recommendationGenders.push(state.user.gender);
    return route.fulfill({
      json: {
        items: state.user.gender === 'female' ? [{ policy, reason: '시험용 성별 조건 추천' }] : [],
        summary: '시험용 회원 정보 추천',
        mode: 'personalized',
        profile_sufficient: true,
        missing_fields: [],
      },
    });
  });
  await page.route('**/api/v1/monitoring**', (route) => {
    state.monitoringGenders.push(state.user.gender);
    return route.fulfill({ json: snapshot() });
  });
  await page.route('**/api/v1/assistant/dialogue', (route) =>
    route.fulfill({
      json: {
        ...completeDialogue(),
        answer: '시험용 여성 지원 상담 응답',
        candidates: [candidate],
      },
    }),
  );

  await page.goto('/');
  const recommendations = page.getByRole('region', { name: '추천 공고', exact: true });
  await expect(recommendations).toContainText(policy.title);
  await page.goto('/#assistant-overview');
  await expect(page.locator('.monitoring-candidate')).toContainText(policy.title);
  await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
  const conversation = page.locator('.assistant-page-conversation');
  await conversation
    .getByRole('textbox', { name: '어떤 도움이 필요하세요?' })
    .fill('지원 공고 안내');
  await conversation.getByRole('button', { name: '상담 시작하기', exact: true }).click();
  await expect(conversation).toContainText('시험용 여성 지원 상담 응답');

  // Hash navigation keeps the tab's conversation in memory, so the saved member
  // update must invalidate it before returning to the assistant.
  await page.evaluate(() => {
    window.location.hash = 'profile';
  });
  await page.getByRole('tab', { name: '기본 정보', exact: true }).click();
  await page.getByRole('button', { name: '기본 정보 수정', exact: true }).click();
  const form = page.getByRole('form', { name: '회원 정보 수정' });
  await form.getByLabel('성별', { exact: true }).selectOption('male');
  await form.getByRole('button', { name: '회원 정보 저장', exact: true }).click();
  await expect.poll(() => state.profileBodies.at(-1)?.gender).toBe('male');
  await expect(form).toHaveCount(0);
  await expect.poll(() => state.recommendationGenders.at(-1)).toBe('male');

  await page.evaluate(() => {
    window.location.hash = 'home';
  });
  await expect(recommendations.getByRole('article')).toHaveCount(0);
  await expect(recommendations).not.toContainText(policy.title);
  await page.evaluate(() => {
    window.location.hash = 'assistant-overview';
  });
  await expect.poll(() => state.monitoringGenders.at(-1)).toBe('male');
  await expect(page.locator('.monitoring-candidate')).toHaveCount(0);
  await expect(page.locator('.assistant-page-conversation')).toHaveCount(0);
  await page.getByRole('button', { name: '궁금한 점 물어보기', exact: true }).click();
  await expect(
    page.locator('.assistant-page-conversation').getByRole('textbox', {
      name: '어떤 도움이 필요하세요?',
    }),
  ).toHaveValue('');
  await expect(page.locator('.assistant-page-conversation')).not.toContainText(
    '시험용 여성 지원 상담 응답',
  );
});
