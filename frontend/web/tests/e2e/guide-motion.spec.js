import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

test.beforeEach(async ({ page }) => {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#guide');
  await expect(page.getByRole('heading', { level: 1, name: /필요한 복지를/ })).toBeVisible();
});

test('search animation gives control to the visitor and preserves their category on replay', async ({
  page,
}) => {
  const search = page.locator('.guide-search-showcase');
  await search.scrollIntoViewIfNeeded();
  await expect(search).toHaveAttribute('data-guide-sequence', 'playing');
  await expect
    .poll(() => search.evaluate((element) => element.getAnimations({ subtree: true }).length))
    .toBeGreaterThan(0);

  const education = search.getByRole('button', { name: '교육', exact: true });
  await education.click();
  await expect(search).toHaveAttribute('data-guide-sequence', 'complete');
  await expect(education).toHaveAttribute('aria-pressed', 'true');
  await expect(search.getByRole('heading', { name: '배움의 기회를 넓히는 지원' })).toBeVisible();
  await search.getByRole('button', { name: '공고 찾기 소개 애니메이션 다시 보기' }).click();
  await expect(search).toHaveAttribute('data-guide-sequence', 'playing');
  await expect(search).toHaveAttribute('data-guide-sequence', 'complete');
  await expect(education).toHaveAttribute('aria-pressed', 'true');
  await expect(search.getByRole('heading', { name: '배움의 기회를 넓히는 지원' })).toBeVisible();

  await page.locator('.guide-profile-stage').scrollIntoViewIfNeeded();
  await search.scrollIntoViewIfNeeded();
  await expect(search).toHaveAttribute('data-guide-sequence', 'complete');
  await education.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(search.getByRole('button', { name: '건강·돌봄', exact: true })).toBeFocused();
  await expect(search.getByRole('heading', { name: '건강과 돌봄 서비스' })).toBeVisible();
});

test('matching finishes once, can replay, and immediately respects a reduced motion preference', async ({
  page,
}) => {
  const match = page.locator('.guide-profile-stage');
  await match.scrollIntoViewIfNeeded();
  await expect(match).toHaveAttribute('data-guide-sequence', 'playing');
  await expect(match).toHaveAttribute('data-guide-sequence', 'complete');
  await expect(match.locator('.guide-match-reason')).toHaveCSS('opacity', '1');

  await match.getByRole('button', { name: '맞춤 추천 소개 애니메이션 다시 보기' }).click();
  await expect(match).toHaveAttribute('data-guide-sequence', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(match).toHaveAttribute('data-guide-sequence', 'static');
  await expect(match.locator('.guide-match-reason')).toHaveCSS('opacity', '1');
  await expect(
    match.getByRole('button', { name: '맞춤 추천 소개 애니메이션 다시 보기' }),
  ).toBeHidden();
  await expect
    .poll(() =>
      match.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running' || animation.pending).length,
      ),
    )
    .toBe(0);

  await page.reload();
  await expect(page.locator('.guide-profile-stage')).toHaveAttribute(
    'data-guide-sequence',
    'static',
  );
  await expect(page.locator('.guide-match-reason')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('button', { name: /소개 애니메이션 다시 보기/ })).toHaveCount(0);
});
