import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalServiceRepository, parseLocalServicePage } from '../src/features/local/localRepository.js';

const service = {
  id: 'fixture-bus', category: 'transport', title: '검증용 교통 안내', summary: '테스트용 서비스',
  area: '검증용 지역', audience: '공식 안내 확인', cost: '확인 필요', usage: '공식 안내 확인',
  sourceName: '테스트 기관', sourceUrl: 'https://example.gov.kr/service', checkedAt: '2026-10-08', sourcePublishedAt: null,
  evidence: '검증용 근거', coverage: [{ region: '서울', district: '노원구', scope: 'district', neighborhoods: [], neighborhoodType: null }], focusAreas: [],
};
const page = () => ({ items: [structuredClone(service)], total: 1, coverage: { regions: [{ region: '서울', district: '노원구', count: 1 }], totalServices: 1, totalDistricts: 1 }, focus: { region: '서울', district: '노원구', neighborhood: '월계1동' }, checkedAt: '2026-10-08' });

test('local repository transmits only locality fields and keeps request cancellation', async () => {
  const calls = [];
  const repository = createLocalServiceRepository({ request: async (...args) => { calls.push(args); return page(); } });
  const controller = new AbortController();
  const result = await repository.list({ region: '서울특별시', district: '노원구', neighborhood: '월계1동', category: 'care', scope: 'neighborhood', address: '서울 노원구 광운로 20', address_detail: '101동 202호', postal_code: '01234' }, { signal: controller.signal });
  const params = new URL(calls[0][0], 'https://example.test').searchParams;
  assert.deepEqual(Object.fromEntries(params), { region: '서울', district: '노원구', neighborhood: '월계1동', neighborhood_type: 'unknown', category: 'care', scope: 'neighborhood' });
  assert.equal(calls[0][1].signal, controller.signal);
  assert.equal(result.total, 1);
  assert.doesNotMatch(calls[0][0], /address|postal|01234|101/);
  await repository.list({ region: '세종', scope: 'neighborhood' });
  assert.equal(new URL(calls[1][0], 'https://example.test').searchParams.get('scope'), 'all');
  await assert.rejects(repository.list({ region: 'invalid', address: '서울 노원구' }), { code: 'invalid_region' });
});

test('malformed and unsafe public service responses fail rather than displaying partial data', () => {
  const changes = [
    (value) => { value.items[0].sourceUrl = 'javascript:alert(1)'; },
    (value) => { value.items[0].sourceUrl = 'https://user:secret@example.test/'; },
    (value) => { value.items[0].checkedAt = '2026-02-30'; },
    (value) => { value.items[0].coverage[0].scope = 'imagined'; },
    (value) => { value.items[0].focusAreas = [{ region: '서울', district: '노원구', neighborhood: '월계1동', neighborhoodType: 'guessed' }]; },
    (value) => { value.total = 42; },
    (value) => { value.coverage.totalServices = -1; },
    (value) => { value.items.push(structuredClone(value.items[0])); value.total = 2; },
  ];
  for (const change of changes) { const value = page(); change(value); assert.throws(() => parseLocalServicePage(value), { code: 'invalid_response' }); }
  assert.equal(parseLocalServicePage(page()).items[0].id, 'fixture-bus');
});
