import { test, expect } from '@playwright/test';
import { filterPolicies } from '../../src/features/policies/policyRepository.js';

const base = {
  summary: '격리된 브라우저 테스트 공고',
  tags: [],
  date: '2026-10-01',
  benefit: '테스트 지원',
  organization: '테스트 기관',
  audience: '청년',
  region: '서울',
  category: '주거',
  sourceUrl: 'https://example.com/test-only',
  scheduleStatus: 'dated',
};
const records = [
  {
    ...base,
    id: 'fixture-calendar-housing',
    title: '테스트 청년 주거지원',
    applicationStart: '2026-10-01',
    applicationEnd: '2026-10-15',
    applicationPeriod: '2026-10-01 ~ 2026-10-15',
  },
  {
    ...base,
    id: 'fixture-calendar-deadline',
    title: '테스트 취업 신청마감',
    category: '일자리',
    region: '부산',
    applicationStart: null,
    applicationEnd: '2026-10-05',
    applicationPeriod: '2026-10-05까지',
  },
  {
    ...base,
    id: 'fixture-calendar-crossing',
    title: '테스트 돌봄 접수기간',
    category: '건강·돌봄',
    audience: '전체',
    region: '전국',
    applicationStart: '2026-09-01',
    applicationEnd: '2026-11-30',
    applicationPeriod: '2026-09-01 ~ 2026-11-30',
  },
  {
    ...base,
    id: 'fixture-calendar-undated',
    title: '테스트 상시 지원',
    applicationStart: null,
    applicationEnd: null,
    applicationPeriod: '상시 신청',
    scheduleStatus: 'ongoing',
  },
];
function response(month, filters = {}) {
  const all = filterPolicies(records, filters);
  const first = month + '-01';
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1))
    .toISOString()
    .slice(0, 10);
  const items = all.filter((item) =>
    item.applicationStart && item.applicationEnd
      ? item.applicationStart < next && item.applicationEnd >= first
      : (item.applicationStart || item.applicationEnd || '').startsWith(month),
  );
  const undatedItems = all.filter((item) => !item.applicationStart && !item.applicationEnd);
  return {
    month,
    items,
    total: items.length,
    truncated: false,
    undatedItems,
    undatedTotal: undatedItems.length,
  };
}
async function mockCalendar(page) {
  await page.route('**/api/v1/policies/calendar?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const filters = Object.fromEntries(params);
    filters.query = params.get('q') || '';
    return route.fulfill({ json: response(params.get('month'), filters) });
  });
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-02T03:00:00Z') });
  await mockCalendar(page);
});

test('calendar dates, daily policies, details, saving and undated policies', async ({
  page,
}, testInfo) => {
  await page.goto('/#calendar');
  await expect(page.getByRole('heading', { name: '공고 캘린더', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: '2026-10 공고 일정' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 3개');
  const today = page.getByRole('button', { name: /10월 2일 오늘,/ });
  await expect(today).toHaveAttribute('aria-current', 'date');
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: '상시 접수·일정 확인이 필요한 공고' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '테스트 상시 지원', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /10월 15일, 신청 시작 0건, 마감 1건/ }).click();
  const panel = page.getByRole('region', { name: '10월 15일 공고' });
  await expect(panel.getByText('신청 마감', { exact: true })).toBeVisible();
  await expect(panel.getByText('신청 시작 2026-10-01 · 마감 2026-10-15')).toBeVisible();
  await panel.getByRole('button', { name: '테스트 청년 주거지원 저장하기' }).click();
  await expect(
    panel.getByRole('button', { name: '테스트 청년 주거지원 저장 해제' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('button', { name: '테스트 청년 주거지원', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2026-10-01 ~ 2026-10-15');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('calendar.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('month navigation, all filters, mode switch and mobile layout preserve selections', async ({
  page,
}, testInfo) => {
  await page.goto('/#calendar');
  await page.getByLabel('분야', { exact: true }).selectOption('주거');
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 1개');
  await page.getByLabel('지역', { exact: true }).selectOption('부산');
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 0개');
  await page.getByRole('button', { name: '검색 조건 지우기' }).click();
  await page.getByLabel('캘린더 공고 검색').fill('청년');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 1개');
  await page.getByLabel('대상', { exact: true }).selectOption('청년');
  await page.getByLabel('일정 구분').selectOption('end');
  await expect(page.getByRole('status')).toContainText('신청 시작 0건 · 마감 1건');
  await page.getByRole('button', { name: /10월 15일,/ }).click();
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(page.getByRole('heading', { name: '10월 15일 공고' })).toBeVisible();
  await page.getByText('캘린더 검색 조건', { exact: true }).click();
  await expect(page.getByLabel('일정 구분')).toHaveValue('end');
  await expect(page.getByLabel('캘린더 공고 검색')).toHaveValue('청년');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('calendar-easy-320.png'), fullPage: true });
  await page.getByRole('button', { name: '검색 조건 지우기' }).click();
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2026년 11월' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 1개');
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 0개');
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2026년 10월' })).toBeVisible();
  await expect(page.getByRole('button', { name: /10월 2일 오늘,/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('calendar error retry and stale month responses do not replace the new month', async ({
  page,
}) => {
  await page.route('**/api/v1/policies/calendar?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'test-only failure' } }),
  );
  await page.goto('/#calendar');
  await expect(page.getByRole('alert')).toContainText('일정을 불러오지 못했어요');
  await page.unroute('**/api/v1/policies/calendar?**');
  await mockCalendar(page);
  await page.getByRole('button', { name: '다시 시도하기' }).click();
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 3개');
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/policies/calendar?**', async (route) => {
    const month = new URL(route.request().url()).searchParams.get('month');
    if (month === '2026-11') await ready;
    return route.fulfill({ json: response(month) }).catch(() => {});
  });
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('불러오는 중');
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 0개');
  release();
  await expect(page.getByRole('heading', { name: '2026년 12월' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('이달 관련 공고 0개');
});

test('home banner automatically advances to calendar and supports pause, manual controls and navigation', async ({
  page,
}, testInfo) => {
  await page.goto('/#home');
  const banner = page.getByRole('region', { name: '홈 안내 배너' });
  await expect(banner.getByRole('button', { name: '내 정보 입력하기' })).toBeVisible();
  await banner.getByRole('button', { name: '배너 자동 전환 멈추기' }).click();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(16000);
  await expect(banner.getByRole('button', { name: '내 정보 입력하기' })).toBeVisible();
  await banner.getByRole('button', { name: '배너 자동 전환 시작하기' }).click();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(8100);
  await expect(banner.getByRole('button', { name: '공고 캘린더 보기' })).toBeVisible();
  await banner.getByRole('button', { name: '배너 자동 전환 멈추기' }).click();
  await page.screenshot({ path: testInfo.outputPath('home-calendar-banner.png'), fullPage: true });
  await banner.getByRole('button', { name: '공고 캘린더 보기' }).click();
  await expect(page).toHaveURL(/#calendar$/);
  await expect(page.getByRole('heading', { name: '공고 캘린더', exact: true })).toBeVisible();
  await page.goBack();
  await banner.getByRole('button', { name: '다음 배너' }).click();
  await expect(banner.getByRole('button', { name: '공고 캘린더 보기' })).toBeVisible();
  await banner.getByRole('button', { name: '이전 배너' }).click();
  await expect(banner.getByRole('button', { name: '내 정보 입력하기' })).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(banner.getByRole('button', { name: '내 정보 입력하기' })).toBeVisible();
});

test('reduced motion disables autoplay and easy home removes rotating banners at 320 pixels', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#home');
  const banner = page.getByRole('region', { name: '홈 안내 배너' });
  await expect(banner.getByRole('button', { name: '배너 자동 전환 시작하기' })).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(banner.getByRole('button', { name: '내 정보 입력하기' })).toBeVisible();
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole('button', { name: '맞춤 공고 찾기', exact: true })).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('home-easy-320.png'), fullPage: true });
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: '공고 캘린더 안내 배너 보기' }).click();
  await expect(banner.getByRole('button', { name: '공고 캘린더 보기' })).toBeVisible();
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole('button', { name: '맞춤 공고 찾기', exact: true }).click();
  await expect(page).toHaveURL(/#profile$/);
});
