import { safeWebUrl } from '../../../../packages/core/src/safeUrl.js';
import { isCalendarDate } from '../calendar/calendarModel.js';

const stages = new Set(['application', 'followup', 'result']);
const identifier = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/.test(value);
const title = (value) => typeof value === 'string' && value.trim() && value.length <= 1000;

export const noticeStageLabels = Object.freeze({
  application: '신청 안내',
  followup: '신청자 추가 절차',
  result: '선발 결과',
});

export function parseNoticeStage(value) {
  return stages.has(value) ? value : null;
}

// Series metadata is optional. Invalid metadata must not hide the original notice.
export function parseNoticeGroup(value, policyId) {
  if (
    !value ||
    !identifier(value.id) ||
    !title(value.title) ||
    !parseNoticeStage(value.latestStage) ||
    !Number.isSafeInteger(value.noticeCount) ||
    value.noticeCount < 2 ||
    !Array.isArray(value.notices) ||
    value.notices.length < 2 ||
    value.notices.length > 64
  )
    return null;
  const seen = new Set();
  const notices = value.notices.flatMap((item) => {
    if (
      !item ||
      !identifier(item.id) ||
      seen.has(item.id) ||
      !title(item.title) ||
      !parseNoticeStage(item.stage)
    )
      return [];
    seen.add(item.id);
    return [
      {
        id: item.id,
        revisionId: identifier(item.revisionId) ? item.revisionId : null,
        title: item.title.trim(),
        stage: item.stage,
        publishedDate: isCalendarDate(item.publishedDate) ? item.publishedDate : null,
        sourceUrl: safeWebUrl(item.sourceUrl),
      },
    ];
  });
  if (notices.length < 2 || value.noticeCount < notices.length || !seen.has(policyId)) return null;
  return {
    id: value.id,
    title: value.title.trim(),
    latestStage: value.latestStage,
    noticeCount: value.noticeCount,
    notices,
  };
}

export function noticeDisplayStage(policy) {
  return policy.noticeGroup?.latestStage || parseNoticeStage(policy.noticeStage);
}

const applicationClosed = (stage, title) =>
  stage === 'result' && /(신청|접수|모집)\s*(마감|종료|완료)/.test(title || '');
const paymentNotice = (stage, title) =>
  stage === 'followup' && /지급\s*(?:\(\s*예정\s*\))?\s*(?:안내|일정|공고)/.test(title || '');

export function noticeStageLabel(stage, title = '') {
  return applicationClosed(stage, title)
    ? '모집 종료'
    : paymentNotice(stage, title)
      ? '지급 안내'
      : noticeStageLabels[stage] || '';
}

export function noticeStagePresentation(policy) {
  const stage = noticeDisplayStage(policy);
  const title = policy.noticeGroup?.notices.at(-1)?.title || policy.title;
  return {
    stage,
    label: noticeStageLabel(stage, title),
    note: applicationClosed(stage, title)
      ? '접수가 마감된 공고예요. 최신 접수 여부는 담당 기관에 확인해 주세요.'
      : stage === 'result'
        ? '선발 결과 안내예요. 새로 신청하는 공고가 아니에요.'
        : paymentNotice(stage, title)
          ? '지급 일정 안내예요. 지급 대상과 일정을 공식 공고에서 확인해 주세요.'
          : stage === 'followup'
            ? '이미 신청한 사람을 위한 추가 절차 안내예요.'
            : '',
  };
}

export function isApplicationNotice(policy, { grouped = false } = {}) {
  const stage = grouped ? noticeDisplayStage(policy) : parseNoticeStage(policy.noticeStage);
  return !stage || stage === 'application';
}
