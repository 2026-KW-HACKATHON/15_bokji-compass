import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { policyDeadline } from './deadlineModel.js';
import useSeoulToday from './useSeoulToday.js';
import './policy-deadline.css';

export default function PolicyDeadline({ policy, target = 'end' }) {
  const { t } = useI18n();
  const today = useSeoulToday();
  const opening = target === 'start';
  const { state, days } = policyDeadline(
    opening ? { applicationEnd: policy?.applicationStart } : policy,
    today,
  );
  if (opening && !['upcoming', 'today'].includes(state)) return null;
  const label =
    state === 'upcoming'
      ? t(opening ? '신청일까지 {count}일 남음' : '마감일까지 {count}일 남음', { count: days })
      : state === 'today'
        ? t(opening ? '오늘 신청 시작' : '오늘 신청 마감')
        : state === 'closed'
          ? t('접수 마감')
          : state === 'ongoing'
            ? t('상시 접수')
            : t('마감일 확인 필요');
  return (
    <span
      className={`policy-deadline ${state}${opening ? ' start' : ''}${!opening && state === 'upcoming' && days <= 7 ? ' urgent' : ''}`}
      aria-label={label}
      title={label}
    >
      {label}
    </span>
  );
}
