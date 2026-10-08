import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';

test('easy cards align varied content and keep detail actions beside or below it', async ({
  page,
}, testInfo) => {
  await mockPolicyApi(page);
  const items = demoPolicies.slice(0, 3).map((policy, index) => ({
    ...policy,
    summary: index === 0 ? policy.summary.repeat(8) : '교육비 지원',
    benefit: index === 0 ? policy.benefit.repeat(8) : '교육비 지원',
    applicationPeriod: '2026년 10월 1일 ~ 10월 31일',
    popularity:
      index === 0
        ? {
            source: 'bokjiro',
            views: 12895947,
            basis: 'provider_cumulative_views',
            asOf: '2026-10-07T00:00:00Z',
          }
        : null,
  }));
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items, total: items.length, nextCursor: null } }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#explore');
  await page.getByRole('switch', { name: /^쉬운 화면/ }).click();
  await expect(page.locator('.easy-policy-card')).toHaveCount(3);
  await expect(page.locator('.easy-policy-card').first()).toContainText('12,895,947회');
  await page.evaluate(() => document.fonts.ready);

  const widths = testInfo.project.name === 'desktop' ? [1440, 768, 681] : [680, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1100 });
    const layout = await page.locator('.easy-policy-card').evaluateAll((cards) =>
      cards.map((card) => {
        const bounds = (element) => {
          const { x, y, right, bottom } = element.getBoundingClientRect();
          return { x, y, right, bottom };
        };
        return {
          card: bounds(card),
          content: bounds(card.querySelector('.easy-card-content')),
          action: bounds(card.querySelector('.detail-link')),
        };
      }),
    );
    for (const [index, { card, content, action }] of layout.entries()) {
      expect(
        Math.abs(content.x - layout[0].content.x),
        `content alignment at ${width}px`,
      ).toBeLessThan(1);
      expect(action.right).toBeLessThanOrEqual(card.right);
      expect(action.bottom).toBeLessThanOrEqual(card.bottom);
      if (width > 680) {
        expect(action.x, `action beside content at ${width}px`).toBeGreaterThan(content.right);
      } else {
        expect(action.y, `action below content at ${width}px`).toBeGreaterThan(content.bottom);
        expect(
          Math.abs(action.right - content.right),
          `action right alignment at ${width}px`,
        ).toBeLessThan(1);
      }
      if (index > 0) {
        expect(
          Math.abs(card.y - layout[index - 1].card.bottom),
          `continuous list at ${width}px`,
        ).toBeLessThan(1);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`easy-cards-${width}.png`), fullPage: true });
  }

  const detail = page
    .locator('.easy-policy-card')
    .first()
    .getByRole('button', { name: /자세히 보기/ });
  await detail.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText(items[0].title);
});
