import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';
import { completeDialogue } from '../fixtures/dialogue.js';

const originalTitle = '2026학년도 2학기 국가근로장학금 학생 신청기간 안내';
const groupTitle = '광운대학교 2026년 2학기 국가근로장학금';
const fileId = 'b'.repeat(64);
const noticeTitles = [
  originalTitle,
  '2026학년도 2학기 국가근로장학금 신청자 대상 희망근로기관 신청 안내',
  '2026학년도 2학기 국가근로장학금 장학생 선발 확정 안내',
];

function groupedPolicy(latestStage = 'result') {
  const original = demoPolicies[0];
  const notices = ['application', 'followup', 'result'].map((stage, index) => ({
    id: index === 0 ? original.id : `notice:kw-${index}`,
    revisionId: `revision-kw-${index}`,
    title: noticeTitles[index],
    stage,
    publishedDate: ['2026-05-21', '2026-08-06', '2026-08-25'][index],
    sourceUrl: `https://www.kw.ac.kr/notice/${index}`,
  }));
  const filePath = `/v1/policies/${encodeURIComponent(original.id)}/attachments/${fileId}`;
  return {
    ...original,
    revisionId: notices[0].revisionId,
    title: originalTitle,
    summary: '국가근로장학금 최초 신청 안내와 후속 절차를 함께 확인할 수 있습니다.',
    content: '최초 신청 공고 원문은 그대로 보존됩니다.',
    applicationStart: null,
    applicationEnd: null,
    scheduleStatus: 'unknown',
    sourceUrl: notices[0].sourceUrl,
    noticeStage: 'application',
    noticeGroup: {
      id: 'kw-2026-2-work-study',
      title: groupTitle,
      latestStage,
      noticeCount: latestStage === 'result' ? 3 : 2,
      notices: latestStage === 'result' ? notices : notices.slice(0, 2),
    },
    applicationGuide: {
      methodText: '한국장학재단에서 신청',
      onlineUrl: 'https://apply.example.org/work-study',
      phones: [],
      visitText: '',
      documents: [{ id: 'student', label: '재학증명서', requirement: 'required' }],
      documentsStatus: 'listed',
      documentsNote: '',
    },
    attachments: [
      {
        id: fileId,
        name: '최초 신청 안내.pdf',
        downloadUrl: `${filePath}?download=true`,
        previewUrl: filePath,
        sourceUrl: 'https://www.kw.ac.kr/notice/0/file.pdf',
        sizeBytes: 1200,
      },
    ],
  };
}

async function showGroup(page, policy) {
  await mockPolicyApi(page);
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [policy], total: 1, nextCursor: null } }),
  );
  await page.route(`**/api/v1/policies/${policy.id}`, (route) => route.fulfill({ json: policy }));
  await page.goto('/#explore');
}

test('one series card exposes the three stages and preserves source details in both display modes', async ({
  page,
}, testInfo) => {
  const policy = groupedPolicy();
  await showGroup(page, policy);
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 760 });
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    const card = page.getByRole('article');
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('heading', { name: groupTitle, exact: true })).toBeVisible();
    await expect(card).toContainText('선발 결과 안내예요. 새로 신청하는 공고가 아니에요.');
    await expect(card.locator('.policy-deadline')).toHaveCount(0);
    const summary = card.locator('.notice-series-disclosure > summary');
    await expect(summary).toHaveText('관련 공고 3개');
    await summary.focus();
    await page.keyboard.press('Enter');
    for (let index = 0; index < 3; index++) {
      const link = card.locator('.notice-series-list a').nth(index);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', policy.noticeGroup.notices[index].sourceUrl);
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await expect(card).toContainText('신청 안내');
    await expect(card).toContainText('신청자 추가 절차');
    await expect(card).toContainText('선발 결과');
    await card.screenshot({
      path: testInfo.outputPath(`series-card-${easy ? 'easy' : 'standard'}.png`),
    });
    await card.getByRole('button', { name: groupTitle + ' 자세히 보기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: originalTitle, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.screenshot({
      path: testInfo.outputPath(`series-detail-${easy ? 'easy' : 'standard'}.png`),
    });
    await expect(dialog.getByText('현재 보고 있는 공고', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /공고 원문 보기/ })).toHaveAttribute(
      'href',
      policy.sourceUrl,
    );
    await expect(dialog.getByRole('button', { name: '이 공고 신청하기', exact: true })).toHaveCount(
      0,
    );
    await dialog.getByRole('button', { name: '신청 방법과 서류 확인', exact: true }).click();
    await expect(dialog).toContainText('한국장학재단에서 신청');
    await expect(dialog).toContainText('재학증명서');
    await expect(dialog.locator('a[href="https://apply.example.org/work-study"]')).toHaveCount(0);
    await expect(dialog.getByText('최초 신청 안내.pdf', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /PDF 보기/ })).toHaveAttribute(
      'href',
      `/api${policy.attachments[0].previewUrl}`,
    );
    await dialog.getByText('공고 본문 보기', { exact: true }).click();
    await expect(dialog).toContainText(policy.content);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await testInfo.attach(`series-${easy ? 'easy' : 'standard'}`, {
      path: testInfo.outputPath(`series-detail-${easy ? 'easy' : 'standard'}.png`),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('follow-up notices identify existing applicants and do not offer a new application', async ({
  page,
}) => {
  const policy = groupedPolicy('followup');
  await showGroup(page, policy);
  const card = page.getByRole('article');
  await expect(card).toContainText('이미 신청한 사람을 위한 추가 절차 안내예요.');
  await expect(card).toContainText('관련 공고 2개');
  await card.getByRole('button', { name: groupTitle + ' 자세히 보기', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '이 공고 신청하기', exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByRole('button', { name: '신청 방법과 서류 확인', exact: true }),
  ).toBeVisible();
});

test('untrusted series titles stay text and executable links never become anchors', async ({
  page,
}) => {
  const policy = groupedPolicy();
  const payload = '<img src=x onerror="window.__seriesExecuted=true">';
  policy.noticeGroup.title = payload;
  policy.noticeGroup.notices[1].title = payload;
  policy.noticeGroup.notices[1].sourceUrl = 'javascript:window.__seriesExecuted=true';
  await page.addInitScript(() => {
    window.__seriesExecuted = false;
  });
  await showGroup(page, policy);
  const card = page.getByRole('article');
  await expect(card.getByRole('heading', { name: payload, exact: true })).toBeVisible();
  await card.getByText('관련 공고 3개', { exact: true }).click();
  await expect(card.locator('.notice-series-list')).toContainText(payload);
  await expect(page.locator('a[href^="javascript:"], img[src="x"], [onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__seriesExecuted)).toBe(false);
});

test('a directly discussed result notice keeps documents without enabling a new application', async ({
  page,
}) => {
  const policy = {
    ...groupedPolicy(),
    id: 'notice:kw-2',
    revisionId: 'revision-kw-2',
    title: noticeTitles[2],
    noticeStage: 'result',
    noticeGroup: null,
    attachments: [],
  };
  await mockPolicyApi(page);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { id: 'notice-result-reader', name: '결과 확인 회원', age: 30, region: '서울' },
      },
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
  await page.route('**/api/v1/assistant/dialogue', (route) => {
    const response = completeDialogue();
    response.candidates[0].policy = policy;
    response.candidates[0].policy_id = policy.id;
    response.can_save_profile = false;
    response.selected_policy = {
      policy,
      comparison: {
        eligibility_decided: false,
        status: 'needs_review',
        notes: ['선발 결과 공고를 확인하고 있어요.'],
        checks: [],
      },
    };
    return route.fulfill({ json: response });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI 챗봇 열기' }).click();
  const conversation = page.getByRole('dialog', { name: '복지나침반 AI 챗봇' });
  await conversation.getByRole('button', { name: /생활 상황으로 상담하고 싶어요/ }).click();
  await conversation
    .getByRole('textbox', { name: '어떤 도움이 필요하세요?' })
    .fill('이 선발 결과 공고를 알려줘');
  await conversation.getByRole('button', { name: '상담 시작하기', exact: true }).click();
  const candidate = conversation.locator('.guided-candidates article');
  await expect(candidate.getByRole('heading', { name: policy.title })).toBeVisible();
  await expect(
    candidate.getByRole('button', { name: '이 공고 신청하기', exact: true }),
  ).toHaveCount(0);
  await candidate.getByRole('button', { name: '신청 방법과 서류 확인', exact: true }).click();
  const panel = candidate.locator('.application-guide-panel');
  await expect(panel).toContainText('선발 결과 안내예요. 새로 신청하는 공고가 아니에요.');
  await expect(panel).toContainText('재학증명서');
  await expect(panel.getByRole('link', { name: /온라인으로 신청하기/ })).toHaveCount(0);
});

test('an explicit closure is labeled recruitment ended rather than selection results', async ({
  page,
}) => {
  const policy = groupedPolicy();
  policy.noticeGroup.notices[2].title = '2026학년도 2학기 국가근로장학금 모집 종료 안내';
  await showGroup(page, policy);
  const card = page.getByRole('article');
  await expect(card.locator('.notice-series-status')).toContainText('모집 종료');
  await expect(card.locator('.notice-series-note')).toContainText('접수가 마감된 공고예요.');
  await expect(card.locator('.notice-series-note')).not.toContainText('선발 결과');
  await card.getByRole('button', { name: groupTitle + ' 자세히 보기', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '신청 방법과 서류 확인', exact: true }).click();
  await expect(dialog.locator('.application-guide-note')).toContainText('접수가 마감된 공고예요.');
});

test('four scholarship payment notices form one payment series with original links and no new application', async ({
  page,
}, info) => {
  const policy = groupedPolicy();
  const paymentGroupTitle = '광운대학교 2026년 2학기 국가장학금';
  const paymentNotices = Array.from({ length: 4 }, (_, index) => ({
    id: index === 3 ? policy.id : `notice:scholarship-payment-${index + 1}`,
    revisionId: `payment-revision-${index + 1}`,
    title: `2026학년도 2학기 국가장학금 ${index + 1}차 지급 안내`,
    stage: 'followup',
    publishedDate: `2026-10-0${index + 1}`,
    sourceUrl: `https://www.kw.ac.kr/notice/payment-${index + 1}`,
  }));
  Object.assign(policy, {
    title: paymentNotices[3].title,
    revisionId: paymentNotices[3].revisionId,
    category: '교육',
    organization: '광운대학교',
    summary: '국가장학금 지급 차수별 일정 안내',
    benefit: '선정된 학생 대상 국가장학금 지급',
    audience: '국가장학금 지급 대상으로 선정된 학생',
    tags: ['국가장학금', '교육'],
    noticeStage: 'followup',
    noticeGroup: {
      id: 'kw-2026-2-scholarship-payments',
      title: paymentGroupTitle,
      latestStage: 'followup',
      noticeCount: 4,
      notices: paymentNotices,
    },
    sourceUrl: paymentNotices[3].sourceUrl,
  });
  await showGroup(page, policy);
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 900 });
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    const card = page.getByRole('article');
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('heading', { name: paymentGroupTitle, exact: true })).toBeVisible();
    await expect(card.locator('.notice-series-status')).toContainText('지급 안내');
    await expect(card.locator('.notice-series-note')).toHaveText(
      '지급 일정 안내예요. 지급 대상과 일정을 공식 공고에서 확인해 주세요.',
    );
    await expect(card.locator('.notice-series-note')).not.toContainText('추가 절차');
    const summary = card.locator('.notice-series-disclosure > summary');
    await expect(summary).toHaveText('관련 공고 4개');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(card.locator('.notice-series-list > li')).toHaveCount(4);
    for (let index = 0; index < 4; index++) {
      const row = card.locator('.notice-series-list > li').nth(index);
      await expect(row.locator('.notice-stage-badge')).toHaveText('지급 안내');
      await expect(row.getByRole('link')).toHaveAttribute('href', paymentNotices[index].sourceUrl);
      await expect(row.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await card.screenshot({
      path: info.outputPath(`payment-series-card-${easy ? 'easy' : 'standard'}.png`),
    });
    await card
      .getByRole('button', { name: paymentGroupTitle + ' 자세히 보기', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: policy.title, exact: true });
    await expect(dialog.getByRole('button', { name: '이 공고 신청하기', exact: true })).toHaveCount(
      0,
    );
    await expect(dialog.getByRole('link', { name: /공고 원문 보기/ })).toHaveAttribute(
      'href',
      paymentNotices[3].sourceUrl,
    );
    await dialog.getByRole('button', { name: '신청 방법과 서류 확인', exact: true }).click();
    await expect(dialog.locator('.application-guide-note')).toHaveText(
      '지급 일정 안내예요. 지급 대상과 일정을 공식 공고에서 확인해 주세요.',
    );
    await expect(dialog.getByRole('link', { name: /온라인으로 신청하기/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});
