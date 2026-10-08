import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import Icon from '../../shared/ui/Icon.jsx';
import PolicyIndicators from './PolicyIndicators.jsx';
import PolicyDeadline from './PolicyDeadline.jsx';
import { PolicySearchMatch } from './PolicySearchFeedback.jsx';
import {
  PolicyTranslationStatus,
  useVisibleTranslatedPolicy,
} from '../../shared/i18n/PolicyTranslation.jsx';
export default function PolicyCard({
  policy: original,
  saved,
  onSave,
  onOpen,
  onTag,
  easy = false,
  reason,
  showSearchMatch = false,
}) {
  const { t, intlLocale } = useI18n();
  const translation = useVisibleTranslatedPolicy(original);
  const { policy } = translation;

  if (easy) {
    return (
      <article ref={translation.ref} className="policy-card easy-policy-card">
        <div className="easy-card-content">
          <div className="policy-facts">
            <span className="category-label">{t(policy.category)}</span>
            <span>
              {t(policy.region)} · {policy.organization}
            </span>
            {saved && <span className="saved-label">{t('저장한 공고')}</span>}
          </div>
          <h3 className="card-title" tabIndex={-1}>
            {policy.title}
          </h3>
          <PolicyDeadline policy={original} easy />
          <PolicyTranslationStatus translation={translation} />
          {reason ? (
            <p className="easy-recommendation-reason">
              <span>{t('추천 이유')}</span> {reason}
            </p>
          ) : (
            <p className="card-summary">{policy.summary}</p>
          )}
          <p className="benefit">
            <span>{t('지원 내용')}</span> {policy.benefit}
          </p>
          <dl className="easy-policy-conditions">
            <div>
              <dt>{t('지원 대상')}</dt>
              <dd>{policy.audience}</dd>
            </div>
            <div>
              <dt>{t('신청 기간')}</dt>
              <dd>{policy.applicationPeriod || t('공식 공고에서 확인')}</dd>
            </div>
            {policy.paymentSchedule && (
              <div>
                <dt>{t('지급 시기')}</dt>
                <dd>{policy.paymentSchedule}</dd>
              </div>
            )}
          </dl>
          <PolicyIndicators policy={policy} />
          {showSearchMatch && <PolicySearchMatch match={policy.searchMatch} />}
        </div>
        <div className="easy-card-action">
          <button
            className="detail-link"
            onClick={() => onOpen(original)}
            aria-label={policy.title + t(' 자세히 보기')}
          >
            {' '}
            {t('자세히 보기')} <Icon name="arrow" size={18} />
          </button>
        </div>
      </article>
    );
  }
  return (
    <article ref={translation.ref} className="policy-card">
      <div className="card-top">
        <span className="policy-icon">
          <Icon name={policy.icon} size={25} />
        </span>
        <span className="category-label">{t(policy.category)}</span>
        <button
          className={'save-button ' + (saved ? 'is-saved' : '')}
          aria-label={policy.title + (saved ? t(' 저장 취소') : t(' 저장'))}
          aria-pressed={saved}
          onClick={() => onSave(original)}
        >
          <Icon name="bookmark" size={21} fill={saved ? 'currentColor' : 'none'} />
          <span>{saved ? t('저장됨') : t('저장')}</span>
        </button>
      </div>
      <p className="card-meta">
        {t(policy.region)} · {policy.organization}
      </p>
      <h3>
        <button className="card-title" onClick={() => onOpen(original)}>
          {policy.title}
        </button>
      </h3>
      <PolicyDeadline policy={original} />
      <PolicyTranslationStatus translation={translation} />
      {reason ? (
        <div className="recommendation-reason">
          <span>
            <Icon name="sparkles" size={17} /> {t('추천 이유')}{' '}
          </span>
          <p>{reason}</p>
        </div>
      ) : (
        <p className="card-summary">{policy.summary}</p>
      )}
      {policy.paymentSchedule && (
        <p className="card-meta">
          {t('지급 시기:')} {policy.paymentSchedule}
        </p>
      )}
      {reason && (
        <p className="card-meta">
          {t('신청 기간:')} {policy.applicationPeriod}
        </p>
      )}
      <PolicyIndicators policy={policy} />
      {showSearchMatch && <PolicySearchMatch match={policy.searchMatch} />}
      <div className="card-bottom">
        <div className="tags" aria-label={t('이 공고의 태그')}>
          {policy.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTag(tag)}
              aria-label={t(tag) + t(' 태그로 공고 찾기')}
            >
              #{t(tag)}
            </button>
          ))}
        </div>
        <button
          className="detail-link"
          onClick={() => onOpen(original)}
          aria-label={policy.title + t(' 자세히 보기')}
        >
          {' '}
          {t('자세히 보기')} <Icon name="arrow" size={18} />
        </button>
      </div>
    </article>
  );
}
