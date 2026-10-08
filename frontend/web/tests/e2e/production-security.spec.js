import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockPolicyApi } from '../fixtures/api.js';
import { demoPolicies } from '../fixtures/policies.js';
import { mockPostcode, selectPostcode } from '../fixtures/postcode.js';

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
let server;
let origin;

test.beforeAll(async () => {
  // Exercise the built app with the actual configured production CSP, not Vite's dev policy.
  const config = await readFile(path.join(webRoot, 'deploy/Caddyfile.tunnel'), 'utf8');
  const csp = /Content-Security-Policy "([^"]+)"/.exec(config)[1];
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  const dist = path.join(webRoot, 'dist');
  server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const filename = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(dist, filename);
    try {
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('outside dist');
      const bytes = await readFile(filename);
      res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
      res.end(bytes);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('built React screens render template, DOM and CSS payloads as literal text', async ({
  page,
}) => {
  await mockPolicyApi(page);
  const payload =
    '{{constructor.constructor("window.__injected=1")()}}<style>body{display:none}</style><form id="__BOKJI_CONFIG__"><input name="apiBaseUrl" value="https://evil.example"></form>';
  const policy = { ...demoPolicies[0], title: payload, summary: payload, content: payload };
  await page.route('**/api/v1/policies?**', (route) =>
    route.fulfill({ json: { items: [policy], total: 1, nextCursor: null } }),
  );
  await page.route('**/api/v1/policies/' + policy.id, (route) => route.fulfill({ json: policy }));
  await page.goto(origin + '/#explore');
  const card = page.getByRole('article');
  await expect(card).toContainText(payload);
  await card.getByRole('button', { name: policy.title + ' 자세히 보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(payload);
  await expect(page.locator('style, form#__BOKJI_CONFIG__')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
});

test('production CSP blocks injected styles, scripts, base URLs and external CSS', async ({
  page,
}) => {
  await mockPolicyApi(page);
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations.push(event.effectiveDirective);
    });
  });
  await page.goto(origin + '/#explore');
  await expect(page.getByRole('article').first()).toBeVisible();
  const original = await page
    .locator('body')
    .evaluate((body) => getComputedStyle(body).backgroundColor);
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = 'body { background-color: rgb(1, 2, 3) !important; }';
    const script = document.createElement('script');
    script.textContent = 'window.__injected = 1';
    const base = document.createElement('base');
    base.href = 'https://evil.example/';
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://evil.example/leak.css';
    document.head.append(style, script, base, css);
  });
  await expect
    .poll(() => page.evaluate(() => window.__violations))
    .toEqual(expect.arrayContaining(['style-src-elem', 'script-src-elem', 'base-uri']));
  expect(
    await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor),
  ).toBe(original);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  expect(await page.evaluate(() => document.baseURI)).toBe(page.url());
});

test('built address search and React styles still work under the production CSP', async ({
  page,
}) => {
  await mockPolicyApi(page);
  const postcode = await mockPostcode(page, { preload: false });
  const user = {
    id: 'security-member',
    username: 'security_member',
    name: '보안회원',
    age: 35,
    gender: 'undisclosed',
    region: '서울',
  };
  await page.route('**/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/v1/finance/profile', (route) =>
    route.fulfill({ json: { profile: null, calculation: null } }),
  );
  await page.goto(origin + '/#profile');
  await expect(page.getByText('보안회원님', { exact: true })).toHaveText('보안회원님');
  await page.getByRole('tab', { name: '기본 정보', exact: true }).click();
  await page.getByRole('button', { name: /^기본 정보 (추가|수정)$/ }).click();
  const form = page.getByRole('form', { name: '회원 정보 수정' });
  await selectPostcode(form, '부산');
  expect(postcode.loads).toBe(1);
  await expect(form.getByLabel('우편번호', { exact: true })).toHaveValue('47545');
  await page.getByRole('switch', { name: /쉬운 화면/ }).click();
  await expect(form).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
