import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';

test('untrusted policy text stays text and executable links are omitted', async ({ page }) => {
  await page.addInitScript(() => {
    window.__securityPayloadExecuted = false;
  });
  await mockPolicyApi(page);
  const payload = '<img src=x onerror="window.__securityPayloadExecuted=true">';
  const policy = {
    ...demoPolicies[0],
    title: payload,
    summary: payload,
    content: payload,
    sourceUrl: 'javascript:window.__securityPayloadExecuted=true',
    applicationUrl: 'data:text/html,<script>window.__securityPayloadExecuted=true</script>',
    budget: { usedPercent: 10, evidence: payload, sourceUrl: 'javascript:alert(1)' },
  };
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [policy], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v1/policies/' + policy.id, (route) => route.fulfill({ json: policy }));
  await page.goto('/#explore');
  const card = page.getByRole('article');
  await expect(card).toContainText(payload);
  await card.getByRole('button', { name: policy.title + ' 자세히 보기', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(payload);
  await expect(dialog.getByRole('link', { name: /공고 원문 보기|신청 페이지 열기/ })).toHaveCount(
    0,
  );
  await expect(page.locator('img[src="x"], [onerror]')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"], a[href^="data:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__securityPayloadExecuted)).toBe(false);
});

test('notice details expose original links and Korean labels in both display modes', async ({
  page,
}) => {
  await mockPolicyApi(page);
  const policy = {
    ...demoPolicies[0],
    title: '1인 사업주 보조공학기기 지원',
    audience: '장애인기업 중 1인 중증장애인 사업주',
    sourceUrl: 'https://www.gov.kr/portal/rcvfvrSvc/dtlEx/142100000001',
    applicationUrl: 'https://example.gov/apply',
    sourceFields: {
      laws: '장애인기업활동 촉진법 시행령(제10조, 제2항)',
      support_type: '현금',
      eligibility: '장애인기업 중 1인 중증장애인 사업주',
      application_period: '3~4월',
      '일정 확인 출처': 'https://www.naqs.go.kr/hp/contents/contents.do?menuId=MN30642',
    },
  };
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [policy], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v1/policies/' + policy.id, (route) => route.fulfill({ json: policy }));
  await page.goto('/#explore');
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    await page
      .getByRole('article')
      .getByRole('button', {
        name: policy.title + ' 자세히 보기',
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog');
    const original = dialog.getByRole('link', { name: /공고 원문 보기/ });
    await expect(original).toHaveAttribute('href', policy.sourceUrl);
    await expect(original).toHaveAttribute('target', '_blank');
    const scheduleSource = dialog.getByRole('link', { name: /일정 확인 출처/ });
    await expect(scheduleSource).toHaveAttribute('href', policy.sourceFields['일정 확인 출처']);
    await expect(scheduleSource).toHaveAttribute('target', '_blank');
    await expect(scheduleSource).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(dialog.getByRole('link', { name: /신청 페이지 열기/ })).toHaveAttribute(
      'href',
      policy.applicationUrl,
    );
    await dialog.getByText('공고의 전체 항목 확인', { exact: true }).click();
    const fields = dialog.locator('.policy-detail');
    await expect(fields.locator('dt', { hasText: '근거 법령' })).toBeVisible();
    await expect(fields.locator('dt', { hasText: '지원 형태' })).toBeVisible();
    await expect(fields.locator('dt', { hasText: /^laws$|^support_type$/ })).toHaveCount(0);
    await expect(dialog).toContainText(policy.audience);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});
