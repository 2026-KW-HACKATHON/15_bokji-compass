import { test, expect } from '@playwright/test';

test('admin revisions refresh public cards and an open detail, and unpublishing closes it', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-07T03:00:00Z') });
  let policy = {
    id: 'gov24:editor-fixture',
    title: '편집 전 테스트 공고',
    summary: '편집 전 요약',
    category: '교육',
    tags: ['교육'],
    region: '전국',
    audience: '전체',
    organization: '테스트 기관',
    benefit: '지원 내용',
    applicationPeriod: '상시 신청',
    sourceUrl: 'https://example.com/source',
    content: '편집 전 원문',
  };
  await page.route('**/api/v1/recommendations', (route) =>
    route.fulfill({ json: { items: [], summary: '' } }),
  );
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({
      json: {
        items: policy ? [policy] : [],
        total: policy ? 1 : 0,
        nextCursor: null,
      },
    }),
  );
  await page.route(/\/api\/v1\/policies\/gov24%3Aeditor-fixture$/, (route) =>
    route.fulfill(policy ? { json: policy } : { status: 404, json: {} }),
  );
  await page.goto('/#explore');
  await page.getByRole('button', { name: '편집 전 테스트 공고 자세히 보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('편집 전 요약');
  policy = {
    ...policy,
    title: '수정된 테스트 공고',
    summary: '관리자가 저장한 요약',
    content: '수정된 전체 본문',
    applicationMethod: '온라인 접수',
    contact: '새 문의처',
  };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog')).toContainText('관리자가 저장한 요약');
  await expect(page.getByRole('dialog')).toContainText('새 문의처');
  await page.getByRole('dialog').getByText('공고 본문 보기', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('수정된 전체 본문');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('article')).toContainText('수정된 테스트 공고');
  await page.getByRole('button', { name: '수정된 테스트 공고 자세히 보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  policy = null;
  await page.clock.fastForward(30001);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(
    page.getByText('이 공고는 비공개로 변경됐습니다. 최신 목록을 확인해 주세요.'),
  ).toBeVisible();
});
