import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { blankDialogue } from '../fixtures/dialogue.js';

for (const guest of [true, false]) {
  test(`personal search carries the submitted sentence into an unsent ${guest ? 'guest' : 'member'} chat`, async ({
    page,
  }) => {
    await mockPolicyApi(page);
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill(
        guest
          ? { status: 401, json: {} }
          : { json: { user: { id: 'search-member', name: '검색회원', age: 24, region: '서울' } } },
      ),
    );
    await page.route('**/api/v1/auth/kakao/status', (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route('**/api/v1/policies?**', (route) =>
      route.fulfill({
        json: {
          items: [],
          total: 0,
          nextCursor: null,
        },
      }),
    );
    const calls = [];
    await page.route(/\/api\/v1\/assistant\/(?:chat\/)?dialogue$/, (route) => {
      calls.push(route.request().postDataJSON());
      return route.fulfill({ json: blankDialogue() });
    });
    await page.goto('/#explore');
    const original = '나는 휴학한 학생이고 지원금과 관련된 정보가 필요해';
    const input = page.getByRole('textbox', { name: '공고 검색', exact: true });
    await input.fill(original);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('heading', { name: '조건에 맞는 공고가 없어요' })).toBeVisible();
    const suggestion = page.getByRole('complementary', { name: 'AI 비서 상담 안내' });
    await expect(suggestion).toBeVisible();
    await input.fill('아직 제출하지 않은 다른 검색 문장');
    await suggestion.getByRole('button', { name: '이 내용으로 AI 비서와 상담하기' }).click();
    await expect(page).toHaveURL(/#assistant-chat$/);
    const composer = page.getByRole('textbox', { name: 'AI 비서에게 물어보기' });
    await expect(composer).toHaveValue(original);
    expect(calls).toEqual([]);
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(page.getByRole('region', { name: '생활 상담 안내' })).toBeVisible();
    expect(calls).toEqual([{ question: original, mode: 'conversation' }]);
  });
}
