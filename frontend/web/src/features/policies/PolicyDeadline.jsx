import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { policyDeadline } from './deadlineModel.js';
import useSeoulToday from './useSeoulToday.js';
import './policy-deadline.css';

export default function PolicyDeadline({ policy }) {
  const { t } = useI18n();
  const today = useSeoulToday();
  const { state, days } = policyDeadline(policy, today);
  const count = Math.abs(days || 0);
  const label =
    state === 'upcoming'
      ? `D-${count}`
      : state === 'today'
        ? 'D-Day'
        : state === 'closed'
          ? t('마감 D+{count}', { count })
          : state === 'ongoing'
            ? t('상시 접수')
            : t('마감일 확인 필요');
  const description =
    state === 'upcoming'
      ? t('신청 마감까지 {count}일 남음', { count })
      : state === 'today'
        ? t('오늘 신청 마감')
        : state === 'closed'
          ? t('신청 마감 후 {count}일 지남', { count })
          : label;
  return (
    <span
      className={`policy-deadline ${state}${state === 'upcoming' && days <= 7 ? ' urgent' : ''}`}
      aria-label={description}
      title={description}
    >
      {label}
    </span>
  );
}
