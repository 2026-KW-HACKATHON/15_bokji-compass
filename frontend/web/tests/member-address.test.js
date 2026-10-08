import test from 'node:test';
import assert from 'node:assert/strict';
import { memberAddressError, selectedMemberAddress } from '../src/features/auth/postcode.js';
import { profileRows } from '../src/features/profile/profileSummary.js';
import { defaultProfile } from '../src/features/profile/profileModel.js';

const selected = {
  zonecode: '03000',
  sido: '서울',
  userSelectedType: 'R',
  roadAddress: '서울 종로구 테스트로 1',
  jibunAddress: '서울 종로구 테스트동 1',
};

test('selected road or lot addresses preserve postcode zeros and normalize province aliases', () => {
  assert.deepEqual(selectedMemberAddress(selected), {
    region: '서울',
    postal_code: '03000',
    address: selected.roadAddress,
    address_detail: '',
  });
  assert.equal(
    selectedMemberAddress({ ...selected, userSelectedType: 'J' }).address,
    selected.jibunAddress,
  );
  for (const [sido, region] of [
    ['서울특별시', '서울'],
    ['강원특별자치도', '강원'],
    ['전북특별자치도', '전북'],
    ['세종특별자치시', '세종'],
    ['제주특별자치도', '제주'],
  ]) {
    assert.equal(selectedMemberAddress({ ...selected, sido }).region, region);
  }
  assert.throws(() => selectedMemberAddress({ ...selected, sido: '알 수 없는 지역' }));
  assert.throws(() => selectedMemberAddress({ ...selected, zonecode: '3000' }));
});

test('old region-only members remain valid but partial and malformed addresses cannot save', () => {
  assert.equal(memberAddressError({ region: '서울' }), '');
  assert.equal(memberAddressError({ postal_code: '', address: '', address_detail: '' }), '');
  const address = selectedMemberAddress(selected);
  assert.equal(memberAddressError(address), '');
  assert.equal(memberAddressError({ ...address, address_detail: '101동 202호' }), '');
  assert.ok(memberAddressError({ ...address, postal_code: '１２３４５' }));
  assert.ok(memberAddressError({ ...address, address: ' ' }));
  assert.ok(memberAddressError({ address_detail: '101호' }));
  assert.ok(memberAddressError({ ...address, address_detail: '101호\n202호' }));
  assert.ok(memberAddressError({ ...address, address_detail: '가'.repeat(201) }));
});

test('account summaries show exact addresses while visitor summaries remain broad', () => {
  const user = {
    ...selectedMemberAddress(selected),
    address_detail: '101호',
    gender: 'undisclosed',
  };
  const rows = Object.fromEntries(profileRows('basic', user, defaultProfile));
  assert.equal(rows['거주 주소'], `${selected.roadAddress} 101호`);
  assert.equal(rows['우편번호'], '03000');
  const visitor = Object.fromEntries(
    profileRows('basic', null, { ...defaultProfile, region: '서울' }),
  );
  assert.equal(visitor['거주 지역'], '서울');
  assert.equal(visitor['거주 주소'], undefined);
});
