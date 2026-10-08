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

test('saving optional facts requires consent and shows sourced candidates, progress and inbox', async ({
  page,
}) => {
  const duplicateKeys = [];
  page.on('console', (event) => {
    if (event.type() === 'error' && event.text().includes('same key'))
      duplicateKeys.push(event.text());
  });
  const state = await setup(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/#profile');
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
  await expect(panel).toContainText('새 안내는 이 화면에서 확인할 수 있어요.');
  await expect(panel).toContainText('피해 신고와 지역별 지원 조건');
  await expect(panel.getByRole('link', { name: '공식 공고 새 창' })).toHaveAttribute(
    'href',
    policy.sourceUrl,
  );
  await panel.getByLabel(`${policy.title} 지원 진행 상태`).selectOption('preparing');
  await expect(panel.getByLabel(`${policy.title} 지원 진행 상태`)).toHaveValue('preparing');
  await panel.getByRole('button', { name: '표시된 안내 읽음' }).click();
  await expect(panel).toContainText('안 읽음 0개');
  expect(state.calls.find((call) => call.path.endsWith('/alerts/read')).body).toEqual({
    ids: ['alert-a'],
  });
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
    .getByRole('link', { name: '내 정보', exact: true })
    .first()
    .click();
  await expect(panel.getByText(policy.title, { exact: true })).toBeVisible();
  await expect(panel.getByLabel(`${policy.title} 지원 진행 상태`)).toHaveValue('preparing');
  expect(duplicateKeys).toEqual([]);
});

test('failed edits keep the draft and saved candidates; pause and deletion are explicit', async ({
  page,
}) => {
  const state = await setup(page, prepared());
  await page.goto('/#profile');
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
  await page.goto('/#profile');
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
  await page.goto('/#profile');
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
  await page.goto('/#profile');
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await expect(panel.getByLabel(`${policy.title} 지원 진행 상태`)).toHaveValue('applied');
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
  await expect(panel.getByLabel(`${policy.title} 지원 진행 상태`)).toHaveValue('applied');
  await expect(panel.getByText(policy.title, { exact: true })).toHaveCount(1);
  await expect(panel.getByRole('heading', { name: /이전 지원 기록/ })).toHaveCount(0);
  await expect(panel).toContainText('피해 발생일을 확인해 주세요.');
  expect(savedProfile.disaster_damage).toBe(true);
  expect(savedProfile.disaster_occurred_on).toBeNull();
  expect(state.snapshot.candidates).toHaveLength(2);
  await panel.getByLabel(`${policy.title} 지원 진행 상태`).selectOption('preparing');
  await expect(panel.getByLabel(`${policy.title} 지원 진행 상태`)).toHaveValue('preparing');
  expect(state.snapshot.candidates.every((item) => item.state === 'preparing')).toBe(true);
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
  await page.goto('/#profile');
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
  let first = true;
  await page.route('**/api/v1/monitoring', async (route) => {
    if (first) {
      first = false;
      await delayed;
      await route.fulfill({ json: prepared() }).catch(() => {});
    } else await route.fulfill({ json: blank() });
  });
  await page.goto('/#profile');
  await expect(
    page.getByText('계정에 저장된 지속 안내를 불러오고 있어요.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '로그아웃', exact: true }).first().click();
  await page.getByRole('link', { name: '로그인', exact: true }).first().click();
  await page.getByLabel('아이디', { exact: true }).fill('monitoring_b');
  await page.getByLabel('비밀번호', { exact: true }).fill('ExamplePassword42!');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('link', { name: '내 정보', exact: true }).first().click();
  const panel = page.getByRole('region', { name: '지속 복지 안내', exact: true });
  await expect(panel.getByRole('combobox', { name: '내 재난 피해 여부', exact: true })).toHaveValue(
    '',
  );
  release();
  await expect(panel.getByText(policy.title, { exact: true })).toHaveCount(0);
  await expect(panel.getByText('지속 안내 꺼짐', { exact: true })).toBeVisible();
});
