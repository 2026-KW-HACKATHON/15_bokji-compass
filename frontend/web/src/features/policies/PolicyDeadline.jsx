import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { policyDeadline } from './deadlineModel.js';
import useSeoulToday from './useSeoulToday.js';
import './policy-deadline.css';

export default function PolicyDeadline({
  policy,
  target = 'end',
  showContext = false,
  easy = false,
}) {
  const { t } = useI18n();
  const today = useSeoulToday();
  const opening = target === 'start';
  const { state, days } = policyDeadline(
    opening ? { applicationEnd: policy?.applicationStart } : policy,
    today,
  );
  if (opening && !['upcoming', 'today'].includes(state)) return null;
  const count = Math.abs(days || 0);
  const label =
    state === 'upcoming'
      ? opening
        ? t('신청 시작까지 D-{count}', { count })
        : showContext
          ? t('신청 마감까지 D-{count}', { count })
          : `D-${count}`
      : state === 'today'
        ? opening
          ? t('신청 시작 D-Day')
          : showContext
            ? t('신청 마감 D-Day')
            : 'D-Day'
        : state === 'closed'
          ? t('접수 마감 D+{count}', { count })
          : state === 'ongoing'
            ? t('상시 접수')
            : t('마감일 확인 필요');
  const description =
    state === 'upcoming'
      ? t(opening ? '신청 시작까지 {count}일 남음' : '신청 마감까지 {count}일 남음', { count })
      : state === 'today'
        ? t(opening ? '오늘 신청 시작' : '오늘 신청 마감')
        : state === 'closed'
          ? t('신청 마감 후 {count}일 지남', { count })
          : label;
  return (
    <span
      className={`policy-deadline ${state}${opening ? ' start' : ''}${!opening && state === 'upcoming' && days <= 7 ? ' urgent' : ''}`}
      aria-label={description}
      title={description}
    >
      {easy ? description : label}
    </span>
  );
}
