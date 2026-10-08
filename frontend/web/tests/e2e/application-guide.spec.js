import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { completeDialogue, dialoguePolicy } from '../fixtures/dialogue.js';
import { assistantIntroKey } from '../../src/features/assistant/assistantIntroModel.js';
import { emptyMonitoringProfile } from '../../src/features/monitoring/monitoringModel.js';

const member = { id: 'application-guide-member', name: '신청회원', age: 40, region: '서울' };
const originalGuide = {
  methodText: '온라인 또는 접수 담당자에게 전화로 신청할 수 있습니다.',
  onlineUrl: 'https://apply.example.go.kr/services/housing-repair/apply',
  phones: [
    { number: '02-1234-5678', label: '주택 수리 접수 담당자', kind: 'application' },
    { number: '1350', label: '상담 센터', kind: 'inquiry' },
  ],
  visitText: '주소지 관할 센터에 방문하여 신청할 수 있습니다.',
  documents: [
    { id: 'doc-a', label: '신분증' },
    { id: 'doc-b', label: '소득 증빙 서류 (해당자만)' },
  ],
  documentsStatus: 'listed',
  documentsNote: '최근 3개월 이내 발급분을 준비해 주세요.',
};
const guidedPolicy = () => ({
  ...dialoguePolicy,
  applicationGuide: structuredClone(originalGuide),
});

test('closed notices keep preparation information without offering an application action', async ({
  page,
}) => {
  const policy = {
    ...guidedPolicy(),
    id: 'closed-application',
    title: '접수가 종료된 신청 시험 공고',
    applicationEnd: '2020-12-31',
    scheduleStatus: 'dated',
  };
  await setup(page, { user: null, policies: [policy] });
  await page.goto('/#explore');
  await page
    .getByRole('article')
    .filter({ hasText: policy.title })
    .getByRole('button', { name: `${policy.title} 자세히 보기`, exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '이 공고 신청하기', exact: true })).toHaveCount(
    0,
  );
  await dialog.getByRole('button', { name: '신청 방법과 서류 확인', exact: true }).click();
  const panel = dialog.locator('.application-guide-panel');
  await expect(panel).toContainText('접수가 마감된 공고예요.');
  await expect(
    panel.getByRole('link', { name: /온라인으로 신청하기|전화로 신청하기/ }),
  ).toHaveCount(0);
  await expect(panel.getByRole('link', { name: /신청 방법 전화 문의/ })).toHaveAttribute(
    'href',
    'tel:1350',
  );
  await expect(panel).toContainText('소득 증빙 서류 (해당자만)');
});
const ready = () => ({
  profile: { ...emptyMonitoringProfile, housing_tenure: 'owner', building_year: 1920 },
  enabled: true,
  updated_at: '2026-10-08T02:00:00Z',
  last_checked_at: '2026-10-08T02:00:00Z',
  needs: [
    {
      id: 'housing_repair',
      title: '주택 수리',
      reason: '저장한 주거 상황',
      keywords: ['주택'],
      questions: [],
    },
  ],
  candidates: [
    {
      ...completeDialogue().candidates[0],
      policy: guidedPolicy(),
      active: true,
      state: 'watching',
      application_preparation: {
        revision_id: dialoguePolicy.revisionId,
        prepared_document_ids: [],
      },
    },
  ],
  alerts: [],
  unread_count: 0,
});

async function setup(page, { user = member, policies = [guidedPolicy()] } = {}) {
  await mockPolicyApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(
    (keys) => keys.forEach((key) => localStorage.setItem(key, 'seen')),
    [assistantIntroKey(member.id), assistantIntroKey(null)],
  );
  const state = {
    snapshot: ready(),
    calls: [],
    failPreparation: 0,
    conflictPreparation: 0,
    nextSnapshot: null,
  };
  await page.route('**/api/v1/auth/kakao/status', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(user ? { json: { user } } : { status: 401, json: {} }),
  );
  await page.route('**/api/v1/finance/profile', (route) =>
    route.fulfill({ json: { profile: null, calculation: null, updated_at: null } }),
  );
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: policies, total: policies.length, nextCursor: null } }),
  );
  for (const policy of policies)
    await page.route(`**/api/v1/policies/${policy.id}`, (route) => route.fulfill({ json: policy }));
  await page.route('**/api/v1/monitoring**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    state.calls.push({ path, body });
    if (path.endsWith('/candidates/preparation')) {
      if (state.failPreparation) {
        state.failPreparation--;
        return route.fulfill({ status: 503, json: {} });
      }
      if (state.conflictPreparation) {
        state.conflictPreparation--;
        return route.fulfill({ status: 409, json: {} });
      }
      const preparation = state.snapshot.candidates[0].application_preparation;
      preparation.prepared_document_ids = body.prepared
        ? [...new Set([...preparation.prepared_document_ids, body.document_id])]
        : preparation.prepared_document_ids.filter((id) => id !== body.document_id);
    }
    if (path.endsWith('/refresh') && state.nextSnapshot) {
      state.snapshot = state.nextSnapshot;
      state.nextSnapshot = null;
    }
    return route.fulfill({ json: state.snapshot });
  });
  return state;
}

async function openGuide(page, info) {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 1500 });
  await page.goto('/#assistant');
  const card = page.locator('.monitoring-candidate');
  const trigger = card.getByRole('button', { name: '이 공고 신청하기', exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const panel = card.locator('.application-guide-panel');
  await expect(
    panel.getByRole('heading', { name: '신청 방법과 서류 준비', exact: true }),
  ).toBeFocused();
  return { card, panel };
}

test('application assistance uses exact destinations and saves reversible account document self-checks', async ({
  page,
}, info) => {
  const state = await setup(page);
  let { card, panel } = await openGuide(page, info);
  await expect(panel.getByRole('link', { name: /온라인으로 신청하기/ })).toHaveAttribute(
    'href',
    originalGuide.onlineUrl,
  );
  await expect(panel.getByRole('link', { name: /공식 공고에서 신청 방법 확인/ })).toHaveAttribute(
    'href',
    dialoguePolicy.sourceUrl,
  );
  expect(originalGuide.onlineUrl).not.toBe(dialoguePolicy.sourceUrl);
  await expect(panel.getByRole('link', { name: /전화로 신청하기/ })).toHaveAttribute(
    'href',
    'tel:0212345678',
  );
  await expect(panel.getByRole('link', { name: /신청 방법 전화 문의/ })).toHaveAttribute(
    'href',
    'tel:1350',
  );
  await expect(panel).toContainText(originalGuide.visitText);
  await expect(panel).toContainText(originalGuide.documentsNote);
  await expect(
    panel.getByRole('checkbox', { name: '소득 증빙 서류 (해당자만)', exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(card.getByRole('combobox', { name: /지원 진행 상태/ })).toHaveCount(0);
  const first = panel.getByRole('checkbox', { name: '신분증', exact: true });
  await first.click();
  await expect(first).toBeChecked();
  expect(
    state.calls.filter(({ path }) => path.endsWith('/candidates/preparation')).at(-1).body,
  ).toEqual({
    policy_id: dialoguePolicy.id,
    need_id: 'housing_repair',
    revision_id: dialoguePolicy.revisionId,
    document_id: 'doc-a',
    prepared: true,
  });
  await panel.getByRole('checkbox', { name: '소득 증빙 서류 (해당자만)', exact: true }).click();
  await expect(panel).toContainText('준비한 서류 2/2');
  await expect(panel.getByRole('status')).toHaveText(
    '서류 준비를 확인했어요. 신청 완료를 뜻하지 않아요.',
  );
  expect(state.snapshot.candidates[0].state).toBe('watching');
  expect(state.calls.some(({ path }) => path.endsWith('/candidates/state'))).toBe(false);
  await page.setViewportSize({
    width: info.project.name === 'mobile' ? 320 : 1440,
    height: 2200,
  });
  await panel.evaluate((element) => {
    window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 180);
  });
  await panel.screenshot({ path: info.outputPath('application-guide-panel.png'), scale: 'css' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  card = page.locator('.monitoring-candidate');
  await card.getByRole('button', { name: '이 공고 신청하기', exact: true }).click();
  panel = card.locator('.application-guide-panel');
  await expect(panel.getByRole('checkbox', { name: '신분증', exact: true })).toBeChecked();
  await expect(panel).toContainText('준비한 서류 2/2');
  await panel.getByRole('checkbox', { name: '신분증', exact: true }).click();
  await expect(panel.getByRole('checkbox', { name: '신분증', exact: true })).not.toBeChecked();
  expect(
    state.calls.filter(({ path }) => path.endsWith('/candidates/preparation')).at(-1).body.prepared,
  ).toBe(false);
  await expect(panel).toContainText('준비한 서류 1/2');
});

test('failed document saves allow retry and changed source revisions reset previous preparation', async ({
  page,
}, info) => {
  const state = await setup(page);
  state.failPreparation = 1;
  const { panel } = await openGuide(page, info);
  const first = panel.getByRole('checkbox', { name: '신분증', exact: true });
  await first.click();
  await expect(
    page.getByText('서류 준비 상태를 저장하지 못했어요. 다시 시도해 주세요.', { exact: true }),
  ).toBeVisible();
  await expect(first).not.toBeChecked();
  await expect(first).toBeEnabled();
  await first.click();
  await expect(first).toBeChecked();
  state.conflictPreparation = 1;
  await panel.getByRole('checkbox', { name: '소득 증빙 서류 (해당자만)', exact: true }).click();
  await expect(
    page.getByText(
      '공고가 변경되어 서류 준비 항목을 다시 확인해야 해요. 공고 다시 확인을 눌러 주세요.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    panel.getByRole('checkbox', { name: '소득 증빙 서류 (해당자만)', exact: true }),
  ).not.toBeChecked();
  const next = structuredClone(state.snapshot);
  next.candidates[0].policy.revisionId = '22222222-2222-2222-2222-222222222222';
  next.candidates[0].policy.applicationGuide.documents = [
    { id: 'doc-c', label: '신분증 사본 (공고 변경 후)' },
  ];
  state.nextSnapshot = next;
  await page.getByRole('button', { name: '공고 다시 확인', exact: true }).click();
  await expect(
    panel.getByRole('checkbox', { name: '신분증 사본 (공고 변경 후)', exact: true }),
  ).not.toBeChecked();
  await expect(panel).toContainText('준비한 서류 0/1');
  await expect(panel.getByRole('checkbox', { name: '신분증', exact: true })).toHaveCount(0);
});

test('guest policy details distinguish unknown and absent documents without inventing application destinations', async ({
  page,
}, info) => {
  const policies = [
    {
      ...guidedPolicy(),
      id: 'documents-none',
      title: '서류 없이 신청하는 시험 공고',
      applicationGuide: {
        ...originalGuide,
        onlineUrl: dialoguePolicy.sourceUrl,
        documents: [],
        documentsStatus: 'none',
        documentsNote: '해당없음',
      },
    },
    {
      ...guidedPolicy(),
      id: 'documents-unknown',
      title: '서류 안내를 확인할 시험 공고',
      applicationGuide: {
        ...originalGuide,
        onlineUrl: 'https://www.example.go.kr/',
        phones: [],
        visitText: '',
        documents: [],
        documentsStatus: 'unknown',
        documentsNote: '',
      },
    },
    { ...guidedPolicy(), id: 'documents-listed', title: '조건부 서류가 안내된 시험 공고' },
  ];
  await setup(page, { user: null, policies });
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 1500 });
  await page.goto('/#explore');
  for (const policy of policies) {
    await page
      .getByRole('article')
      .filter({ hasText: policy.title })
      .getByRole('button', { name: `${policy.title} 자세히 보기`, exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '이 공고 신청하기', exact: true }).click();
    const panel = dialog.locator('.application-guide-panel');
    await expect(panel.getByRole('checkbox')).toHaveCount(0);
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    if (policy.applicationGuide.documentsStatus === 'listed') {
      await expect(panel).toContainText('소득 증빙 서류 (해당자만)');
    } else {
      await expect(panel.getByRole('link', { name: /온라인으로 신청하기/ })).toHaveCount(0);
      await expect(panel).toContainText(
        '온라인 신청 주소를 확인하지 못했어요. 공식 공고의 신청 방법을 확인해 주세요.',
      );
      await expect(
        panel.getByRole('link', { name: /공식 공고에서 신청 방법 확인/ }),
      ).toHaveAttribute('href', dialoguePolicy.sourceUrl);
      await expect(panel).toContainText(
        policy.applicationGuide.documentsStatus === 'none'
          ? '공고에 제출 서류가 없다고 안내되어 있어요.'
          : '필요한 서류가 원문에 명확히 안내되지 않았어요. 신청 전에 담당 기관에 확인해 주세요.',
      );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});
