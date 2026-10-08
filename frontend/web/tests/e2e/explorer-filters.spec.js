import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';

test('eligible policy searches include the signed-in session and public searches omit it', async ({
  page,
  context,
  baseURL,
}) => {
  await mockPolicyApi(page);
  await context.addCookies([{ name: 'test_session', value: 'member-session', url: baseURL }]);
  await page.route('**/v1/auth/me', (route) =>
    route.fulfill({ json: { user: { id: 'filter-member', username: 'member', name: '회원' } } }),
  );
  const requests = [];
  await page.route('**/api/v1/policies?**', async (route) => {
    const memberOnly = new URL(route.request().url()).searchParams.get('eligible_only') === 'true';
    const headers = await route.request().allHeaders();
    requests.push({ memberOnly, cookie: headers.cookie || '' });
    if (memberOnly && !headers.cookie?.includes('test_session=member-session')) {
      await route.fulfill({ status: 401, json: { detail: '로그인이 필요해요.' } });
      return;
    }
    const items = memberOnly ? demoPolicies.slice(0, 1) : demoPolicies.slice(0, 6);
    await route.fulfill({ json: { items, total: items.length, nextCursor: null } });
  });
  await page.goto('/#explore');
  await expect(page.getByRole('article')).toHaveCount(6);
  await page.locator('.explorer-advanced > summary').click();
  const eligible = page.getByRole('checkbox', { name: '현재 신청 가능한 공고만' });
  await expect(eligible).toBeEnabled();
  await eligible.check();
  await expect(page.getByRole('article')).toHaveCount(1);
  await eligible.uncheck();
  await expect(page.getByRole('article')).toHaveCount(6);
  expect(
    requests.some((request) => request.memberOnly && request.cookie.includes('test_session=')),
  ).toBe(true);
  expect(
    requests.filter((request) => !request.memberOnly).every((request) => !request.cookie),
  ).toBe(true);
});

test('sketch layout keeps search above two quick filters and advanced filters preserve committed input', async ({
  page,
}) => {
  await mockPolicyApi(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#explore');
  const input = page.getByRole('textbox', { name: '공고 검색', exact: true });
  const status = page.getByRole('combobox', { name: '공고 상태', exact: true });
  const source = page.getByRole('combobox', { name: '공고 제공 기관', exact: true });
  await expect(source).toBeEnabled();
  await expect(status).toHaveValue('');
  await expect(page.locator('.explorer-advanced')).not.toHaveAttribute('open');
  await page
    .locator('.explorer-search-settings')
    .screenshot({ path: test.info().outputPath('search-settings.png') });
  await page.screenshot({ path: test.info().outputPath('explorer-collapsed.png'), fullPage: true });
  await input.fill('장학');
  await input.press('Enter');
  await input.fill('아직 제출하지 않은 검색어');
  const statusRequest = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get('status') === 'open',
  );
  await status.selectOption('open');
  expect(new URL((await statusRequest).url()).searchParams.get('q')).toBe('장학');
  const sourceRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/v1/policies' && url.searchParams.get('organization') === '광운대학교'
    );
  });
  await source.selectOption(JSON.stringify(['notice', '광운대학교']));
  const sourceParams = new URL((await sourceRequest).url()).searchParams;
  expect(sourceParams.get('q')).toBe('장학');
  expect(sourceParams.get('provider')).toBe('notice');
  expect(sourceParams.has('cursor')).toBe(false);
  await page.locator('.explorer-advanced > summary').click();
  await expect(page.getByRole('checkbox', { name: '현재 신청 가능한 공고만' })).toBeDisabled();
  await page.getByRole('checkbox', { name: '0~18세', exact: true }).check();
  const ageRequest = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.getAll('age_bands').length === 2,
  );
  await page.getByRole('checkbox', { name: '19~24세', exact: true }).check();
  expect(new URL((await ageRequest).url()).searchParams.getAll('age_bands')).toEqual([
    '0-18',
    '19-24',
  ]);
  await page.getByRole('spinbutton', { name: '최소 나이' }).fill('0');
  await page.getByRole('spinbutton', { name: '최대 나이' }).fill('30');
  const rangeRequest = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get('age_max') === '30',
  );
  await page.getByRole('button', { name: '나이 적용' }).click();
  const rangeParams = new URL((await rangeRequest).url()).searchParams;
  expect(rangeParams.get('age_min')).toBe('0');
  expect(rangeParams.has('age_bands')).toBe(false);
  await expect(page.getByRole('checkbox', { name: '0~18세', exact: true })).not.toBeChecked();
  await expect(input).toHaveValue('아직 제출하지 않은 검색어');
  await page.screenshot({ path: test.info().outputPath('explorer-expanded.png'), fullPage: true });
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(source).toHaveValue(JSON.stringify(['notice', '광운대학교']));
  await expect(page.getByRole('spinbutton', { name: '최대 나이' })).toHaveValue('30');
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('explorer-easy-320.png'), fullPage: true });
  await page.getByRole('button', { name: '검색 조건 지우기', exact: true }).first().click();
  await expect(input).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(source).toHaveValue(JSON.stringify(['', '']));
  await expect(page.getByRole('spinbutton', { name: '최대 나이' })).toHaveValue('');
  await page.getByRole('combobox', { name: '언어 선택' }).selectOption('en');
  await expect(page.getByRole('combobox', { name: 'Notice status', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Notice provider', exact: true })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: 'Ages 19–24', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
