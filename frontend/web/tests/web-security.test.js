import test from 'node:test';
import assert from 'node:assert/strict';
import { safeSourceUrl, parsePolicy } from '../src/features/policies/policyModel.js';
import { officialSourceUrl } from '../src/features/finance/financeModel.js';
import { demoPolicies } from './fixtures/policies.js';

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
