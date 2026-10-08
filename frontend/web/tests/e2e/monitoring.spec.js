import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';
import { emptyMonitoringProfile } from '../../src/features/monitoring/monitoringModel.js';

const blank = () => ({
  profile: null,
  enabled: false,
  updated_at: null,
  last_checked_at: null,
  needs: [],
  candidates: [],
  alerts: [],
  unread_count: 0,
});
const policy = {
  ...demoPolicies[0],
  title: '테스트용 침수 주택 복구 지원',
  sourceUrl: 'https://www.gov.kr/monitoring-fixture',
  applicationPeriod: '공식 공고에서 확인',
};
const candidate = {
  need_id: 'disaster_recovery',
  policy_id: policy.id,
  policy,
  status: 'needs_review',
  reason: '직접 입력한 수해 피해와 관련된 지원 후보예요.',
  questions: ['피해 신고와 지역별 지원 조건을 확인해 주세요.'],
  state: 'watching',
};
const member = {
  id: 'monitoring-a',
  username: 'monitoring_a',
  name: '안내회원',
  age: 40,
  region: '서울',
  gender: 'undisclosed',
  address: '서울특별시 중구 테스트로 1',
};
const prepared = () => ({
  ...blank(),
  profile: { ...emptyMonitoringProfile, disaster_damage: true, disaster_type: 'flood' },
  enabled: true,
  updated_at: '2026-10-07T03:00:00Z',
  last_checked_at: '2026-10-07T03:01:00Z',
  needs: [
    {
      id: 'disaster_recovery',
      title: '재난 피해 복구',
      reason: '수해 피해 있음으로 입력했어요.',
      keywords: ['수해'],
      questions: ['실제 피해와 담당 기관의 조건을 확인해 주세요.'],
    },
  ],
  candidates: [{ ...candidate }],
  alerts: [
    {
      id: 'alert-a',
      policy_id: policy.id,
      need_id: 'disaster_recovery',
      title: '관련 지원 후보를 찾았어요',
      body: '공식 공고와 피해 조건을 살펴보세요.',
      created_at: '2026-10-07T03:01:00Z',
      read: false,
    },
  ],
  unread_count: 1,
});

async function setup(page, initial = blank()) {
  await mockPolicyApi(page);
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: member } }));
  await page.route('**/api/v1/finance/profile', (route) =>
    route.fulfill({ json: { profile: null, calculation: null, updated_at: null } }),
  );
  const state = { snapshot: initial, calls: [], failSave: false };
  await page.route('**/api/v1/monitoring**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    state.calls.push({ path, body });
    if (path.endsWith('/profile')) {
      if (state.failSave)
        return route.fulfill({ status: 422, json: { detail: 'private validation' } });
      state.snapshot = { ...prepared(), profile: body.profile, enabled: body.enabled };
    } else if (path.endsWith('/preferences')) state.snapshot.enabled = body.enabled;
    else if (path.endsWith('/candidates/state')) state.snapshot.candidates[0].state = body.state;
    else if (path.endsWith('/alerts/read')) {
      state.snapshot.alerts.forEach((alert) => {
        if (body.ids.includes(alert.id)) alert.read = true;
      });
      state.snapshot.unread_count = state.snapshot.alerts.filter((alert) => !alert.read).length;
      return route.fulfill({ json: { updated: true } });
    } else if (path.endsWith('/delete')) state.snapshot = blank();
    return route.fulfill({ json: state.snapshot });
  });
  return state;
}

test('new notices are separate from account details and retain read state on reload', async ({
  page,
}) => {
  const state = await setup(page, prepared());
  await page.goto('/#profile');
  await expect(page.locator('.profile-page')).toBeVisible();
  await expect(page.locator('.monitoring-panel')).toHaveCount(0);
  await page.goto('/#new-notices');
  await expect(page.getByRole('heading', { level: 1, name: '신규공고 확인하기' })).toBeVisible();
  const inbox = page.getByRole('region', { name: '새 안내', exact: true });
  await expect(inbox).toContainText('안 읽음 1개');
  await expect(page.locator('.notification-badge')).toHaveText('1');
  await expect(inbox.locator('form, .monitoring-needs, .monitoring-candidates')).toHaveCount(0);
  await inbox
    .getByRole('button', { name: '관련 지원 후보를 찾았어요 읽음 표시', exact: true })
    .click();
  await expect(inbox).toContainText('안 읽음 0개');
  await expect(page.locator('.notification-badge')).toHaveCount(0);
  expect(state.calls.find((call) => call.path.endsWith('/alerts/read')).body).toEqual({
    ids: ['alert-a'],
  });
  await page.reload();
  await expect(inbox.locator('.monitoring-alerts .is-read')).toHaveCount(1);
  await expect(inbox).toContainText('안 읽음 0개');
  await page.screenshot({ path: test.info().outputPath('new-notices.png'), fullPage: true });
});

test('an empty notices page links to guidance and failed loads can retry', async ({ page }) => {
  await setup(page);
  let fail = true;
  await page.route('**/api/v1/monitoring', (route) =>
    route.fulfill(fail ? { status: 503, json: { detail: 'unavailable' } } : { json: blank() }),
  );
  await page.goto('/#new-notices');
  const inbox = page.getByRole('region', { name: '새 안내', exact: true });
  await expect(inbox.getByRole('alert')).toBeVisible();
  fail = false;
  await inbox.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(inbox).toContainText('아직 새 안내가 없어요.');
  await expect(inbox.locator('form')).toHaveCount(0);
  await page.locator('main').getByRole('link', { name: '지속 복지 안내 설정' }).first().click();
  await expect(page).toHaveURL(/#assistant-monitoring$/);
  await expect(page.getByRole('heading', { level: 1, name: '지속 복지 안내' })).toBeVisible();
});

test('guest login resumes the new notices destination', async ({ page }) => {
  await setup(page, prepared());
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({ json: { user: member } }));
  await page.goto('/#new-notices');
  await expect(page.locator('.notification-trigger')).toHaveCount(0);
  await page.locator('main').getByRole('link', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/#login\?return=new-notices$/);
  await page.getByLabel('아이디', { exact: true }).fill('monitoring_a');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/#new-notices$/);
  await expect(page.locator('.monitoring-alerts')).toBeVisible();
});

test('saving optional facts requires consent and shows sourced candidates, feedback and inbox', async ({
  page,
}) => {
  const duplicateKeys = [];
  page.on('console', (event) => {
    if (event.type() === 'error' && event.text().includes('same key'))
      duplicateKeys.push(event.text());
  });
  const state = await setup(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/#assistant-monitoring');
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await expect(panel.getByText('지속 안내 꺼짐', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '생활정보와 안내 설정 저장' })).toBeDisabled();
  await panel
    .getByRole('combobox', { name: '현재 주택의 소유·거주 형태', exact: true })
    .selectOption('renter');
  await panel
    .getByRole('combobox', { name: '주택 종류', exact: true })
    .selectOption('multi_family');
  await panel.getByLabel('주택 준공연도').fill('1990');
  await panel
    .getByRole('combobox', { name: '주택 수리가 필요한가요?', exact: true })
    .selectOption('true');
  await panel.getByRole('combobox', { name: '재난 종류', exact: true }).selectOption('flood');
  await panel
    .getByRole('combobox', { name: '내 재난 피해 여부', exact: true })
    .selectOption('true');
  await panel.getByLabel('피해 발생일', { exact: true }).fill('2026-10-01');
  await panel.getByLabel('지속 안내 켜기', { exact: true }).check();
  await panel
    .getByLabel('생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.', {
      exact: true,
    })
    .check();
  await panel.getByRole('button', { name: '생활정보와 안내 설정 저장' }).click();
  await expect(panel.getByText(policy.title, { exact: true })).toBeVisible();
  const save = state.calls.find((call) => call.path.endsWith('/profile')).body;
  expect(save).toMatchObject({
    consent: true,
    enabled: true,
    profile: {
      disaster_damage: true,
      disaster_type: 'flood',
      disaster_occurred_on: '2026-10-01',
      building_year: 1990,
      housing_tenure: 'renter',
      job_seeking: null,
    },
  });
  await expect(panel).toContainText('등록된 재난 지원 공고를 찾으면 실제 피해 여부부터 확인해요.');
  await expect(panel.locator('.monitoring-alerts')).toHaveCount(0);
  await expect(panel).toContainText('피해 신고와 지역별 지원 조건');
  await expect(panel.getByRole('link', { name: '공식 공고 새 창' })).toHaveAttribute(
    'href',
    policy.sourceUrl,
  );
  await expect(panel.getByLabel(`${policy.title} 지원 진행 상태`)).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '이 공고 추천하지 않기' })).toBeVisible();
  await page.locator('main').getByRole('link', { name: '신규공고 확인하기', exact: true }).click();
  const inbox = page.getByRole('region', { name: '새 안내', exact: true });
  await inbox.getByRole('button', { name: '표시된 안내 읽음' }).click();
  await expect(inbox).toContainText('안 읽음 0개');
  expect(state.calls.find((call) => call.path.endsWith('/alerts/read')).body).toEqual({
    ids: ['alert-a'],
  });
  await page
    .locator('main')
    .getByRole('link', { name: '지속 복지 안내 설정', exact: true })
    .first()
    .click();
  await expect(panel.getByRole('button', { name: '이 공고 추천하지 않기' })).toBeVisible();
  await panel.getByRole('button', { name: '공고 다시 확인', exact: true }).click();
  await expect(panel.getByText('등록된 공고를 다시 확인했어요.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `../../tmp/monitoring-ready-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({
    width: test.info().project.name === 'desktop' ? 1440 : 320,
    height: 1000,
  });
  await panel.screenshot({ path: `../../tmp/monitoring-panel-${test.info().project.name}.png` });
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(panel.getByText(policy.title, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `../../tmp/monitoring-easy-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.locator('.easy-menu-toggle').click();
  await page
    .getByRole('navigation', { name: '주 메뉴', exact: true })
    .getByRole('link', { name: '지속 복지 안내', exact: true })
    .first()
    .click();
  await expect(panel.getByText(policy.title, { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '이 공고 추천하지 않기' })).toBeVisible();
  expect(duplicateKeys).toEqual([]);
});

test('failed edits keep the draft and saved candidates; pause and deletion are explicit', async ({
  page,
}) => {
  const state = await setup(page, prepared());
  await page.goto('/#assistant-monitoring');
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await panel.getByRole('button', { name: '생활정보 수정', exact: true }).click();
  await panel.getByLabel('주택 준공연도').fill('1984');
  await panel
    .getByLabel('생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.', {
      exact: true,
    })
    .check();
  state.failSave = true;
  await panel.getByRole('button', { name: '생활정보와 안내 설정 저장' }).click();
  await expect(panel.getByRole('alert')).toContainText('입력한 생활정보와 날짜를 확인해 주세요.');
  await expect(panel.getByRole('alert')).not.toContainText('private');
  await expect(panel.getByLabel('주택 준공연도')).toHaveValue('1984');
  await expect(panel.getByText(policy.title, { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '수정 취소' }).click();
  await panel.getByRole('button', { name: '지속 안내 중지', exact: true }).click();
  await expect(panel.getByText('지속 안내 꺼짐', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '공고 다시 확인', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: '저장한 생활정보와 안내 삭제' }).click();
  await expect(panel).toContainText('지원 후보의 진행 상태와 새 안내를 삭제');
  expect(state.calls.some((call) => call.path.endsWith('/delete'))).toBe(false);
  await panel.getByRole('button', { name: '생활정보와 안내 기록 삭제', exact: true }).click();
  await expect(panel.getByText(policy.title, { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '생활정보와 안내 설정 저장' })).toBeDisabled();
});

test('a source outage keeps a successful save visible and never claims a scan succeeded', async ({
  page,
}) => {
  await setup(page, { ...prepared(), scan_status: 'unavailable' });
  await page.goto('/#assistant-monitoring');
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await expect(panel).toContainText('생활정보는 저장됐지만 지원 공고를 확인하지 못했어요.');
  await expect(panel.getByText(policy.title, { exact: true })).toBeVisible();
  await expect(panel).not.toContainText('등록된 공고를 다시 확인했어요.');
  await panel.getByRole('button', { name: '공고 다시 확인', exact: true }).click();
  await expect(panel).toContainText('지원 공고를 확인하지 못했어요. 기존 안내를 유지했어요.');
  await expect(panel).not.toContainText('등록된 공고를 다시 확인했어요.');
});

test('registered disaster support asks about unknown damage and removes candidates after explicit no', async ({
  page,
}) => {
  const response = {
    ...prepared(),
    profile: { ...emptyMonitoringProfile },
    needs: [
      {
        id: 'disaster_watch',
        title: '거주 지역 재난 지원 확인',
        reason: '입력한 거주 지역에 관련 지원 공고가 있어요.',
        keywords: ['재난 지원'],
        questions: ['실제 피해 여부와 발생일을 확인해 주세요.'],
      },
    ],
    candidates: [
      {
        ...candidate,
        need_id: 'disaster_watch',
        reason: '거주 지역과 관련된 지원 원문을 찾았어요.',
        questions: ['실제 피해 여부와 발생일을 확인해 주세요.'],
      },
    ],
    alerts: [],
    unread_count: 0,
  };
  const state = await setup(page, response);
  let submitted;
  await page.route('**/api/v1/monitoring/profile', (route) => {
    submitted = route.request().postDataJSON();
    state.snapshot = {
      ...response,
      profile: submitted.profile,
      enabled: submitted.enabled,
      needs: [],
      candidates: [],
    };
    return route.fulfill({ json: state.snapshot });
  });
  await page.goto('/#assistant-monitoring');
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await expect(panel.getByRole('heading', { name: '거주 지역 재난 지원 확인' })).toBeVisible();
  await expect(panel.getByText(policy.title, { exact: true })).toBeVisible();
  await expect(panel).toContainText('실제 피해 여부와 발생일을 확인해 주세요.');
  await expect(panel.getByText('추가 조건 확인 필요', { exact: true })).toBeVisible();
  await expect(panel).not.toContainText('수해 피해 있음으로 입력했어요.');
  await panel.getByRole('button', { name: '생활정보 수정', exact: true }).click();
  await expect(panel.getByRole('combobox', { name: '내 재난 피해 여부', exact: true })).toHaveValue(
    '',
  );
  await expect(panel.getByLabel('피해 발생일', { exact: true })).toHaveValue('');
  await panel
    .getByRole('combobox', { name: '내 재난 피해 여부', exact: true })
    .selectOption('false');
  await panel
    .getByLabel('생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.', {
      exact: true,
    })
    .check();
  await panel.getByRole('button', { name: '생활정보와 안내 설정 저장' }).click();
  await expect(panel.getByText(policy.title, { exact: true })).toHaveCount(0);
  expect(submitted.profile.disaster_damage).toBe(false);
  expect(submitted.profile.disaster_type).toBeNull();
  expect(submitted.profile.disaster_occurred_on).toBeNull();
});

test('watch to recovery keeps shared application progress without duplicate history and accepts unknown date', async ({
  page,
}) => {
  const watch = {
    ...candidate,
    need_id: 'disaster_watch',
    active: true,
    state: 'applied',
    reason: '거주 지역과 관련된 재난 지원 공고를 찾았어요.',
    questions: ['실제 피해 여부를 확인해 주세요.'],
  };
  const initial = {
    ...prepared(),
    profile: { ...emptyMonitoringProfile },
    needs: [
      {
        id: 'disaster_watch',
        title: '거주 지역 재난 지원 확인',
        reason: '관련 지원 공고가 있어요.',
        keywords: ['재난 지원'],
        questions: ['실제 피해 여부를 확인해 주세요.'],
      },
    ],
    candidates: [watch],
    alerts: [],
    unread_count: 0,
  };
  const state = await setup(page, initial);
  let savedProfile;
  await page.route('**/api/v1/monitoring/profile', (route) => {
    savedProfile = route.request().postDataJSON().profile;
    state.snapshot = {
      ...initial,
      profile: savedProfile,
      needs: [
        {
          id: 'disaster_recovery',
          title: '재난 피해 복구',
          reason: '피해 있음으로 입력했어요.',
          keywords: ['재난 지원'],
          questions: ['피해 발생일을 확인해 주세요.'],
        },
      ],
      candidates: [
        { ...watch, active: false },
        {
          ...watch,
          need_id: 'disaster_recovery',
          active: true,
          reason: '피해 있음으로 입력한 상황과 관련된 지원 후보예요.',
          questions: ['피해 발생일을 확인해 주세요.'],
        },
      ],
    };
    return route.fulfill({ json: state.snapshot });
  });
  await page.route('**/api/v1/monitoring/candidates/state', (route) => {
    const body = route.request().postDataJSON();
    for (const item of state.snapshot.candidates)
      if (item.policy_id === body.policy_id) item.state = body.state;
    return route.fulfill({ json: state.snapshot });
  });
  await page.goto('/#assistant-monitoring');
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await expect(panel.getByLabel(`${policy.title} 지원 진행 상태`)).toHaveCount(0);
  expect(state.snapshot.candidates[0].state).toBe('applied');
  await panel.getByRole('button', { name: '생활정보 수정', exact: true }).click();
  await panel.getByRole('combobox', { name: '재난 종류', exact: true }).selectOption('flood');
  await panel
    .getByRole('combobox', { name: '내 재난 피해 여부', exact: true })
    .selectOption('true');
  await expect(panel.getByLabel('피해 발생일', { exact: true })).toHaveValue('');
  await panel
    .getByLabel('생활정보를 내 계정에 저장하고 지속 복지 안내에 사용하는 데 동의해요.', {
      exact: true,
    })
    .check();
  await panel.getByRole('button', { name: '생활정보와 안내 설정 저장' }).click();
  await expect(panel.getByRole('heading', { name: '재난 피해 복구', exact: true })).toBeVisible();
  await expect(panel.getByLabel(`${policy.title} 지원 진행 상태`)).toHaveCount(0);
  expect(state.snapshot.candidates.every((item) => item.state === 'applied')).toBe(true);
  await expect(panel.getByText(policy.title, { exact: true })).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: /이전 지원 기록/ })).toHaveCount(0);
  await expect(panel).toContainText('피해 발생일을 확인해 주세요.');
  expect(savedProfile.disaster_damage).toBe(true);
  expect(savedProfile.disaster_occurred_on).toBeNull();
  expect(state.snapshot.candidates).toHaveLength(2);
  await expect(panel.getByRole('button', { name: '이 공고 추천하지 않기' })).toBeVisible();
});

test('previous application records and future application periods are clearly distinguished', async ({
  page,
}) => {
  const response = prepared();
  response.candidates = [
    { ...candidate, active: true, schedule_status: 'upcoming' },
    {
      ...candidate,
      policy_id: 'past-policy',
      policy: { ...policy, id: 'past-policy', title: '테스트용 이전 신청 기록' },
      active: false,
      state: 'applied',
    },
  ];
  await setup(page, response);
  await page.goto('/#assistant-monitoring');
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await expect(panel.getByRole('heading', { name: '관련 지원 후보 1개' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: '이전 지원 기록 1개' })).toBeVisible();
  await expect(panel.getByText('접수 예정', { exact: true })).toBeVisible();
  await panel.locator('summary').filter({ hasText: '이전 지원 기록 펼치기' }).click();
  await expect(panel).toContainText(
    '현재 탐색 결과에 없어요. 공식 공고에서 최신 조건과 일정을 다시 확인해 주세요.',
  );
  await expect(panel.getByLabel('테스트용 이전 신청 기록 지원 진행 상태')).toHaveValue('applied');
  await expect(panel).not.toContainText('마감된 공고예요');
});

test('a delayed prior-account response cannot expose facts after logout and another login', async ({
  page,
}) => {
  await setup(page);
  let current = member;
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: current } }));
  await page.route('**/api/v1/auth/logout', (route) => {
    current = null;
    return route.fulfill({ json: { message: '로그아웃' } });
  });
  await page.route('**/api/v1/auth/login', (route) => {
    current = {
      ...member,
      id: 'monitoring-b',
      username: 'monitoring_b',
      name: '다음회원',
      region: '부산',
      address: null,
    };
    return route.fulfill({ json: { user: current } });
  });
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/monitoring', async (route) => {
    // StrictMode can abort and repeat the first read when the lazy page mounts.
    // Delay every request from account A so this always exercises a stale response.
    if (current?.id === member.id) {
      await delayed;
      await route.fulfill({ json: prepared() }).catch(() => {});
    } else await route.fulfill({ json: blank() });
  });
  await page.goto('/#assistant-monitoring');
  await expect(
    page.getByText('계정에 저장된 지속 안내를 불러오고 있어요.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '로그아웃', exact: true }).first().click();
  await page.getByRole('link', { name: '로그인', exact: true }).first().click();
  await page.getByLabel('아이디', { exact: true }).fill('monitoring_b');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.goto('/#assistant-monitoring');
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await expect(panel.getByRole('combobox', { name: '내 재난 피해 여부', exact: true })).toHaveValue(
    '',
  );
  release();
  await expect(panel.getByText(policy.title, { exact: true })).toHaveCount(0);
  await expect(panel.getByText('지속 안내 꺼짐', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '알림, 안 읽은 알림 0개', exact: true }).click();
  await expect(page.locator('.notification-popover')).toContainText('아직 새 알림이 없어요.');
  await expect(page.locator('.notification-badge')).toHaveCount(0);
});

test('member bell opens its notice, marks it read and links to the full inbox', async ({
  page,
}, testInfo) => {
  const state = await setup(page, prepared());
  await page.goto('/#home');
  const bell = page.getByRole('button', { name: '알림, 안 읽은 알림 1개', exact: true });
  await expect(bell).toBeVisible();
  await expect(
    page.locator('.account-actions .auth-username + .notification-center'),
  ).toBeVisible();
  await bell.click();
  const popup = page.locator('.notification-popover');
  await expect(popup).toContainText('관련 지원 후보를 찾았어요');
  await page.screenshot({
    path: testInfo.outputPath('notification-inbox.png'),
    animations: 'disabled',
    scale: 'css',
  });
  await popup.getByRole('button', { name: /관련 지원 후보를 찾았어요/ }).click();
  const detail = page.getByRole('dialog');
  await expect(detail).toContainText(demoPolicies[0].title);
  await expect(popup).toHaveCount(0);
  await expect(page.locator('.notification-badge')).toHaveCount(0);
  expect(
    state.calls.filter((call) => call.path.endsWith('/alerts/read')).map((call) => call.body),
  ).toEqual([{ ids: ['alert-a'] }]);
  await detail.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.locator('.notification-trigger')).toBeFocused();
  await page.locator('.notification-trigger').click();
  await expect(popup.locator('.notification-item.is-read')).toHaveCount(1);
  await popup.getByRole('link', { name: '알림 전체 보기' }).click();
  await expect(page).toHaveURL(/#new-notices$/);
  await expect(popup).toHaveCount(0);
  await page
    .getByRole('button', { name: '관련 지원 후보를 찾았어요 관련 공고 보기', exact: true })
    .click();
  await expect(detail).toContainText(demoPolicies[0].title);
  expect(state.calls.filter((call) => call.path.endsWith('/alerts/read'))).toHaveLength(1);
});

test('full inbox selection, bulk read and newly arrived alerts update the bell', async ({
  page,
}) => {
  const initial = prepared();
  initial.alerts = [1, 2, 3].map((index) => ({
    ...initial.alerts[0],
    id: `alert-${index}`,
    title: `새 지원 ${index}`,
  }));
  initial.unread_count = 3;
  const state = await setup(page, initial);
  await page.goto('/#new-notices');
  await expect(page.locator('.notification-badge')).toHaveText('3');
  await page.getByRole('button', { name: '새 지원 3 관련 공고 보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.notification-badge')).toHaveText('2');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.locator('.monitoring-alerts .is-read')).toHaveCount(1);
  await page.getByRole('button', { name: '표시된 안내 읽음' }).click();
  await expect(page.locator('.notification-badge')).toHaveCount(0);
  state.snapshot.alerts.unshift({
    ...prepared().alerts[0],
    id: 'arrived',
    title: '방금 도착한 공고',
  });
  state.snapshot.unread_count = 1;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.notification-badge')).toHaveText('1');
  await page.locator('.notification-trigger').click();
  await expect(page.locator('.notification-popover')).toContainText('방금 도착한 공고');
});

test('notification load, notice load and read failures remain retryable', async ({ page }) => {
  await setup(page, prepared());
  let inboxFails = true;
  await page.route('**/api/v1/monitoring', (route) =>
    route.fulfill(inboxFails ? { status: 503, json: {} } : { json: prepared() }),
  );
  let policyFails = true;
  await page.route(`**/api/v1/policies/${policy.id}`, (route) =>
    route.fulfill(policyFails ? { status: 503, json: {} } : { json: policy }),
  );
  await page.goto('/#home');
  await page.locator('.notification-trigger').click();
  const popup = page.locator('.notification-popover');
  await expect(popup.getByRole('alert')).toContainText('알림을 불러오지 못했어요.');
  await expect(page.locator('.notification-badge')).toHaveCount(0);
  inboxFails = false;
  await popup.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.locator('.notification-badge')).toHaveText('1');
  await popup.getByRole('button', { name: /관련 지원 후보를 찾았어요/ }).click();
  await expect(
    page.getByText('관련 공고를 불러오지 못했어요. 알림을 다시 눌러 주세요.', { exact: true }),
  ).toBeVisible();
  await expect(popup).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  policyFails = false;
  await page.route('**/api/v1/monitoring/alerts/read', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await popup.getByRole('button', { name: /관련 지원 후보를 찾았어요/ }).click();
  await expect(page.getByRole('dialog')).toContainText(policy.title);
  await expect(page.locator('.notification-badge')).toHaveText('1');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(
    page.getByText('알림을 읽음으로 저장하지 못했어요. 다시 시도해 주세요.', { exact: true }),
  ).toBeVisible();
});

test('a removed notice leads to welfare guidance without a stale detail', async ({ page }) => {
  await setup(page, prepared());
  await page.route(`**/api/v1/policies/${policy.id}`, (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await page.goto('/#new-notices');
  await page
    .getByRole('button', { name: '관련 지원 후보를 찾았어요 관련 공고 보기', exact: true })
    .click();
  await expect(page).toHaveURL(/#assistant-monitoring$/);
  await expect(page.getByRole('heading', { level: 1, name: '지속 복지 안내' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notification-badge')).toHaveCount(0);
  await expect(
    page.getByText('공고가 더 이상 제공되지 않아 관련 복지 안내로 이동했어요.', { exact: true }),
  ).toBeVisible();
});

test('notification panel supports keyboard, large badges and narrow translated layouts', async ({
  page,
}, testInfo) => {
  const initial = prepared();
  initial.alerts = Array.from({ length: 8 }, (_, index) => ({
    ...initial.alerts[0],
    id: `alert-${index}`,
    title: `새 공고 ${index + 1}`,
  }));
  initial.unread_count = 125;
  await setup(page, initial);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({
    width: testInfo.project.name === 'desktop' ? 1440 : 320,
    height: 900,
  });
  await page.goto('/#home');
  const bell = page.getByRole('button', { name: '알림, 안 읽은 알림 125개', exact: true });
  await expect(page.locator('.notification-badge')).toHaveText('99+');
  await bell.focus();
  await page.keyboard.press('Enter');
  const popup = page.locator('.notification-popover');
  await expect(popup.locator('.notification-item')).toHaveCount(6);
  await page.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: '알림 닫기' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(popup.locator('.notification-item').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(bell).toBeFocused();
  await bell.click();
  await page.locator('main').click({ position: { x: 8, y: 10 } });
  await expect(popup).toHaveCount(0);
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    for (const locale of ['ko', 'en', 'zh', 'vi', 'ja']) {
      await page.locator('.language-selector select').selectOption(locale);
      await page.locator('.notification-trigger').click();
      await expect(popup).toBeVisible();
      const geometry = await popup.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          x: bounds.x,
          right: bounds.right,
          bottom: bounds.bottom,
          height: innerHeight,
          animation: getComputedStyle(node).animationName,
          overflow: document.documentElement.scrollWidth > innerWidth,
          width: innerWidth,
        };
      });
      expect(geometry.x).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.width);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
      expect(geometry.overflow).toBe(false);
      expect(geometry.animation).toBe('none');
      await popup.locator('.notification-all').scrollIntoViewIfNeeded();
      await expect(popup.locator('.notification-all')).toBeInViewport();
      if (locale === 'ko')
        await page.screenshot({
          path: testInfo.outputPath(`notification-layout-${easy}.png`),
          animations: 'disabled',
          scale: 'css',
        });
      await popup.locator('.notification-close').click();
    }
    await page.locator('.language-selector select').selectOption('ko');
  }
});

test('leaving the page cancels a pending notification detail', async ({ page }) => {
  const state = await setup(page, prepared());
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  let requested;
  const started = new Promise((resolve) => {
    requested = resolve;
  });
  await page.route(`**/api/v1/policies/${policy.id}`, async (route) => {
    requested();
    await delayed;
    await route.fulfill({ json: policy }).catch(() => {});
  });
  await page.goto('/#new-notices');
  await page
    .getByRole('button', { name: '관련 지원 후보를 찾았어요 관련 공고 보기', exact: true })
    .click();
  await started;
  await page.evaluate(() => {
    window.location.hash = 'profile';
  });
  await expect(page.locator('.profile-page')).toBeVisible();
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notification-badge')).toHaveText('1');
  expect(state.calls.filter((call) => call.path.endsWith('/alerts/read'))).toHaveLength(0);
});
