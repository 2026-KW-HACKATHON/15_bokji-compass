import { useI18n } from '../../shared/i18n/I18nProvider.jsx';
import { formatSignalDate } from './policyModel.js';

export default function PolicyIndicators({ policy }) {
  const { t, intlLocale } = useI18n();

  const { popularity, budget, budgetNotice } = policy;
  if (!popularity && !budget && !budgetNotice) return null;
  return (
    <dl className="policy-indicators">
      {popularity && (
        <div>
          <dt>
            {popularity.source === 'gov24' ? t('정부24') : t('복지로')} {t('누적 조회')}
          </dt>
          <dd>
            {popularity.views.toLocaleString(intlLocale)}
            {t('회')}{' '}
            {popularity.asOf && (
              <small>
                {new Intl.DateTimeFormat(intlLocale, {
                  timeZone: 'Asia/Seoul',
                  dateStyle: 'medium',
                }).format(new Date(popularity.asOf))}{' '}
                {t('수집')}
              </small>
            )}
          </dd>
        </div>
      )}
      {budget && (
        <div className="policy-budget">
          <dt>{t('공식 예산 소진율')}</dt>
          <dd>
            {budget.usedPercent.toLocaleString(intlLocale, { maximumFractionDigits: 1 })}%
            <progress value={budget.usedPercent} max="100" aria-label={t('공식 예산 소진율')} />
            <small>
              {budget.asOf
                ? t('{value1} 기준 · ', {
                    value1: new Intl.DateTimeFormat(intlLocale, {
                      timeZone: 'Asia/Seoul',
                      dateStyle: 'medium',
                    }).format(new Date(budget.asOf)),
                  })
                : t('기준일 미제공 · ')}
              <a
                href={budget.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={budget.evidence}
              >
                {' '}
                {t('공식 근거 확인')}{' '}
              </a>
            </small>
          </dd>
        </div>
      )}
      {budgetNotice && (
        <div>
          <dt>{t('예산 안내')}</dt>
          <dd>{budgetNotice}</dd>
        </div>
      )}
    </dl>
  );
}
