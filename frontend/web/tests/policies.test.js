import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPolicyRepository,
  filterPolicies,
} from '../src/features/policies/policyRepository.js';
import { createRecommendationRepository } from '../src/features/assistant/recommendationRepository.js';
import {
  parsePolicy,
  parsePolicyPage,
  safeSourceUrl,
} from '../src/features/policies/policyModel.js';
import {
  defaultProfile,
  isProfile,
  recommendationProfile,
} from '../src/features/profile/profileModel.js';
import { readStoredValue, writeStoredValue, removeStoredValue } from '../src/shared/storage.js';
import { resolveConfig } from '../src/shared/configModel.js';
import { ApiError, createHttpClient } from '../src/shared/api/httpClient.js';
import { demoPolicies } from './fixtures/policies.js';
const demo = { list: async () => ({ items: demoPolicies }) };
test('demo filtering combines words, tag, region and audience without mutating source', async () => {
  const { items } = await demo.list();
  const ids = items.map((item) => item.id);
  filterPolicies(items, { sort: 'name' });
  assert.deepEqual(
    items.map((item) => item.id),
    ids,
  );
  assert.equal(filterPolicies(items, { region: '서울' }).length, 4);
  assert.deepEqual(
    filterPolicies(items, {
      query: '청년 독립',
      category: '주거',
      region: '서울',
      audience: '청년',
    }).map((item) => item.id),
    ['fixture-housing'],
  );
  assert.equal(filterPolicies(items, { tag: '없는태그' }).length, 0);
  assert.equal(
    filterPolicies(items, { tag: items[0].tags[0] }).every((item) =>
      item.tags.includes(items[0].tags[0]),
    ),
    true,
  );
});
test('runtime demo data is no longer available', async () => {
  await assert.rejects(
    createPolicyRepository({ mode: 'demo' }).list(),
    (e) => e.code === 'configuration',
  );
});
test('API serializes exact tags and cursor, preserving words that are also filter defaults', async () => {
  let captured;
  const api = createPolicyRepository({
    mode: 'api',
    request: async (path) => {
      captured = path;
      return { items: [], total: 0, nextCursor: null };
    },
  });
  assert.equal(
    (
      await api.list(
        { query: '전체', tag: '전국', category: '전체', region: '전국' },
        { cursor: 'a+b/=', limit: 1 },
      )
    ).source,
    'api',
  );
  const params = new URL(captured, 'https://example.com').searchParams;
  assert.equal(params.get('q'), '전체');
  assert.equal(params.get('tag'), '전국');
  assert.equal(params.get('cursor'), 'a+b/=');
  assert.equal(params.get('limit'), '1');
  assert.equal(params.has('region'), false);
  assert.equal(params.has('category'), false);
});
test('API failures are propagated, never replaced with demo policies or recommendations', async () => {
  const request = async () => {
    throw new ApiError('unavailable', 'http', 404);
  };
  await assert.rejects(
    createPolicyRepository({ mode: 'api', request }).list(),
    (err) => err.status === 404,
  );
  await assert.rejects(
    createRecommendationRepository({ mode: 'api', request }).recommend(defaultProfile),
    (err) => err.status === 404,
  );
});
test('API sends the search, region and audience together and omits only default filters', async () => {
  const calls = [];
  const repository = createPolicyRepository({
    mode: 'api',
    request: async (path) => {
      calls.push(new URL(path, 'https://example.com').searchParams);
      return { items: [], total: 0, nextCursor: null };
    },
  });
  await repository.list({
    query: '돌봄 지원',
    category: '건강·돌봄',
    region: '충북',
    audience: '어르신',
  });
  assert.deepEqual(Object.fromEntries(calls[0]), {
    limit: '6',
    sort: 'popular',
    q: '돌봄 지원',
    category: '건강·돌봄',
    region: '충북',
    audience: '어르신',
  });
  await repository.list({
    query: '',
    category: '전체',
    region: '전국',
    audience: '전체',
  });
  assert.deepEqual(Object.fromEntries(calls[1]), {
    limit: '6',
    sort: 'popular',
  });
});
test('policy response validation and safe source links', async () => {
  const policy = (await demo.list()).items[0];
  assert.throws(
    () => parsePolicyPage({ items: [policy], total: 0, nextCursor: null }),
    /공고 목록/,
  );
  assert.throws(
    () => parsePolicyPage({ items: [policy, policy], total: 2, nextCursor: null }),
    /공고 목록/,
  );
  assert.throws(() => parsePolicyPage({ items: [], total: 0 }), /형식/);
  assert.throws(() => parsePolicy({ ...policy, tags: [1] }), /형식/);
  assert.equal(safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeSourceUrl('https://user:secret@example.com'), null);
  assert.equal(safeSourceUrl('https://example.com/notice'), 'https://example.com/notice');
  assert.equal(parsePolicy(policy).paymentSchedule, null);
  assert.equal(parsePolicy({ ...policy, paymentSchedule: 123 }).paymentSchedule, null);
  assert.equal(
    parsePolicy({ ...policy, paymentSchedule: '2026년 12월 초 지급 예정' }).paymentSchedule,
    '2026년 12월 초 지급 예정',
  );
});
test('profile schema rejects corruption and only selected fields enter recommendation payload', () => {
  assert.equal(isProfile(null), false);
  assert.equal(isProfile({ ...defaultProfile, region: '없는 지역' }), false);
  assert.equal(isProfile({ ...defaultProfile, interests: '주거' }), false);
  const value = recommendationProfile({
    ...defaultProfile,
    interests: ['주거', '주거'],
    password: 'must-not-send',
  });
  assert.deepEqual(value, {
    region: '전국',
    ageBand: null,
    occupation: null,
    household: null,
    interests: ['주거'],
  });
});
test('recommendation endpoint posts sanitized profile and renders server reasons', async () => {
  const policy = (await demo.list()).items[0];
  let call;
  const repository = createRecommendationRepository({
    mode: 'api',
    request: async (path, options) => {
      call = { path, ...options };
      return {
        items: [{ policy, reason: '서버 추천 이유' }],
        summary: '서버 요약',
      };
    },
  });
  const result = await repository.recommend({
    ...defaultProfile,
    password: 'excluded',
  });
  assert.equal(call.path, '/v1/recommendations');
  assert.equal(call.method, 'POST');
  assert.equal(call.body.limit, 3);
  assert.equal(call.body.profile.password, undefined);
  assert.equal(result.items[0].reason, '서버 추천 이유');
  const invalid = createRecommendationRepository({
    mode: 'api',
    request: async () => ({ summary: '', items: [{ policy, reason: '' }] }),
  });
  await assert.rejects(invalid.recommend(defaultProfile), (err) => err.code === 'invalid_response');
});
test('runtime demo recommendations are rejected', async () => {
  await assert.rejects(
    createRecommendationRepository({ mode: 'demo' }).recommend(defaultProfile),
    (e) => e.code === 'configuration',
  );
});
test('production defaults to API and runtime config can change address without rebuilding', () => {
  assert.equal(resolveConfig({}, {}, true).dataMode, 'api');
  assert.equal(resolveConfig({}, {}, false).dataMode, 'api');
  assert.equal(resolveConfig({}, { VITE_DATA_MODE: 'api' }, true).dataMode, 'api');
  assert.equal(
    resolveConfig({ dataMode: 'demo', apiBaseUrl: '/gateway' }, { VITE_DATA_MODE: 'api' })
      .apiBaseUrl,
    '/gateway',
  );
  assert.throws(() => resolveConfig({ dataMode: 'unknown' }));
  assert.throws(() => resolveConfig({ apiBaseUrl: '//other-host' }));
});
test('HTTP client sends JSON with no credentials and converts HTTP/JSON/network failures', async () => {
  let captured;
  const request = createHttpClient({
    baseUrl: '/api/',
    fetchImpl: async (url, options) => {
      captured = { url, ...options };
      return Response.json({ ok: true });
    },
  });
  await request('/v1/recommendations', {
    method: 'POST',
    body: { profile: {} },
  });
  assert.equal(captured.url, '/api/v1/recommendations');
  assert.equal(captured.credentials, 'omit');
  assert.deepEqual(JSON.parse(captured.body), { profile: {} });
  for (const [fetchImpl, code] of [
    [async () => new Response('', { status: 503 }), 'http'],
    [async () => new Response('<html>'), 'invalid_response'],
    [
      async () => {
        throw new Error('private server information');
      },
      'network',
    ],
  ]) {
    await assert.rejects(
      createHttpClient({ fetchImpl })('/test'),
      (err) => err.code === code && !err.message.includes('private'),
    );
  }
});
test('HTTP timeout and cancellation are distinct', async () => {
  const fetchImpl = (_, { signal }) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) reject(new Error('aborted'));
      else
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
    });
  await assert.rejects(
    createHttpClient({ fetchImpl, timeout: 5 })('/test'),
    (err) => err.code === 'timeout',
  );
  const controller = new AbortController();
  const pending = createHttpClient({ fetchImpl })('/test', {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, (err) => err.code === 'aborted');
});
test('storage tolerates corruption and reports write or removal failures', () => {
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = {
      getItem: () => '{broken',
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    assert.deepEqual(readStoredValue('test', [], Array.isArray), []);
    globalThis.localStorage.getItem = () => '123';
    assert.deepEqual(readStoredValue('test', [], Array.isArray), []);
    assert.equal(writeStoredValue('test', []), false);
    assert.equal(removeStoredValue('test'), false);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
