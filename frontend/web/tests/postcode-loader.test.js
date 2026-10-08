import test from 'node:test';
import assert from 'node:assert/strict';
import { accountMessages } from '../../packages/core/src/i18n/accountMessages.js';

let fixtureId = 0;

async function mockBrowser(t, onLine = true) {
  const loader = await import(`../src/features/auth/postcode.js?loader-test=${++fixtureId}`);
  const scripts = [];
  const timers = new Map();
  const browser = { navigator: { onLine } };
  const document = {
    createElement(tag) {
      assert.equal(tag, 'script');
      return {
        removed: false,
        remove() {
          this.removed = true;
        },
      };
    },
    head: {
      appendChild(script) {
        scripts.push(script);
      },
    },
  };
  for (const [name, value] of Object.entries({ window: browser, document })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const timer = { callback, delay };
    timers.set(timer, timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', (timer) => timers.delete(timer));
  return { ...loader, scripts, timers, browser };
}

function rejectsWith(promise, code, message) {
  return assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    assert.match(error.message, message);
    for (const locale of ['en', 'zh', 'vi', 'ja']) {
      assert.ok(accountMessages[error.message]?.[locale], `Missing ${locale} translation`);
    }
    return true;
  });
}

function assertCleaned(script, timers) {
  assert.equal(script.removed, true);
  assert.equal(script.onload, null);
  assert.equal(script.onerror, null);
  assert.equal(timers.size, 0);
}

test('offline browser skips the request and can retry after reconnecting', async (t) => {
  const { loadPostcode, scripts, browser } = await mockBrowser(t, false);
  await rejectsWith(loadPostcode(), 'POSTCODE_OFFLINE', /오프라인/);
  assert.equal(scripts.length, 0);

  browser.navigator.onLine = true;
  const retry = loadPostcode();
  const Postcode = function () {};
  browser.daum = { Postcode };
  scripts[0].onload();
  assert.equal(await retry, Postcode);
});

test('online script errors do not claim an internet outage and allow a fresh request', async (t) => {
  const { loadPostcode, scripts, timers, browser } = await mockBrowser(t);
  const first = loadPostcode();
  const failedScript = scripts[0];
  const lateError = failedScript.onerror;
  const rejected = rejectsWith(first, 'POSTCODE_SCRIPT', /차단되었거나 일시적으로/);
  failedScript.onerror();
  await rejected;
  assertCleaned(failedScript, timers);

  const retry = loadPostcode();
  assert.notEqual(retry, first);
  assert.equal(scripts.length, 2);
  lateError();
  assert.equal(loadPostcode(), retry, 'Late events must not reset an active retry');
  const Postcode = function () {};
  browser.kakao = { Postcode };
  scripts[1].onload();
  assert.equal(await retry, Postcode);
});

test('a 15-second timeout has its own message and cleans up the failed request', async (t) => {
  const { loadPostcode, scripts, timers } = await mockBrowser(t);
  const pending = loadPostcode();
  const rejected = rejectsWith(pending, 'POSTCODE_TIMEOUT', /응답이 늦어지고/);
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 15000);
  timer.callback();
  await rejected;
  assertCleaned(scripts[0], timers);
});

test('a loaded script without its SDK reports initialization failure', async (t) => {
  const { loadPostcode, scripts, timers } = await mockBrowser(t);
  const pending = loadPostcode();
  const rejected = rejectsWith(pending, 'POSTCODE_UNAVAILABLE', /기능을 시작하지 못했어요/);
  scripts[0].onload();
  await rejected;
  assertCleaned(scripts[0], timers);
});

test('a browser that goes offline during loading receives the offline message', async (t) => {
  const { loadPostcode, scripts, browser } = await mockBrowser(t);
  const pending = loadPostcode();
  const rejected = rejectsWith(pending, 'POSTCODE_OFFLINE', /오프라인/);
  browser.navigator.onLine = false;
  scripts[0].onerror();
  await rejected;
});

test('concurrent callers share one official script request and a successful constructor', async (t) => {
  const { loadPostcode, POSTCODE_SCRIPT_URL, scripts, timers, browser } = await mockBrowser(t);
  const first = loadPostcode();
  const second = loadPostcode();
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, POSTCODE_SCRIPT_URL);
  assert.equal(
    scripts[0].src,
    'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js',
  );
  assert.equal(scripts[0].async, true);
  const Postcode = function () {};
  browser.kakao = { Postcode };
  scripts[0].onload();
  assert.deepEqual(await Promise.all([first, second]), [Postcode, Postcode]);
  assert.equal(timers.size, 0);
  assert.equal(scripts[0].removed, false);
  assert.equal(scripts[0].onload, null);
  assert.equal(scripts[0].onerror, null);
  assert.equal(await loadPostcode(), Postcode);
  assert.equal(scripts.length, 1);
});

test('an existing SDK needs no request even when the browser is offline', async (t) => {
  const { loadPostcode, scripts, browser } = await mockBrowser(t, false);
  const Postcode = function () {};
  browser.daum = { Postcode };
  assert.equal(await loadPostcode(), Postcode);
  assert.equal(scripts.length, 0);
});
