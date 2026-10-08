import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy } from '../src/features/policies/policyModel.js';
import {
  isApplicationNotice,
  noticeDisplayStage,
  noticeStageLabel,
  noticeStagePresentation,
  parseNoticeGroup,
  parseNoticeStage,
} from '../src/features/policies/noticeSeriesModel.js';
import { translate } from '../../packages/core/src/i18n/index.js';

const notices = ['application', 'followup', 'result'].map((stage, index) => ({
  id: `notice:kw-${index}`,
  revisionId: `revision-${index}`,
  title: `${stage} 공식 공고`,
  stage,
  publishedDate: `2026-08-0${index + 1}`,
  sourceUrl: `https://www.kw.ac.kr/notice/${index}`,
}));
const group = {
  id: 'kw-2026-2-work-study',
  title: '광운대학교 2026년 2학기 국가근로장학금',
  latestStage: 'result',
  noticeCount: 3,
  notices,
};
const original = {
  id: notices[0].id,
  title: notices[0].title,
  summary: '공식 안내',
  tags: [],
};

test('older policies retain their title and application behavior without series metadata', () => {
  const policy = parsePolicy(original);
  assert.equal(policy.title, original.title);
  assert.equal(policy.noticeStage, null);
  assert.equal(policy.noticeGroup, null);
  assert.equal(isApplicationNotice(policy, { grouped: true }), true);
});

test('a grouped result changes list status while retaining original application details', () => {
  const policy = parsePolicy({ ...original, noticeStage: 'application', noticeGroup: group });
  assert.equal(policy.title, original.title);
  assert.equal(policy.noticeGroup.title, group.title);
  assert.deepEqual(policy.noticeGroup.notices, notices);
  assert.equal(noticeDisplayStage(policy), 'result');
  assert.equal(isApplicationNotice(policy, { grouped: true }), false);
  assert.equal(isApplicationNotice(policy), true);
  assert.equal(isApplicationNotice({ noticeStage: 'followup' }), false);
  assert.equal(isApplicationNotice({ noticeStage: 'result' }), false);
});

test('invalid groups fall back to the original notice rather than invalidating the whole list', () => {
  for (const invalid of [
    { ...group, id: '../unsafe' },
    { ...group, title: '' },
    { ...group, latestStage: 'invented' },
    { ...group, noticeCount: 1 },
    { ...group, noticeCount: 2 },
    { ...group, notices: [notices[0]] },
    { ...group, notices: [notices[0], notices[0]] },
    { ...group, notices: [notices[1], notices[2]] },
  ]) {
    assert.equal(parseNoticeGroup(invalid, original.id), null);
    assert.equal(parsePolicy({ ...original, noticeGroup: invalid }).title, original.title);
  }
  assert.equal(parseNoticeStage('result'), 'result');
  assert.equal(parseNoticeStage('javascript:alert(1)'), null);
});

test('series links, dates and revisions are validated independently from plain text titles', () => {
  const value = {
    ...group,
    notices: [
      notices[0],
      {
        ...notices[1],
        title: '<img src=x onerror=alert(1)>',
        revisionId: '../secret',
        publishedDate: '2026-02-30',
        sourceUrl: 'javascript:alert(1)',
      },
      { ...notices[2], sourceUrl: 'https://user:password@example.org/' },
      notices[2],
    ],
  };
  const parsed = parseNoticeGroup(value, original.id);
  assert.equal(parsed.notices.length, 3);
  assert.equal(parsed.notices[1].title, '<img src=x onerror=alert(1)>');
  assert.equal(parsed.notices[1].sourceUrl, null);
  assert.equal(parsed.notices[1].publishedDate, null);
  assert.equal(parsed.notices[1].revisionId, null);
  assert.equal(parsed.notices[2].sourceUrl, null);
});

test('group stage labels and count summaries have translations for every supported locale', () => {
  for (const locale of ['en', 'zh', 'vi', 'ja']) {
    for (const label of ['신청 안내', '신청자 추가 절차', '선발 결과', '모집 종료', '지급 안내'])
      assert.notEqual(translate(locale, label), label);
    assert.notEqual(translate(locale, '관련 공고 {count}개', { count: 3 }), '관련 공고 3개');
  }
});

test('payment guidance stays distinct from selection, consent and new application notices', () => {
  for (const title of [
    '2026년 2학기 국가장학금 1차 지급 안내',
    '국가장학금 2차 지급(예정) 안내',
    '국가장학금 3차 지급 일정',
    '국가장학금 4차 지급 공고',
  ]) {
    const policy = { noticeStage: 'followup', title };
    assert.equal(noticeStageLabel('followup', title), '지급 안내');
    assert.match(noticeStagePresentation(policy).note, /지급 대상과 일정/);
    assert.equal(isApplicationNotice(policy, { grouped: true }), false);
  }
  for (const [stage, title, expected] of [
    ['result', '국가장학금 선발 결과 및 지급 일정 안내', '선발 결과'],
    ['followup', '국가장학금 가구원 동의 안내', '신청자 추가 절차'],
    ['application', '국가장학금 신청 및 지급 안내', '신청 안내'],
    ['application', '국가장학금 2차 신청 안내', '신청 안내'],
  ])
    assert.equal(noticeStageLabel(stage, title), expected);
  assert.equal(
    isApplicationNotice({ noticeStage: 'application', title: '국가장학금 신청 및 지급 안내' }),
    true,
  );
  const latest = { ...notices[2], stage: 'followup', title: '국가장학금 4차 지급 안내' };
  const policy = {
    ...original,
    noticeStage: 'application',
    noticeGroup: { ...group, latestStage: 'followup', notices: [...notices.slice(0, 2), latest] },
  };
  assert.equal(noticeStagePresentation(policy).label, '지급 안내');
  assert.equal(isApplicationNotice(policy, { grouped: true }), false);
  for (const locale of ['en', 'zh', 'vi', 'ja'])
    assert.notEqual(
      translate(locale, noticeStagePresentation(policy).note),
      noticeStagePresentation(policy).note,
    );
});

test('an explicit recruitment closure is not described as a selection result', () => {
  for (const title of [
    '국가근로장학금 신청 마감 안내',
    '장학생 모집 종료',
    '근로장학금 접수완료',
  ]) {
    assert.equal(noticeStageLabel('result', title), '모집 종료');
    assert.match(noticeStagePresentation({ noticeStage: 'result', title }).note, /접수가 마감된/);
  }
  assert.equal(noticeStageLabel('result', '장학생 선발 확정 안내'), '선발 결과');
  assert.equal(noticeStageLabel('application', '장학생 신청 마감일 안내'), '신청 안내');
  const policy = {
    ...original,
    noticeStage: 'application',
    noticeGroup: {
      ...group,
      notices: [...notices.slice(0, 2), { ...notices[2], title: '접수 마감 안내' }],
    },
  };
  assert.equal(noticeStagePresentation(policy).label, '모집 종료');
  assert.equal(isApplicationNotice(policy, { grouped: true }), false);
});
