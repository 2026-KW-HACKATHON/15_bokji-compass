import test from 'node:test';
import assert from 'node:assert/strict';
import { safeSourceUrl, parsePolicy } from '../src/features/policies/policyModel.js';
import { officialSourceUrl } from '../src/features/finance/financeModel.js';
import { demoPolicies } from './fixtures/policies.js';
import { resolveConfig } from '../src/shared/configModel.js';
import { readFile } from 'node:fs/promises';

test('external links reject executable, credentialed and ambiguous URL payloads', () => {
  for (const payload of [
    'javascript:alert(document.cookie)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.example/path',
    '/relative-path',
    ' https://official.example/',
    'https://official.example/\tpath',
    'https:\\evil.example\\path',
    'https://user:password@official.example/',
    'https://official.example/' + 'a'.repeat(2048),
    {},
    null,
  ]) {
    assert.equal(safeSourceUrl(payload), null);
    assert.equal(officialSourceUrl(payload), null);
  }
  const valid = 'https://official.example/notice?id=1#details';
  assert.equal(safeSourceUrl(valid), valid);
  assert.equal(officialSourceUrl(valid), valid);
  assert.equal(safeSourceUrl('http://official.example/'), 'http://official.example/');
  assert.equal(officialSourceUrl('http://official.example/'), null);
});

test('API policy links cannot turn untrusted text into executable navigation', () => {
  const payload = '<img src=x onerror="window.__xss=1">';
  const policy = parsePolicy({
    ...demoPolicies[0],
    title: payload,
    sourceUrl: 'javascript:window.__xss=1',
    applicationUrl: 'data:text/html,<script>window.__xss=1</script>',
    budget: { usedPercent: 10, evidence: payload, sourceUrl: 'javascript:alert(1)' },
  });
  assert.equal(policy.title, payload);
  assert.equal(policy.sourceUrl, null);
  assert.equal(policy.applicationUrl, null);
  assert.equal(policy.budget, null);
});

test('API configuration rejects browser URL normalization that changes the destination', () => {
  for (const apiBaseUrl of [
    '/\\evil.example',
    '//evil.example',
    '/api\n/../../evil',
    'https:\\evil.example',
    'https:///evil.example',
    'https://user:password@evil.example',
    'https://example.org/api?query=1',
    '/api#fragment',
    'javascript:alert(1)',
    'https://[invalid]/',
    'https://example.org/' + 'a'.repeat(2048),
    {},
  ])
    assert.throws(() => resolveConfig({ apiBaseUrl }), undefined, String(apiBaseUrl));
  assert.equal(resolveConfig({ apiBaseUrl: '/gateway' }).apiBaseUrl, '/gateway');
  assert.equal(resolveConfig({ apiBaseUrl: '/' }).apiBaseUrl, '/');
  assert.equal(
    resolveConfig({ apiBaseUrl: 'https://api.example.org/v1' }).apiBaseUrl,
    'https://api.example.org/v1',
  );
});

test('configuration cannot read DOM named properties, inherited values or getters', () => {
  class NamedForm {
    apiBaseUrl = 'https://evil.example';
  }
  assert.throws(() => resolveConfig(new NamedForm()));
  assert.throws(() => resolveConfig(Object.create({ apiBaseUrl: 'https://evil.example' })));
  let invoked = false;
  const config = Object.defineProperty({}, 'apiBaseUrl', {
    get() {
      invoked = true;
      return 'https://evil.example';
    },
  });
  assert.throws(() => resolveConfig(config));
  assert.equal(invoked, false);
  assert.equal(resolveConfig(Object.create(null)).apiBaseUrl, '/api');
});

test('both production gateways reject inline style elements and preserve the postcode allowlist', async () => {
  const caddy = await readFile(new URL('../deploy/Caddyfile.tunnel', import.meta.url), 'utf8');
  const nginx = await readFile(
    new URL('../deploy/nginx-security-headers.conf', import.meta.url),
    'utf8',
  );
  const csp = /Content-Security-Policy "([^"]+)"/.exec(caddy)[1];
  assert.equal(/Content-Security-Policy "([^"]+)"/.exec(nginx)[1], csp);
  const directives = Object.fromEntries(
    csp.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }),
  );
  assert.deepEqual(directives['style-src-elem'], ["'self'"]);
  assert.deepEqual(directives['script-src-attr'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'none'"]);
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.ok(directives['script-src'].includes('https://t1.kakaocdn.net'));
  assert.ok(directives['frame-src'].includes('https://postcode.map.kakao.com'));
  assert.ok(directives['frame-src'].includes('https://postcode.map.daum.net'));
});

test('nginx locations keep security headers and unknown paths cannot become entry HTML', async () => {
  const nginx = await readFile(new URL('../deploy/nginx.conf', import.meta.url), 'utf8');
  // add_header in a location drops all inherited headers on supported older nginx versions.
  for (const block of nginx.matchAll(/location\s+[^\{]+\{([\s\S]*?)\n    \}/g)) {
    if (block[1].includes('add_header'))
      assert.ok(block[1].includes('include /etc/nginx/snippets/bokji-security-headers.conf;'));
  }
  assert.ok(!nginx.includes('$uri/ /index.html'));
  assert.match(nginx, /location \/ \{[^}]*try_files \$uri =404;/);
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /<!doctype html>/i);
  for (const [, reference] of index.matchAll(/(?:src|href)="([^"]+)"/g))
    assert.ok(reference.startsWith('/'), `Asset URL must be root-relative: ${reference}`);
});
