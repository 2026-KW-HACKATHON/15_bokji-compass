import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLocalArea,
  initialLocalArea,
  startingLocalArea,
  localPolicySearch,
} from '../src/features/local/localModel.js';

test('local area parsing normalizes provinces and preserves city/district hierarchy', () => {
  for (const [text, expected] of [
    ['서울특별시 노원구 월계동', ['서울', '노원구', '월계동']],
    ['서울 노원구 월계1동', ['서울', '노원구', '월계1동']],
    ['경기도 수원시 영통구 이의동', ['경기', '수원시 영통구', '이의동']],
    ['제주특별자치도 제주시 애월읍', ['제주', '제주시', '애월읍']],
    ['강원특별자치도 홍천군 서면', ['강원', '홍천군', '서면']],
    ['전북특별자치도 완주군 삼례읍', ['전북', '완주군', '삼례읍']],
    ['세종특별자치시 한솔동', ['세종', '', '한솔동']],
    ['부산 강서구 대저1동', ['부산', '강서구', '대저1동']],
  ]) {
    const [region, district, neighborhood] = expected;
    assert.deepEqual(parseLocalArea(text), { region, district, neighborhood });
  }
  assert.deepEqual(parseLocalArea('노원구 월계동', '서울'), {
    region: '서울',
    district: '노원구',
    neighborhood: '월계동',
  });
  assert.deepEqual(parseLocalArea('서울'), { region: '서울', district: '', neighborhood: '' });
});

test('road addresses do not invent neighborhoods or mistake building details for them', () => {
  for (const suffix of ['', ' 101동 202호', ' 가동 202호', ' (101동, 202호)', ' (가동)']) {
    assert.deepEqual(parseLocalArea(`서울 노원구 월계로 123${suffix}`), {
      region: '서울',
      district: '노원구',
      neighborhood: '',
    });
  }
  assert.deepEqual(parseLocalArea('서울 노원구 월계로 123 (월계동, 테스트아파트) 101동 202호'), {
    region: '서울',
    district: '노원구',
    neighborhood: '월계동',
  });
  assert.deepEqual(parseLocalArea('서울 노원구 월계로 123 아파트동'), {
    region: '서울',
    district: '노원구',
    neighborhood: '',
  });
  assert.equal(parseLocalArea('월계로 123', '서울'), null);
  for (const value of [
    null,
    {},
    '',
    '  ',
    '노원구 월계동',
    '미지의지역',
    '서울\n노원구',
    'constructor 노원구',
    '__proto__ 노원구',
  ])
    assert.equal(parseLocalArea(value), null);
});

test('initial locality uses saved base addresses without copying personal address details', () => {
  const user = {
    region: '서울',
    address: '서울 노원구 월계로 123',
    address_detail: '월계동 101동 202호',
    postal_code: '01234',
  };
  const before = structuredClone(user);
  const area = initialLocalArea(user, { region: '부산' });
  assert.deepEqual(area, { region: '서울', district: '노원구', neighborhood: '' });
  assert.deepEqual(user, before);
  assert.deepEqual(Object.keys(area).sort(), ['district', 'neighborhood', 'region']);
  assert.deepEqual(initialLocalArea(null, { region: '서울' }), {
    region: '서울',
    district: '',
    neighborhood: '',
  });
  assert.deepEqual(initialLocalArea({ region: '서울' }, { region: '부산' }), {
    region: '서울',
    district: '',
    neighborhood: '',
  });
  assert.deepEqual(initialLocalArea(null, { region: '전국' }), {
    region: '',
    district: '',
    neighborhood: '',
  });
  assert.deepEqual(initialLocalArea({ region: 'invalid' }, { region: '경기' }), {
    region: '경기',
    district: '',
    neighborhood: '',
  });
});

test('priority area is a guest fallback and never overrides saved geography', () => {
  assert.deepEqual(startingLocalArea(null, null), { region: '서울', district: '노원구', neighborhood: '월계1동' });
  assert.deepEqual(startingLocalArea({ address: '부산 동래구 사직로 20', region: '부산' }, null), { region: '부산', district: '동래구', neighborhood: '' });
  assert.deepEqual(startingLocalArea(null, { region: '제주' }), { region: '제주', district: '', neighborhood: '' });
  assert.equal(parseLocalArea('서울 노원구 월계동').neighborhood, '월계동');
  assert.equal(parseLocalArea('서울 노원구 월계1동').neighborhood, '월계1동');
});

test('policy queries contain province and district only and require a district', () => {
  assert.deepEqual(localPolicySearch(parseLocalArea('서울 노원구 월계로 123 (월계동)')), {
    query: '노원구',
    region: '서울',
  });
  assert.deepEqual(localPolicySearch(parseLocalArea('경기 수원시 영통구 이의동')), {
    query: '수원시 영통구',
    region: '경기',
  });
  assert.equal(localPolicySearch(parseLocalArea('서울')), null);
  assert.equal(localPolicySearch(parseLocalArea('세종 한솔동')), null);
  assert.equal(localPolicySearch({ region: '서울', district: '노원구 월계로 123' }), null);
  assert.equal(localPolicySearch({ region: '전국', district: '노원구' }), null);
});
