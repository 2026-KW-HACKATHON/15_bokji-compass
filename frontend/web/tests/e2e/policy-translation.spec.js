import { test, expect } from '@playwright/test';
import { demoPolicies } from '../fixtures/policies.js';

// Synthetic content exercises display translation without sending public/user data to an LLM.
const original = {
  ...demoPolicies[0],
  revisionId: 'fixture-revision-translation',
  applicationPeriod: '2026-10-01 ~ 2026-10-31 온라인 접수',
  applicationStart: '2026-10-01',
  applicationEnd: '2026-10-31',
  scheduleStatus: 'dated',
  paymentSchedule: '2026-11-10 지급',
  content: '신청서를 제출하면 자격을 확인합니다.',
  gender: '성별 제한 없음',
  contact: '담당 부서 02-1234-5678',
  applicationMethod: '온라인 신청',
  otherConditions: ['서울 거주자'],
  sourceFields: { documents: '신분증 사본', application_period: '2026-10-01 ~ 2026-10-31 접수' },
  sourceUrl: 'https://example.com/notice/fixture-housing',
  applicationUrl: 'https://example.com/apply/fixture-housing',
  publishedDate: '2026-09-22',
  modifiedDate: '2026-10-01',
  budgetNotice: '예산 소진 시 조기 마감',
};
const content = {
  en: [
    'Housing support for your first home',
    'Help with rent and housing costs.',
    'Housing Support Office',
    'Rent support',
    'Young adults',
    'Online applications',
    'Paid',
    'Eligibility is checked after submitting the form.',
    'No gender restriction',
    'Support office',
    'Apply online',
    'Seoul residents',
    'Copy of ID',
    'Closes when the budget is exhausted',
  ],
  zh: [
    '首次独立生活住房补助',
    '提供租金和住房费用支持。',
    '住房补助部门',
    '租金补助',
    '青年',
    '网上申请',
    '发放',
    '提交申请表后审核资格。',
    '不限性别',
    '负责部门',
    '在线申请',
    '首尔居民',
    '身份证复印件',
    '预算用完后提前结束',
  ],
  vi: [
    'Hỗ trợ nhà ở cho lần sống tự lập đầu tiên',
    'Hỗ trợ tiền thuê nhà và chi phí nhà ở.',
    'Bộ phận hỗ trợ nhà ở',
    'Hỗ trợ tiền thuê nhà',
    'Thanh niên',
    'Đăng ký trực tuyến',
    'Chi trả',
    'Kiểm tra điều kiện sau khi nộp đơn.',
    'Không giới hạn giới tính',
    'Bộ phận phụ trách',
    'Đăng ký trực tuyến',
    'Cư dân Seoul',
    'Bản sao giấy tờ tùy thân',
    'Kết thúc sớm khi hết ngân sách',
  ],
  ja: [
    '初めての一人暮らしへの住居費支援',
    '家賃と住居費を支援します。',
    '住居支援担当部署',
    '家賃支援',
    '若者',
    'オンライン受付',
    '支給',
    '申請書の提出後に資格を確認します。',
    '性別制限なし',
    '担当部署',
    'オンライン申請',
    'ソウル居住者',
    '身分証明書の写し',
    '予算がなくなり次第終了',
  ],
};
function response(language) {
  const [
    title,
    summary,
    organization,
    benefit,
    audience,
    period,
    payment,
    body,
    gender,
    contact,
    method,
    condition,
    document,
    budgetNotice,
  ] = content[language];
  return {
    policy_id: original.id,
    revision_id: original.revisionId,
    language,
    source_language: 'ko',
    source_hash: 'a'.repeat(64),
    cached: false,
    translation: {
      title,
      summary,
      organization,
      benefit,
      audience,
      applicationPeriod: `2026-10-01 ~ 2026-10-31 ${period}`,
      paymentSchedule: `2026-11-10 ${payment}`,
      content: body,
      gender,
      contact: `${contact} 02-1234-5678`,
      applicationMethod: method,
      otherConditions: [condition],
      sourceFields: {
        documents: document,
        application_period: `2026-10-01 ~ 2026-10-31 ${period}`,
      },
      budgetNotice,
    },
  };
}
async function mockNotices(
  page,
  translate = (route, language) => route.fulfill({ json: response(language) }),
) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [original], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v1/policies/fixture-housing', (route) =>
    route.fulfill({ json: original }),
  );
  await page.route('**/api/v1/policies/*/translation?**', (route) =>
    translate(route, new URL(route.request().url()).searchParams.get('language')),
  );
}

for (const language of ['en', 'zh', 'vi', 'ja']) {
  test(`${language}: translated notice and detail keep original actions, links and dates`, async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = [];
    await mockNotices(page, (route, locale) => {
      requests.push(locale);
      return route.fulfill({ json: response(locale) });
    });
    await page.goto('/#explore');
    await expect(page.locator('.policy-card .card-title')).toHaveText(original.title);
    expect(requests).toEqual([]);
    await page.locator('.language-selector select').selectOption(language);
    await page.locator('.policy-card').scrollIntoViewIfNeeded();
    const translated = response(language).translation;
    await expect(page.locator('.policy-card .card-title')).toHaveText(translated.title);
    await expect(page.locator('.policy-card .card-summary')).toHaveText(translated.summary);
    await page.locator('.policy-card .card-title').click();
    const dialog = page.getByRole('dialog').filter({ has: page.locator('.detail-highlight') });
    await expect(dialog.locator('.modal-description')).toHaveText(translated.summary);
    await expect(dialog.locator('.detail-highlight p')).toHaveText(translated.benefit);
    await expect(dialog).toContainText(translated.organization);
    await expect(dialog).toContainText('2026-11-10');
    await expect(dialog).toContainText('02-1234-5678');
    await expect(
      dialog.locator('a[href="https://example.com/notice/fixture-housing"]'),
    ).toBeVisible();
    await expect(
      dialog.locator('a[href="https://example.com/apply/fixture-housing"]'),
    ).toBeVisible();
    const toggle = dialog.locator('.policy-translation-status button[aria-pressed]');
    await toggle.click();
    await expect(dialog.locator('.modal-description')).toHaveText(original.summary);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const refreshed = page.waitForResponse(
      (result) => new URL(result.url()).pathname === '/api/v1/policies/fixture-housing',
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshed;
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('.modal-description')).toHaveText(original.summary);
    await toggle.click();
    await expect(dialog.locator('.modal-description')).toHaveText(translated.summary);
    await dialog
      .locator('.detail-actions button')
      .filter({ has: page.locator('svg.lucide-bookmark') })
      .click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bokji.saved.v2.api')));
    expect(saved[0]).toMatchObject({
      id: original.id,
      revisionId: original.revisionId,
      title: original.title,
      category: '주거',
      region: '서울',
      sourceUrl: original.sourceUrl,
    });
    expect(errors).toEqual([]);
    // List/detail share one cached translation for the same notice revision.
    expect(requests).toEqual([language]);
  });
}

test('delayed obsolete language cannot replace the newly selected translation', async ({
  page,
}) => {
  let releaseEnglish;
  const englishGate = new Promise((resolve) => {
    releaseEnglish = resolve;
  });
  let englishStarted = false;
  await mockNotices(page, async (route, language) => {
    if (language === 'en') {
      englishStarted = true;
      await englishGate;
    }
    await route.fulfill({ json: response(language) });
  });
  await page.goto('/#explore');
  await expect(page.locator('.policy-card .card-title')).toHaveText(original.title);
  await page.locator('.language-selector select').selectOption('en');
  await page.locator('.policy-card').scrollIntoViewIfNeeded();
  await expect.poll(() => englishStarted).toBe(true);
  await expect(page.locator('.policy-card .policy-translation-status')).toContainText(
    'Translating this notice',
  );
  await expect(page.locator('.policy-card .card-title')).toHaveText(original.title);
  await page.locator('.language-selector select').selectOption('vi');
  releaseEnglish();
  await expect(page.locator('.policy-card .card-title')).toHaveText(content.vi[0]);
  await expect(page.locator('.policy-card')).not.toContainText(content.en[0]);
});

test('failed translation labels the original and retry recovers', async ({ page }) => {
  let failed = false;
  await mockNotices(page, (route, language) => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, json: { detail: 'translation_unavailable' } });
    }
    return route.fulfill({ json: response(language) });
  });
  await page.goto('/#explore');
  await expect(page.locator('.policy-card .card-title')).toHaveText(original.title);
  await page.locator('.language-selector select').selectOption('en');
  await page.locator('.policy-card').scrollIntoViewIfNeeded();
  await expect(page.locator('.policy-card .policy-translation-status')).toContainText(
    'Could not load the translation. Showing the Korean original.',
  );
  await expect(page.locator('.policy-card .card-title')).toHaveText(original.title);
  await page.getByRole('button', { name: 'Retry translation', exact: true }).click();
  await expect(page.locator('.policy-card .card-title')).toHaveText(content.en[0]);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
});

test('absent source fields keep translated UI fallbacks without weakening content validation', async ({
  page,
}) => {
  const incomplete = {
    id: original.id,
    revisionId: original.revisionId,
    title: '일부 정보가 없는 공고',
    summary: '공개 요약',
    tags: [],
  };
  await mockNotices(page, (route, language) =>
    route.fulfill({
      json: {
        ...response(language),
        translation: {
          title: 'Notice with missing details',
          summary: 'Public summary',
          audience: '',
          organization: '',
          benefit: '',
          applicationPeriod: '',
          paymentSchedule: null,
          content: '',
          gender: '',
          contact: '',
          applicationMethod: '',
          budgetNotice: null,
          otherConditions: [],
          sourceFields: {},
        },
      },
    }),
  );
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [incomplete], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v1/policies/fixture-housing', (route) =>
    route.fulfill({ json: incomplete }),
  );
  await page.goto('/#explore');
  await expect(page.locator('.policy-card .card-title')).toHaveText(incomplete.title);
  await expect(page.locator('.policy-card .card-meta').first()).toContainText('기관 확인 필요');
  await page.locator('.language-selector select').selectOption('en');
  await page.locator('.policy-card').scrollIntoViewIfNeeded();
  await expect(page.locator('.policy-card .card-title')).toHaveText('Notice with missing details');
  await expect(page.locator('.policy-card .card-meta').first()).toContainText(
    'Organization needs checking',
  );
  await expect(page.locator('.policy-card .policy-translation-status')).not.toHaveClass(/is-error/);
  await page.locator('.policy-card .card-title').click();
  const dialog = page.getByRole('dialog').filter({ has: page.locator('.detail-highlight') });
  await expect(dialog).toContainText('Check the official notice');
  await expect(dialog).toContainText('Eligibility needs checking');
});
