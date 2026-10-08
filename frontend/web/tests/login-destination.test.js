import test from 'node:test';
import assert from 'node:assert/strict';
import { loginDestination } from '../src/features/auth/loginDestination.js';

test('login resumes supported input pages and ignores external or privileged destinations', () => {
  for (const page of [
    'calculator-details',
    'calculator',
    'profile',
    'assistant',
    'assistant-chat',
    'assistant-monitoring',
    'new-notices',
  ]) {
    assert.equal(loginDestination(page), page);
  }
  for (const value of [
    null,
    undefined,
    '',
    'admin',
    'profile?setup=1',
    'https://example.com',
    '//example.com',
    '#calculator',
  ]) {
    assert.equal(loginDestination(value), 'home');
  }
});
