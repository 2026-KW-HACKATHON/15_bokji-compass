import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { mockPolicyApi } from '../fixtures/api.js';

// Use the actual backend projection of a synthetic provider response, so this
// test fails if the API starts returning raw objects again.
const backend = path.resolve('../../backend');
const python = path.join(
  backend,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
);
const policy = JSON.parse(
  execFileSync(
    python,
    [
      '-c',
      'import json; from tests.test_source_field_presentation import structured_record; ' +
        'from app.modules.storage.catalog import card; ' +
        'print(json.dumps(card(structured_record(), full=True), ensure_ascii=False))',
    ],
    { cwd: backend, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
  ),
);

test('structured notice details remain readable in normal and easy modes', async ({
  page,
}, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 740 });
  await mockPolicyApi(page);
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [policy], total: 1, nextCursor: null } }),
  );
  await page.route(/\/api\/v1\/policies\/bokjiro%3Adisplay-fixture$/, (route) =>
    route.fulfill({ json: policy }),
  );
  await page.goto('/#explore');
  for (const easy of [false, true]) {
    if (easy) await page.getByRole('switch', { name: /쉬운 화면/ }).click();
    await page
      .getByRole('article')
      .getByRole('button', { name: policy.title + ' 자세히 보기', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    const information = dialog.getByText('공고의 전체 항목 확인', { exact: true });
    await information.focus();
    await page.keyboard.press('Enter');
    const fields = dialog
      .locator('details')
      .filter({ has: page.getByText('공고의 전체 항목 확인', { exact: true }) })
      .locator('.policy-detail');
    const value = (label) =>
      fields
        .locator('div')
        .filter({ has: page.locator('dt', { hasText: label }) })
        .locator('dd');
    await expect(value('근거 법령')).toHaveText(
      '사회서비스 이용 및 이용권 관리에 관한 법률\n사회복지사업법',
    );
    await expect(value('문의처')).toHaveText(
      '사회서비스전자바우처: 1566-3232\n보건복지상담센터: 129',
    );
    await expect(value('신청 방법')).toContainText('신청: 주소지 읍·면·동 주민센터에서 신청');
    await expect(value('신청 방법')).toContainText('조사 및 심사: 시·군·구청에서 조사 및 심사');
    await expect(value('신청 방법')).toContainText(
      '이의 신청: 이의가 있는 경우 담당 시·군·구청에 신청',
    );
    await expect(
      dialog.locator('dd').filter({ hasText: '사회서비스전자바우처: 1566-3232' }).first(),
    ).toHaveCSS('white-space', 'pre-line');
    await expect(value('첨부 파일')).toHaveText(
      '서비스 신청서.hwpx: https://example.gov/form?file=1&format=hwpx',
    );
    await expect(value('관련 링크')).toHaveText('온라인 신청 안내: https://example.gov/apply');
    await expect(dialog).not.toContainText(
      /servSeCode|servSeDetailNm|servSeDetailLink|"label"|"url"/,
    );
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await value('문의처').scrollIntoViewIfNeeded();
    await dialog.screenshot({
      path: info.outputPath(`source-fields-${easy ? 'easy' : 'normal'}.png`),
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});
