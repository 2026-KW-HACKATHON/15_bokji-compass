import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from '../src/features/profile/profileModel.js';
import {
  profileRows,
  rowStatus,
  mergeProfileCategory,
  financeRows,
  financeInputStatus,
} from '../src/features/profile/profileSummary.js';
import { emptyFinancialProfile } from '../src/features/finance/financeModel.js';

test('profile summaries distinguish empty, partial and selected values, including age zero', () => {
  assert.equal(rowStatus(profileRows('life', null, defaultProfile)), '미입력');
  assert.equal(
    rowStatus(profileRows('life', null, { ...defaultProfile, occupation: '직장인' })),
    '일부 입력',
  );
  assert.equal(
    rowStatus(
      profileRows('life', null, {
        ...defaultProfile,
        occupation: '직장인',
        household: '혼자 살아요',
      }),
    ),
    '입력됨',
  );
  const user = { name: '테스트', age: 0, region: '서울', gender: 'undisclosed' };
  const rows = profileRows('basic', user, {
    ...defaultProfile,
    region: '서울',
    ageBand: '19세 미만',
  });
  assert.equal(rows.length, 4);
  assert.equal(rows.find(([label]) => label === '나이 (만 나이)')[1], '0세');
  assert.equal(rowStatus(rows), '입력됨');
});

test('saving an older tab draft preserves newer saves in other categories', () => {
  const draft = { ...defaultProfile, occupation: '학생', household: '가족과 살아요' };
  const latest = { ...defaultProfile, region: '부산', ageBand: '35~49세', interests: ['주거'] };
  const merged = mergeProfileCategory(latest, draft, 'life');
  assert.deepEqual(merged, { ...latest, occupation: '학생', household: '가족과 살아요' });
  assert.equal(latest.occupation, '선택하지 않음');
});

test('financial summaries count explicit zero as entered and unknown amounts as missing', () => {
  const finance = emptyFinancialProfile();
  finance.members[0].earned_income = 0;
  finance.assets.housing = 0;
  finance.debts.bank = 0;
  finance.vehicle_status = 'none';
  const rows = Object.fromEntries(financeRows(finance));
  assert.equal(rows['월 소득'], '1 / 4개 항목 입력');
  assert.equal(rows['재산·부채'], '2 / 7개 항목 입력');
  assert.equal(rows['차량'], '없음');
  assert.equal(financeInputStatus(finance), '일부 입력');
});
