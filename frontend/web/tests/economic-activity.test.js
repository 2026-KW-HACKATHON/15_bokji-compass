import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentOccupations,
  economicActivityGroup,
  householdLabel,
  occupationForGroup,
  occupationLabel,
} from '../src/features/profile/economicActivityModel.js';
import { defaultProfile, recommendationProfile } from '../src/features/profile/profileModel.js';
import { parseMonitoringProfile } from '../src/features/monitoring/monitoringModel.js';

test('broad category changes clear unrelated details and never infer a specific work status', () => {
  assert.equal(occupationForGroup('working', '직장인'), '직장인');
  assert.equal(occupationForGroup('not_working', '직장인'), null);
  assert.equal(occupationForGroup('working', '취업 준비 중'), null);
  assert.equal(occupationForGroup('student', '직장인'), '학생');
  assert.equal(occupationForGroup('other', '학생'), '기타');
  assert.equal(occupationForGroup('', '학생'), null);
});

test('new work details survive recommendation and monitoring contracts without assuming job search', () => {
  for (const occupation of ['무직', '프리랜서']) {
    assert.equal(recommendationProfile({ ...defaultProfile, occupation }).occupation, occupation);
    const profile = parseMonitoringProfile({ occupation });
    assert.equal(profile.occupation, occupation);
    assert.equal(profile.job_seeking, null);
    assert.equal(parseMonitoringProfile({ occupation, job_seeking: false }).job_seeking, false);
  }
  assert.equal(economicActivityGroup('무직'), 'not_working');
  assert.equal(economicActivityGroup('프리랜서'), 'working');
});

test('legacy retirement remains readable until edited, without appearing as a new selection', () => {
  assert.equal(currentOccupations.includes('은퇴 후'), false);
  assert.equal(economicActivityGroup('은퇴 후'), 'legacy');
  assert.equal(occupationLabel('은퇴 후'), '경제활동 상태 확인 필요');
  const saved = parseMonitoringProfile({ occupation: '은퇴 후', interests: ['주거'] });
  assert.equal(
    parseMonitoringProfile({ ...saved, household: '혼자 살아요' }).occupation,
    '은퇴 후',
  );
  assert.equal(occupationForGroup('not_working', saved.occupation), null);
});

test('formal labels retain the precise meaning of existing stored household and work values', () => {
  assert.equal(householdLabel('혼자 살아요'), '1인 가구');
  assert.equal(householdLabel('가족과 살아요'), '가족 동거 가구');
  assert.equal(occupationLabel('직장인'), '임금근로자');
  assert.equal(householdLabel(null), null);
  assert.equal(occupationLabel('선택하지 않음'), null);
});
